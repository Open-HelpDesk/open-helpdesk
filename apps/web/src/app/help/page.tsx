import { getTenantSlug } from "@/lib/tenant";

/**
 * PT-01 — Accueil du centre d'aide. Squelette Lot 0 ; l'écran réel arrive au Lot 3
 * (specs/12-ecrans-portail-client.md, maquette design/Open HelpDesk - Portail client.html).
 */
export default async function HelpHome() {
  const slug = await getTenantSlug();
  return (
    <main className="mx-auto min-h-screen max-w-3xl p-8" style={{ fontSize: 16 }}>
      <p
        className="mb-2 font-mono text-xs uppercase tracking-wider"
        style={{ color: "var(--acc)" }}
      >
        PT-01 · Centre d'aide
      </p>
      <h1 className="text-2xl font-semibold">Centre d'aide — {slug}</h1>
      <p className="mt-2" style={{ color: "var(--mute)" }}>
        Portail client (Lot 3). Cette surface prendra l'accent du tenant.
      </p>
    </main>
  );
}
