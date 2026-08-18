import type { Metadata } from "next";
import { getLocale } from "@/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open HelpDesk",
};

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
