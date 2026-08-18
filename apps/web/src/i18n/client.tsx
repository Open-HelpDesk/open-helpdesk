"use client";

/**
 * Traduction dans les composants clients.
 *
 * Le portail compte cinq composants clients (recherche, vote, déflexion,
 * pièces jointes, bouton copier). Leur passer une à une les vingt chaînes dont
 * ils ont besoin encombrerait les signatures ; un contexte posé une fois par le
 * shell serveur suffit. Le dictionnaire est déjà chargé côté serveur, il
 * traverse donc la frontière comme une simple donnée sérialisable.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { renderMessage, splitAround, type Message, type MessageParams } from "./dictionary";
import { LocaleFormat } from "./format";
import type { LocaleDefinition } from "./locales";
import type { Dictionary, MessageKey } from "./dictionaries/fr";

type Bundle = { locale: LocaleDefinition; dict: Dictionary };

const I18nContext = createContext<Bundle | null>(null);

export function I18nProvider({ locale, dict, children }: Bundle & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const bundle = useContext(I18nContext);
  if (!bundle) {
    throw new Error("useT() hors de <I18nProvider> — le shell doit le poser.");
  }
  const { locale, dict } = bundle;
  return useMemo(() => {
    const fmt = new LocaleFormat(locale);
    const t = (key: MessageKey, params?: MessageParams) => {
      const message: Message | undefined = dict[key];
      if (message === undefined) return key;
      const count = params?.count;
      const category = typeof count === "number" ? fmt.plural(count) : undefined;
      return renderMessage(message, params, category, (n) => fmt.number(n));
    };
    const parts = (key: MessageKey, slot: string, params?: MessageParams) =>
      splitAround((p) => t(key, p), slot, params);
    return Object.assign(t, { locale, fmt, parts });
  }, [locale, dict]);
}
