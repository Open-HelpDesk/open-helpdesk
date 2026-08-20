import type { Metadata } from "next";
import { getLocale } from "@/i18n/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import "./globals.css";

/**
 * Le favicon vient du tenant (ST-01), pas d'un fichier du dépôt.
 *
 * C'est pour cela qu'il n'y a ni `app/icon.png` ni `app/favicon.ico` : un
 * fichier statique serait le même pour tous les workspaces, et Next le
 * servirait en priorité sur ce qui est déclaré ici. Sans favicon déposé, le
 * navigateur n'en affiche aucun — plutôt que celui d'un autre.
 *
 * `generateMetadata` et non une constante : la valeur dépend de la requête.
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
 * `lang` et `dir` viennent de la langue du tenant (ST-01), pas d'une constante :
 * ils commandent la coupure de mots, la synthèse vocale et la correction
 * orthographique des champs de saisie.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale.code} dir={locale.dir}>
      <body>{children}</body>
    </html>
  );
}
