import { notFound } from "next/navigation";
import { getPortalTenant } from "@/lib/portal-auth";
import { getPortalSettings } from "@/lib/portal-config";
import { requireTenant } from "@/lib/tenant";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";
import "./portal.css";

/**
 * Minimal shell of the customer portal (PT): mockup palette via .surface-portal,
 * the TENANT accent substituted for the product accent (tenant.branding.accentColor),
 * and the dictionary of the tenant's language set up for client components.
 * The chrome (header/footer) lives in (portal)/layout.tsx — /help/login and
 * /help/auth stay chrome-free (PT-07).
 */

/** Design system default accent: in that case we let the theme-aware tokens
 * of .surface-portal prevail (light AND dark). */
const DEFAULT_ACCENT = "#0b5f46";

export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  // The portal is the public face of the workspace: it must not exist at all
  // for a subdomain that has no workspace behind it (see requireTenant).
  await requireTenant();
  const tenant = await getPortalTenant();
  // ST-09: "Customer portal enabled". Turned off, /help no longer exists — sign-in
  // and request tracking included. The setting used to be saved without being read.
  const { portalEnabled } = await getPortalSettings();
  if (!portalEnabled) notFound();
  const t = await getT();
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
        // The tenant accent also carries the gradient of solid buttons: otherwise
        // a custom brand would keep the design system green as a flat fill.
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
      <I18nProvider locale={t.locale} dict={t.dict}>
        {children}
      </I18nProvider>
    </div>
  );
}
