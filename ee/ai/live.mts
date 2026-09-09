/**
 * Vérification bout en bout de l'assistant, contre le vrai fournisseur et la
 * vraie base de démonstration.
 *
 *   set -a && . ./.env && set +a
 *   pnpm --filter @openhelpdesk/ee-ai run live
 *
 * `check.mts` teste ce qui se teste sans réseau (rédaction, arithmétique du
 * coût). Celui-ci fait l'inverse : il appelle vraiment le modèle, et c'est le
 * seul moyen de savoir si un agent obtiendrait quelque chose d'utile. Il a
 * trouvé deux défauts qu'aucun test hors-ligne n'aurait vus — des sorties
 * entièrement françaises sur un ticket anglais (les règles du prompt étaient
 * en français), et un brouillon qui commentait le matériau au lieu de refuser.
 *
 * **Il écrit.** Il allume l'assistant sur le workspace `acme` et indexe ce que
 * l'espace autorise. Il ne poste aucun message : le fil #4821 reste celui du
 * seed.
 */
import { and, eq } from "drizzle-orm";
import { aiCalls, aiDeflections, aiDocuments, contacts, db, tenants, tickets } from "@openhelpdesk/db";
import { instanceProvider } from "./src/provider";
import { reindexWorkspace } from "./src/knowledge";
import { getAiSettings, sweepDeflections } from "./src/governance";
import { saveAiSettings } from "./src/settings";
import { draftReply, summarizeThread, suggestMacro, triageTicket } from "./src/capabilities";

const provider = instanceProvider();
if (!provider) throw new Error("AI_API_BASE / AI_MODEL absents du .env");
console.log(`fournisseur : ${provider.label} · ${provider.model} · embeddings ${provider.embedModel}`);

const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "acme"));
if (!tenant) throw new Error("workspace de démo acme introuvable");
const actor = { kind: "agent" as const, userId: null, name: "vérification" };

await saveAiSettings(tenant.id, {
  enabled: true,
  capabilities: {},
  sources: { kb: true, macros: true, resolvedTickets: true, internalNotes: false },
});
console.log("réglages :", JSON.stringify(await getAiSettings(tenant.id)));

console.log("\n— indexation de ce que l'espace autorise");
const idx = await reindexWorkspace(provider, tenant.id, {
  kb: true, macros: true, resolvedTickets: true, internalNotes: false,
}, actor);
console.log(`  ${idx.indexed} documents indexés, ${idx.removed} retirés`);
const bySource = await db.select({ source: aiDocuments.source }).from(aiDocuments)
  .where(eq(aiDocuments.tenantId, tenant.id));
const counts: Record<string, number> = {};
for (const d of bySource) counts[d.source] = (counts[d.source] ?? 0) + 1;
console.log("  par source :", JSON.stringify(counts));

const [ticket] = await db.select().from(tickets)
  .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.number, 4821)));
if (!ticket) throw new Error("ticket #4821 introuvable");
console.log(`\nticket #${ticket.number} — « ${ticket.subject} »`);

const before = Date.now();

console.log("\n— triage");
const tri = await triageTicket(provider, tenant.id, ticket.id, actor);
console.log(tri.ok ? `  ${JSON.stringify(tri.value)}` : `  refusé : ${tri.reason}`);

console.log("\n— résumé du fil");
const sum = await summarizeThread(provider, tenant.id, ticket.id, actor);
console.log(sum.ok ? `  ${sum.value}` : `  refusé : ${sum.reason}`);

console.log("\n— brouillon de réponse");
const draft = await draftReply(provider, tenant.id, ticket.id, actor);
if (draft.ok) {
  console.log(`  ${draft.value.text.replace(/\n/g, "\n  ")}`);
  console.log(`  sources : ${draft.value.sources.map((s) => `${s.source}/${s.title}`).join(" · ") || "(aucune)"}`);
} else {
  console.log(`  refusé : ${draft.reason}`);
}

console.log("\n— macro suggérée");
const macro = await suggestMacro(provider, tenant.id, ticket.id, actor);
console.log(macro.ok ? `  ${macro.value.title} (score ${macro.value.score.toFixed(3)})` : `  refusé : ${macro.reason}`);

console.log("\n— règlement des déflexions à 72 h");
/*
 * Ce bloc existe à cause d'un bug qu'aucun test hors-ligne n'a vu : les trois
 * comparaisons de dates de `sweepDeflections` passaient par un `sql` brut, qui
 * ne traverse pas l'encodeur de la colonne. La `Date` partait sous sa forme
 * `toString()` — « Wed Sep 09 2026 … (Coordinated Universal Time) » — que
 * Postgres refuse. Le balayage échouait donc **à chaque heure**, en silence,
 * sur la staging comme en CI, depuis sa mise en service.
 *
 * Un balayage sur une base vide ne prouve rien : la requête doit trouver
 * quelque chose pour que les deux requêtes suivantes s'exécutent aussi. On pose
 * donc une déflexion provisoire échue, et on la reprend après.
 */
const [contact] = await db
  .select({ id: contacts.id })
  .from(contacts)
  .where(eq(contacts.tenantId, tenant.id))
  .limit(1);
const [posed] = await db
  .insert(aiDeflections)
  .values({
    tenantId: tenant.id,
    contactId: contact?.id ?? null,
    surface: "portal",
    locale: "en",
    question: "vérification du règlement",
    sources: [],
    status: "provisional",
    confirmAfter: new Date(Date.now() - 60_000),
  })
  .returning();
const settled = await sweepDeflections();
const [after] = await db
  .select({ status: aiDeflections.status })
  .from(aiDeflections)
  .where(eq(aiDeflections.id, posed!.id));
console.log(`  ${JSON.stringify(settled)} — la ligne posée est « ${after?.status} »`);
if (after?.status === "provisional") {
  console.log("  ✗ le balayage n'a rien réglé");
} else {
  console.log("  ✓ réglée");
}
await db.delete(aiDeflections).where(eq(aiDeflections.id, posed!.id));

const calls = await db.select().from(aiCalls).where(eq(aiCalls.tenantId, tenant.id));
const recent = calls.filter((c) => c.createdAt.getTime() >= before - 60_000);
const micros = recent.reduce((n, c) => n + c.costMicros, 0);
console.log(`\njournal : ${recent.length} appels, ${micros} µ€ = ${(micros / 1_000_000).toFixed(6)} €`);
for (const c of recent) {
  console.log(`  ${c.capability.padEnd(14)} ${String(c.status).padEnd(8)} ${c.inputTokens}→${c.outputTokens} jetons  ${c.costMicros} µ€  ${c.durationMs} ms  masqué ${JSON.stringify(c.redactions)}`);
}
process.exit(0);
