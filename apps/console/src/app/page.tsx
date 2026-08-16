/**
 * CO-02 — Vue d'ensemble. Squelette Lot 0 ; la console s'implémente au Lot 4
 * (specs/13-ecrans-console-cloud.md, maquette design/Open HelpDesk - Console cloud.html).
 */
export default function ConsoleHome() {
  return (
    <main style={{ padding: 32 }}>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--cu)",
          marginBottom: 8,
        }}
      >
        CO-02 · Vue d'ensemble
      </p>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
        Console Open HelpDesk
      </h1>
      <p style={{ color: "var(--mute)", marginTop: 8 }}>
        Control plane (Lot 4) : tenants, provisioning, plans, feature flags,
        facturation, santé, incidents. Connexion SSO interne + 2FA obligatoire (CO-01).
      </p>
    </main>
  );
}
