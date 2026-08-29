import type { Metadata } from "next";
import { getLocale } from "@/i18n/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import "./globals.css";

/**
 * The favicon comes from the tenant (ST-01) when it has one, and falls back to
 * the product's own mark otherwise.
 *
 * There is still neither `app/icon.svg` nor `app/favicon.ico`, and that matters:
 * those are Next conventions that emit their own `<link rel="icon">`, which wins
 * over whatever is declared here — the default would then paint over every
 * customer's brand instead of yielding to it. The mark is an ordinary asset in
 * `public/`, pointed at only when there is nothing else to point at.
 *
 * Declaring an icon in every case also settles the 404 the browser used to log:
 * with no link at all it probes /favicon.ico on its own, and found nothing.
 *
 * `generateMetadata` and not a constant: the value depends on the request.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantFromHeaders().catch(() => null);
  const favicon = (tenant?.branding as { faviconUrl?: string } | null)?.faviconUrl;
  return {
    title: "Open HelpDesk",
    icons: {
      // A tenant's own favicon replaces both. Otherwise the SVG, which is sharp
      // at every size, with the .ico for the browsers that ignore SVG icons.
      icon: favicon
        ? favicon
        : [
            { url: "/favicon.svg", type: "image/svg+xml" },
            { url: "/favicon.ico", sizes: "any" },
          ],
    },
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
