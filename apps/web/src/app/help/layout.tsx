import { getPortalTenant } from "@/lib/portal-auth";
import "./portal.css";

/**
 * Shell minimal du portail client (PT) : palette maquette via .surface-portal,
 * accent du TENANT substitué à l'accent produit (tenant.branding.accentColor).
 * Le chrome (header/footer) vit dans (portal)/layout.tsx — /help/login et
 * /help/auth restent sans chrome (PT-07).
 */

/** Accent par défaut du design system : dans ce cas on laisse les tokens
 * thème-conscients de .surface-portal faire foi (clair ET sombre). */
const DEFAULT_ACCENT = "#0b5f46";

export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getPortalTenant();
  const accent = (tenant?.branding as { accentColor?: string } | null)?.accentColor;
  const custom = accent && accent.toLowerCase() !== DEFAULT_ACCENT;

  return (
    <div
      className="surface-portal min-h-screen"
      style={{
        fontSize: 16,
        lineHeight: 1.55,
        background: "var(--canvas)",
        color: "var(--ink)",
        // L'accent du tenant emporte aussi le dégradé des boutons pleins : sinon
        // une marque personnalisée garderait le vert du design system en aplat.
        ...(custom
          ? ({
              "--acc": accent,
              "--acc-2": accent,
              "--cta-a": accent,
              "--cta-b": `color-mix(in srgb, ${accent} 65%, #000)`,
            } as React.CSSProperties)
          : {}),
      }}
    >
      {children}
    </div>
  );
}
