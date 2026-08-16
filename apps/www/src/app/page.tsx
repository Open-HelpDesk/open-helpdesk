/**
 * SM-03 — Accueil. Squelette Lot 0 ; le site complet s'implémente au Lot 6
 * (specs/14-ecrans-site-signup.md, maquette design/Open HelpDesk - Site public.html).
 * Direction artistique : hero sombre #08281E, Inter + Instrument Serif italique.
 */
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--site-dark)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          opacity: 0.7,
          marginBottom: 12,
        }}
      >
        SM-03 · open-helpdesk.com
      </p>
      <h1 style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.035em", margin: 0 }}>
        Open HelpDesk
      </h1>
      <p style={{ opacity: 0.8, maxWidth: 480, marginTop: 12 }}>
        Le support client, open source. Site vitrine et signup au Lot 6 — tunnel
        d'inscription (SM-01) au Lot 4.
      </p>
    </main>
  );
}
