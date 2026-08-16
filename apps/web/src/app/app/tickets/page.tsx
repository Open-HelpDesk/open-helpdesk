import { getTenantSlug } from "@/lib/tenant";

/**
 * AG-03 — Inbox : file de tickets. Squelette Lot 0 ; l'écran réel arrive au Lot 1
 * (specs/10-ecrans-espace-agent.md, maquette design/Open HelpDesk - Espace agent.html).
 */
export default async function TicketsPage() {
  const slug = await getTenantSlug();
  return (
    <main className="min-h-screen p-8">
      <p
        className="mb-2 font-mono text-xs uppercase tracking-wider"
        style={{ color: "var(--acc)" }}
      >
        AG-03 · Inbox
      </p>
      <h1 className="text-xl font-semibold">Workspace « {slug} » résolu.</h1>
      <p className="mt-2" style={{ color: "var(--mute)" }}>
        Socle Lot 0 en place : multi-tenant par sous-domaine, tokens du design chargés,
        schéma de base prêt. La file de tickets s'implémente au Lot 1.
      </p>
    </main>
  );
}
