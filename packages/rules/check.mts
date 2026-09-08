/**
 * Le contrôle qui aurait attrapé la boucle des règles planifiées.
 *
 *   set -a && . ./.env && set +a
 *   pnpm --filter @openhelpdesk/rules run check
 *
 * Il tourne contre la base locale et il écrit : un espace jetable, un ticket
 * jetable, une règle jetable, tout supprimé à la fin. Le workspace de
 * démonstration n'est pas touché.
 *
 * Ce qu'il vérifie est précisément ce qui a échappé au typage et à la relecture :
 * une règle planifiée dont la seule action est un effet de bord — un email —
 * n'écrit rien dans le ticket, donc `updated_at` ne bouge pas, donc la
 * condition « 48 h depuis la mise à jour » reste vraie au passage suivant. En
 * production cela a donné 32 094 exécutions sur 7 tickets en quinze jours, un
 * email au client à chaque fois.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  automationRules,
  automationRuns,
  contacts,
  db,
  ticketMessages,
  tickets,
  tenants,
} from "@openhelpdesk/db";
import { runScheduledRules } from "./src/engine";

let ok = 0;
let ko = 0;
const t = (name: string, cond: boolean, got?: unknown) => {
  if (cond) {
    ok++;
    console.log(`  ✓ ${name}`);
  } else {
    ko++;
    console.log(`  ✗ ${name}${got !== undefined ? ` — obtenu : ${JSON.stringify(got)}` : ""}`);
  }
};

const HOUR = 3_600_000;
const slug = `rules-check-${Date.now()}`;

const [tenant] = await db
  .insert(tenants)
  .values({ slug, name: "Contrôle des règles", locale: "en" })
  .returning();
if (!tenant) throw new Error("espace de test non créé");

async function cleanup() {
  await db.delete(tenants).where(eq(tenants.id, tenant!.id));
}

try {
  const [contact] = await db
    .insert(contacts)
    .values({ tenantId: tenant.id, email: `client@${slug}.example`, name: "Client", locale: "en" })
    .returning();

  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId: tenant.id,
      number: 1,
      subject: "Silence depuis trois jours",
      status: "open",
      priority: "normal",
      channel: "email",
      requesterId: contact!.id,
    })
    .returning();

  /* Le ticket n'a pas bougé depuis 72 h : la condition est vraie. */
  const stale = new Date(Date.now() - 72 * HOUR);
  await db.update(tickets).set({ updatedAt: stale }).where(eq(tickets.id, ticket!.id));

  /* La règle du bug : planifiée, et sa seule action est un email. Elle
     n'écrit rien dans le ticket, donc rien ne l'arrête d'elle-même. */
  const [rule] = await db
    .insert(automationRules)
    .values({
      tenantId: tenant.id,
      name: "Relance après 48 h",
      kind: "scheduled",
      active: true,
      position: 1,
      conditionsAll: [{ field: "hours_since_updated", operator: "gte", value: "48" }],
      conditionsAny: [],
      actions: [{ type: "email_contact", value: "Toujours bloqué sur ce sujet ?" }],
    })
    .returning();

  const runs = async () => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(automationRuns)
      .where(and(eq(automationRuns.ruleId, rule!.id), eq(automationRuns.ticketId, ticket!.id)));
    return row?.n ?? 0;
  };

  console.log("\nUne règle planifiée qui n'envoie qu'un email");
  await runScheduledRules();
  t("elle agit au premier passage", (await runs()) === 1, await runs());

  await runScheduledRules();
  await runScheduledRules();
  t("elle n'agit plus aux passages suivants", (await runs()) === 1, await runs());

  const events = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ticketMessages)
    .where(and(eq(ticketMessages.ticketId, ticket!.id), eq(ticketMessages.kind, "system_event")));
  t("un seul événement dans le fil", events[0]?.n === 1, events[0]?.n);

  console.log("\nLe client répond, puis se tait de nouveau");
  /*
   * La garde doit se réarmer : une relance qui ne repart jamais n'est pas une
   * relance.
   *
   * La chronologie compte, et deux versions de ce contrôle s'y sont trompées
   * avant celle-ci. Il ne suffit pas de reculer le ticket — cela place la
   * réponse du client *avant* l'exécution précédente, ce qu'aucune réponse ne
   * fait. Et il ne suffit pas d'avancer l'horloge de l'évaluation — cela met
   * `updated_at` dans le futur, où `created_at` de la ligne d'exécution (posé
   * par la base au moment de l'insertion) ne peut pas le dépasser, et la garde
   * paraît cassée alors qu'elle ne l'est pas.
   *
   * On reconstruit donc la vraie suite, entièrement dans le passé : relance à
   * T+48 h, réponse du client à T+50 h, évaluation maintenant. C'est la seule
   * mise en scène qui interroge le code et non l'horloge.
   */
  await db
    .update(automationRuns)
    .set({ createdAt: new Date(Date.now() - 52 * HOUR) })
    .where(and(eq(automationRuns.ruleId, rule!.id), eq(automationRuns.ticketId, ticket!.id)));
  await db
    .update(tickets)
    .set({ updatedAt: new Date(Date.now() - 50 * HOUR) })
    .where(eq(tickets.id, ticket!.id));

  await runScheduledRules();
  t("elle agit une seconde fois", (await runs()) === 2, await runs());
  await runScheduledRules();
  t("puis se tait de nouveau", (await runs()) === 2, await runs());

  console.log("\nUne règle qui change le ticket");
  await db.update(automationRules).set({ active: false }).where(eq(automationRules.id, rule!.id));
  const [closer] = await db
    .insert(automationRules)
    .values({
      tenantId: tenant.id,
      name: "Clôture après 48 h",
      kind: "scheduled",
      active: true,
      position: 2,
      conditionsAll: [{ field: "hours_since_updated", operator: "gte", value: "48" }],
      conditionsAny: [],
      actions: [{ type: "set_status", value: "closed" }],
    })
    .returning();
  await db
    .update(tickets)
    .set({ status: "open", updatedAt: new Date(Date.now() - 72 * HOUR) })
    .where(eq(tickets.id, ticket!.id));
  await runScheduledRules();
  await runScheduledRules();
  const [closerRuns] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(automationRuns)
    .where(eq(automationRuns.ruleId, closer!.id));
  t("elle agit une fois et une seule", closerRuns?.n === 1, closerRuns?.n);

  console.log(`\n${ok} vérifications passées, ${ko} échouées`);
} finally {
  await cleanup();
}

process.exit(ko === 0 ? 0 : 1);
