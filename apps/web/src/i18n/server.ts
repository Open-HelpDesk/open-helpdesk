import { cache } from "react";
import { getTenantFromHeaders } from "@/lib/tenant";
import { renderMessage, splitAround, type Message, type MessageParams } from "./dictionary";
import { LocaleFormat } from "./format";
import { DEFAULT_LOCALE, resolveLocale, type LocaleDefinition } from "./locales";
import { fr, type Dictionary, type MessageKey } from "./dictionaries/fr";
import { bg } from "./dictionaries/bg";
import { cs } from "./dictionaries/cs";
import { da } from "./dictionaries/da";
import { de } from "./dictionaries/de";
import { el } from "./dictionaries/el";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { et } from "./dictionaries/et";
import { fi } from "./dictionaries/fi";
import { ga } from "./dictionaries/ga";
import { hr } from "./dictionaries/hr";
import { hu } from "./dictionaries/hu";
import { it } from "./dictionaries/it";
import { lt } from "./dictionaries/lt";
import { lv } from "./dictionaries/lv";
import { mt } from "./dictionaries/mt";
import { nb } from "./dictionaries/nb";
import { nl } from "./dictionaries/nl";
import { pl } from "./dictionaries/pl";
import { pt } from "./dictionaries/pt";
import { ro } from "./dictionaries/ro";
import { sk } from "./dictionaries/sk";
import { sl } from "./dictionaries/sl";
import { sv } from "./dictionaries/sv";

/**
 * Résolution de la langue côté serveur.
 *
 * Une langue par tenant (ST-01 → `tenants.locale`), pas de préférence
 * individuelle : dans un espace de travail, agents et clients lisent la même.
 * La lecture du tenant est mémoïsée par requête, donc appeler `getT()` dans
 * dix composants ne fait qu'une requête SQL.
 */

const DICTIONARIES: Record<string, Dictionary> = {
  bg, cs, da, de, el, en, es, et,
  fi, fr, ga, hr, hu, it, lt, lv,
  mt, nb, nl, pl, pt, ro, sk, sl,
  sv,
};

export type Translate = {
  (key: MessageKey, params?: MessageParams): string;
  /** Langue résolue, pour `lang`/`dir` et les composants clients. */
  locale: LocaleDefinition;
  /** Dates, nombres, pluriels, temps relatif dans cette langue. */
  fmt: LocaleFormat;
  /** Le dictionnaire complet — à passer à un composant client. */
  dict: Dictionary;
  /** Phrase découpée autour d'un paramètre rendu en JSX (lien, valeur en gras). */
  parts: (key: MessageKey, slot: string, params?: MessageParams) => [string, string];
};

export const getLocale = cache(async (): Promise<LocaleDefinition> => {
  try {
    const tenant = await getTenantFromHeaders();
    return resolveLocale(tenant?.locale);
  } catch {
    // Route hors middleware (jamais en pratique) : le français reste le repli.
    return resolveLocale(DEFAULT_LOCALE);
  }
});

/** Construit la fonction de traduction pour la langue du tenant. */
export const getT = cache(async (): Promise<Translate> => {
  const locale = await getLocale();
  return buildTranslate(locale);
});

export function buildTranslate(locale: LocaleDefinition): Translate {
  const dict = DICTIONARIES[locale.code] ?? fr;
  const fmt = new LocaleFormat(locale);

  const t = ((key: MessageKey, params?: MessageParams) => {
    // Repli sur le français plutôt que sur la clé brute : une traduction
    // manquante doit rester lisible, pas afficher « requests.emptyTitle ».
    const message: Message = dict[key] ?? fr[key];
    if (message === undefined) return key;
    const count = params?.count;
    const category = typeof count === "number" ? fmt.plural(count) : undefined;
    return renderMessage(message, params, category, (n) => fmt.number(n));
  }) as Translate;

  t.locale = locale;
  t.fmt = fmt;
  t.dict = dict;
  t.parts = (key, slot, params) => splitAround((p) => t(key, p), slot, params);
  return t;
}
