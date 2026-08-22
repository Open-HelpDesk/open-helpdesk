import { cache } from "react";
import { getTenantFromHeaders } from "@/lib/tenant";
import { renderMessage, splitAround, type Message, type MessageParams } from "./dictionary";
import { LocaleFormat } from "./format";
import { DEFAULT_LOCALE, resolveLocale, type LocaleDefinition } from "./locales";
import { en, type Dictionary, type MessageKey } from "./dictionaries/en";
import { bg } from "./dictionaries/bg";
import { fr } from "./dictionaries/fr";
import { cs } from "./dictionaries/cs";
import { da } from "./dictionaries/da";
import { de } from "./dictionaries/de";
import { el } from "./dictionaries/el";
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
 * Server-side language resolution.
 *
 * One language per tenant (ST-01 → `tenants.locale`), no individual
 * preference: within a workspace, agents and customers read the same one. The
 * tenant lookup is memoised per request, so calling `getT()` in ten components
 * runs only one SQL query.
 */

const DICTIONARIES: Record<string, Dictionary> = {
  bg, cs, da, de, el, en, es, et,
  fi, fr, ga, hr, hu, it, lt, lv,
  mt, nb, nl, pl, pt, ro, sk, sl,
  sv,
};

export type Translate = {
  (key: MessageKey, params?: MessageParams): string;
  /** Resolved language, for `lang`/`dir` and the client components. */
  locale: LocaleDefinition;
  /** Dates, numbers, plurals, relative time in this language. */
  fmt: LocaleFormat;
  /** The full dictionary — to be passed to a client component. */
  dict: Dictionary;
  /** Sentence split around a parameter rendered in JSX (link, value in bold). */
  parts: (key: MessageKey, slot: string, params?: MessageParams) => [string, string];
};

export const getLocale = cache(async (): Promise<LocaleDefinition> => {
  try {
    const tenant = await getTenantFromHeaders();
    return resolveLocale(tenant?.locale);
  } catch {
    // Route outside the middleware (never in practice): French stays the fallback.
    return resolveLocale(DEFAULT_LOCALE);
  }
});

/** Builds the translation function for the tenant's language. */
export const getT = cache(async (): Promise<Translate> => {
  const locale = await getLocale();
  return buildTranslate(locale);
});

export function buildTranslate(locale: LocaleDefinition): Translate {
  const dict = DICTIONARIES[locale.code] ?? fr;
  const fmt = new LocaleFormat(locale);

  const t = ((key: MessageKey, params?: MessageParams) => {
    // Fall back to French rather than to the raw key: a missing translation
    // must stay readable, not display "requests.emptyTitle".
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
