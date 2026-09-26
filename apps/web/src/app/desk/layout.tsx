import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { entitlementsFor } from "@/lib/entitlements";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";
import "./desk.css";

/**
 * Employee portal (spec 19 — SD-E1…M2): the base of every /desk route.
 *
 * It uses the product palette (tokens.css :root — the V2 green and the
 * Bricolage titles the design is drawn with), not the customer portal's
 * serif surface: the employee portal is the company's own tool, and it is
 * never re-branded with a customer-facing accent.
 * Sign-in (/desk/login) and the magic-link landing (/desk/auth) live here
 * chrome-free; the header and tabs are in (portal)/layout.tsx.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const tenant = await requireTenant();
  return { title: t("desk.portal.metaTitle", { workspace: tenant.name }) };
}

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireTenant();
  // The service desk is a module of its own: a workspace without it has no /desk.
  if (!entitlementsFor(tenant).serviceDesk) notFound();
  const t = await getT();
  return (
    <div className="sd-portal min-h-screen" style={{ background: "var(--canvas)", color: "var(--ink)" }}>
      <I18nProvider locale={t.locale} dict={t.dict}>
        {children}
      </I18nProvider>
    </div>
  );
}
