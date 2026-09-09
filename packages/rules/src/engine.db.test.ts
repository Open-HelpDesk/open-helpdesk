import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { runScheduledRules } from "./engine";

/**
 * Les règles planifiées, contre une vraie base.
 *
 *   docker compose -f docker/docker-compose.yml up -d && pnpm db:migrate
 *   pnpm test:db
 *
 * Ce fichier existe à cause d'un incident : une règle de relance avait tiré
 * **32 094 fois sur 7 tickets** en quinze jours sur la staging, avec un email au
 * client à chaque passage. La cause n'était pas visible par le typage. Les
 * conditions d'une règle planifiée restent vraies tant que la situation dure, et
 * ce qui arrêtait une règle n'était qu'un accident : elle se taisait seulement si
 * ses propres actions modifiaient le ticket. Une action à pur effet de bord — un
 * email — n'écrit rien, donc `updated_at` ne bougeait pas, donc elle recommençait
 * cinq minutes plus tard, indéfiniment.
 *
 * Il écrit dans un espace jetable et le supprime après : le workspace de
 * démonstration n'est pas touché.
 */
const HOUR = 3_600_000;

let tenantId: string;
let ticketId: string;
let reminderId: string;

beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ slug: `rules-test-${Date.now()}`, name: "Règles — test", locale: "en" })
    .returning();
  if (!tenant) throw new Error("espace de test non créé — la base est-elle migrée ?");
  tenantId = tenant.id;

  const [contact] = await db
    .insert(contacts)
    .values({ tenantId, email: `client-${Date.now()}@example.test`, name: "Client", locale: "en" })
    .returning();

  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId,
      number: 1,
      subject: "Silence depuis trois jours",
      status: "open",
      priority: "normal",
      channel: "email",
      requesterId: contact!.id,
    })
    .returning();
  ticketId = ticket!.id;

  const [rule] = await db
    .insert(automationRules)
    .values({
      tenantId,
      name: "Relance après 48 h",
      kind: "scheduled",
      active: true,
      position: 1,
      conditionsAll: [{ field: "hours_since_updated", operator: "gte", value: "48" }],
      conditionsAny: [],
      /* L'action du bug : elle n'écrit rien dans le ticket. */
      actions: [{ type: "email_contact", value: "Toujours bloqué sur ce sujet ?" }],
    })
    .returning();
  reminderId = rule!.id;
});

afterAll(async () => {
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
});

async function runsFor(ruleId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(automationRuns)
    .where(and(eq(automationRuns.ruleId, ruleId), eq(automationRuns.ticketId, ticketId)));
  return row?.n ?? 0;
}

/** Le ticket n'a pas bougé depuis 72 h : la condition est vraie. */
async function staleBy(hours: number): Promise<void> {
  await db
    .update(tickets)
    .set({ updatedAt: new Date(Date.now() - hours * HOUR) })
    .where(eq(tickets.id, ticketId));
}

describe("a scheduled rule whose only action is a side effect", () => {
  it("acts on the first sweep, and not on the ones after", async () => {
    await staleBy(72);

    await runScheduledRules();
    expect(await runsFor(reminderId)).toBe(1);

    await runScheduledRules();
    await runScheduledRules();
    expect(await runsFor(reminderId)).toBe(1);

    const [events] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(ticketMessages)
      .where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.kind, "system_event")));
    expect(events?.n).toBe(1);
  });

  it("becomes eligible again once the customer replies and goes quiet", async () => {
    /*
     * La chronologie est le piège, et deux versions de ce test s'y sont
     * trompées avant celle-ci. Reculer le ticket place la réponse du client
     * *avant* l'exécution précédente, ce qu'aucune réponse ne fait. Avancer
     * l'horloge de l'évaluation met `updated_at` dans le futur, où le
     * `created_at` de la ligne d'exécution — posé par la base à l'insertion —
     * ne peut pas le dépasser, et la garde paraît cassée alors qu'elle tient.
     *
     * On reconstruit donc la vraie suite, entièrement dans le passé : relance à
     * T+48 h, réponse du client à T+50 h, évaluation maintenant.
     */
    await db
      .update(automationRuns)
      .set({ createdAt: new Date(Date.now() - 52 * HOUR) })
      .where(and(eq(automationRuns.ruleId, reminderId), eq(automationRuns.ticketId, ticketId)));
    await staleBy(50);

    await runScheduledRules();
    expect(await runsFor(reminderId)).toBe(2);

    await runScheduledRules();
    expect(await runsFor(reminderId)).toBe(2);
  });
});

describe("a scheduled rule that changes the ticket", () => {
  it("acts once and once only", async () => {
    // The control case: this one stopped itself even before the guard existed,
    // because setting a status makes the condition stop matching. Both families
    // must behave the same now, and only one of them used to.
    await db
      .update(automationRules)
      .set({ active: false })
      .where(eq(automationRules.id, reminderId));

    const [closer] = await db
      .insert(automationRules)
      .values({
        tenantId,
        name: "Clôture après 48 h",
        kind: "scheduled",
        active: true,
        position: 2,
        conditionsAll: [{ field: "hours_since_updated", operator: "gte", value: "48" }],
        conditionsAny: [],
        actions: [{ type: "set_status", value: "closed" }],
      })
      .returning();

    await db.update(tickets).set({ status: "open" }).where(eq(tickets.id, ticketId));
    await staleBy(72);

    await runScheduledRules();
    await runScheduledRules();
    expect(await runsFor(closer!.id)).toBe(1);
  });
});
