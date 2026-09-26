/**
 * The domain's own texts — journal lines, emails, ticket subjects — in the
 * tenant's language.
 *
 * The strings live with every other translation, in the `domain` area of the
 * web app's dictionaries (apps/web/src/i18n/dictionaries/desk/domain): one
 * place for translators, the same compile-time key check. This package reads
 * those fragments directly because emails and ticket subjects are written from
 * jobs (the worker) that have no request and no React context — the rules
 * engine lacked exactly this and sends its CSAT email in English for it.
 * The files imported here are plain data plus the pure renderer; nothing of the
 * Next application comes along.
 */
import { renderMessage, type Message, type MessageParams } from "../../../apps/web/src/i18n/dictionary";
import { LocaleFormat } from "../../../apps/web/src/i18n/format";
import { resolveLocale, type LocaleDefinition } from "../../../apps/web/src/i18n/locales";
import { desk_domain_en, type DeskDomainKey } from "../../../apps/web/src/i18n/dictionaries/desk/domain/en";
import { desk_domain_bg } from "../../../apps/web/src/i18n/dictionaries/desk/domain/bg";
import { desk_domain_cs } from "../../../apps/web/src/i18n/dictionaries/desk/domain/cs";
import { desk_domain_da } from "../../../apps/web/src/i18n/dictionaries/desk/domain/da";
import { desk_domain_de } from "../../../apps/web/src/i18n/dictionaries/desk/domain/de";
import { desk_domain_el } from "../../../apps/web/src/i18n/dictionaries/desk/domain/el";
import { desk_domain_es } from "../../../apps/web/src/i18n/dictionaries/desk/domain/es";
import { desk_domain_et } from "../../../apps/web/src/i18n/dictionaries/desk/domain/et";
import { desk_domain_fi } from "../../../apps/web/src/i18n/dictionaries/desk/domain/fi";
import { desk_domain_fr } from "../../../apps/web/src/i18n/dictionaries/desk/domain/fr";
import { desk_domain_ga } from "../../../apps/web/src/i18n/dictionaries/desk/domain/ga";
import { desk_domain_hr } from "../../../apps/web/src/i18n/dictionaries/desk/domain/hr";
import { desk_domain_hu } from "../../../apps/web/src/i18n/dictionaries/desk/domain/hu";
import { desk_domain_it } from "../../../apps/web/src/i18n/dictionaries/desk/domain/it";
import { desk_domain_lt } from "../../../apps/web/src/i18n/dictionaries/desk/domain/lt";
import { desk_domain_lv } from "../../../apps/web/src/i18n/dictionaries/desk/domain/lv";
import { desk_domain_mt } from "../../../apps/web/src/i18n/dictionaries/desk/domain/mt";
import { desk_domain_nb } from "../../../apps/web/src/i18n/dictionaries/desk/domain/nb";
import { desk_domain_nl } from "../../../apps/web/src/i18n/dictionaries/desk/domain/nl";
import { desk_domain_pl } from "../../../apps/web/src/i18n/dictionaries/desk/domain/pl";
import { desk_domain_pt } from "../../../apps/web/src/i18n/dictionaries/desk/domain/pt";
import { desk_domain_ro } from "../../../apps/web/src/i18n/dictionaries/desk/domain/ro";
import { desk_domain_sk } from "../../../apps/web/src/i18n/dictionaries/desk/domain/sk";
import { desk_domain_sl } from "../../../apps/web/src/i18n/dictionaries/desk/domain/sl";
import { desk_domain_sv } from "../../../apps/web/src/i18n/dictionaries/desk/domain/sv";

export type { DeskDomainKey };

const DOMAIN: Record<string, Record<DeskDomainKey, Message>> = {
  en: desk_domain_en,
  bg: desk_domain_bg,
  cs: desk_domain_cs,
  da: desk_domain_da,
  de: desk_domain_de,
  el: desk_domain_el,
  es: desk_domain_es,
  et: desk_domain_et,
  fi: desk_domain_fi,
  fr: desk_domain_fr,
  ga: desk_domain_ga,
  hr: desk_domain_hr,
  hu: desk_domain_hu,
  it: desk_domain_it,
  lt: desk_domain_lt,
  lv: desk_domain_lv,
  mt: desk_domain_mt,
  nb: desk_domain_nb,
  nl: desk_domain_nl,
  pl: desk_domain_pl,
  pt: desk_domain_pt,
  ro: desk_domain_ro,
  sk: desk_domain_sk,
  sl: desk_domain_sl,
  sv: desk_domain_sv,
};

/**
 * A translate function accepted from the screens: apps/web's `Translate` takes
 * a narrower key type, and a method signature keeps the assignment legal.
 */
export type DeskTranslate = { bivarianceHack(key: string, params?: MessageParams): string }["bivarianceHack"];

export type DomainT = ((key: DeskDomainKey, params?: MessageParams) => string) & {
  locale: LocaleDefinition;
  fmt: LocaleFormat;
};

/** The domain dictionary of a tenant language (falls back to English, then to the key). */
export function domainT(localeCode: string | null | undefined): DomainT {
  const locale = resolveLocale(localeCode);
  const dict = DOMAIN[locale.code] ?? desk_domain_en;
  const fmt = new LocaleFormat(locale);
  const t = ((key: DeskDomainKey, params?: MessageParams) => {
    const message = dict[key] ?? desk_domain_en[key];
    if (message === undefined) return key;
    const count = params?.count;
    return renderMessage(message, params, typeof count === "number" ? fmt.plural(count) : undefined, (n) => fmt.number(n));
  }) as DomainT;
  t.locale = locale;
  t.fmt = fmt;
  return t;
}
