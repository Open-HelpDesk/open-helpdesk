import type { Metadata } from "next";
import "@openhelpdesk/ui/tokens.css";

export const metadata: Metadata = {
  title: "Console — Open HelpDesk",
};

/**
 * Console cloud (control plane) — esthétique volontairement distincte du produit :
 * accent cuivre + bandeau CONSOLE persistant, pour qu'aucune capture ne soit
 * confondue avec l'app client (specs/13, shell commun).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="surface-console">
      <body
        style={{
          margin: 0,
          background: "var(--canvas)",
          color: "var(--ink)",
          fontFamily: "var(--font-ui)",
          fontSize: 14,
        }}
      >
        <div
          style={{
            background: "var(--cu-deep)",
            color: "#fff",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textAlign: "center",
            padding: "4px 0",
          }}
        >
          CONSOLE — ACCÈS INTERNE OPEN HELPDESK
        </div>
        {children}
      </body>
    </html>
  );
}
