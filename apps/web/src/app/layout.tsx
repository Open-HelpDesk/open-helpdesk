import type { Metadata } from "next";
import { getLocale } from "@/i18n/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import "./globals.css";

/**
 * The favicon comes from the tenant (ST-01), not from a file in the repo.
 *
 * That is why there is neither `app/icon.png` nor `app/favicon.ico`: a static
 * file would be the same for every workspace, and Next would serve it in
 * preference to what is declared here. With no favicon uploaded, the browser
 * shows none — rather than someone else's.
 *
 * `generateMetadata` and not a constant: the value depends on the request.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantFromHeaders().catch(() => null);
  const favicon = (tenant?.branding as { faviconUrl?: string } | null)?.faviconUrl;
  return {
    title: "Open HelpDesk",
    ...(favicon ? { icons: { icon: favicon } } : {}),
  };
}

/**
 * `lang` and `dir` come from the tenant's language (ST-01), not from a constant:
 * they drive word breaking, speech synthesis and the spell checking of input
 * fields.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale.code} dir={locale.dir}>
      <body>{children}</body>
    </html>
  );
}
