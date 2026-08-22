# Adding a language

The software runs in 25 languages: the 24 official languages of the European
Union, which cover its 27 member states, plus Norwegian. One language per tenant
(`tenants.locale`, set in ST-01): agents and customers of the same workspace read
the same one — there is no per-user preference and no URL prefix.

`en.ts` is the source. The other dictionaries are typed against it, so a
forgotten key is a compile error. That is the only guarantee the compiler gives
— everything else on this page describes what it does not see.

## The procedure

1. Add the entry to [`locales.ts`](locales.ts): `code`, BCP-47 `tag`,
   `nativeName` in the language itself, `dir`.
2. Write `dictionaries/<code>.ts`, modelled on `en.ts` — same keys, same order,
   same section markers. A review then reads as a side-by-side diff.
3. Import it in [`server.ts`](server.ts) and add it to `DICTIONARIES`.
4. Run the checks: `pnpm --filter @openhelpdesk/smoke exec playwright test
   src/i18n-source.spec.ts` — it needs no running instance.

## The four traps, every one covered by a test

**Plural forms.** `Message` only requires `other`; the rest are optional, since
no two languages use the same set. A Polish dictionary missing its `many` form
compiles without a word of warning and prints a wrong sentence as soon as a
counter reaches 5. Supply every category that
`new Intl.PluralRules(tag).resolvedOptions().pluralCategories` returns; the
`many` of Czech, Slovak and Lithuanian is the one admitted exception (it only
targets decimals, which no `{count}` in the product receives).

**Undeclined proper nouns.** The product interpolates names exactly as they were
entered, in the nominative: it cannot build a genitive, append a case suffix or
assimilate an article. A sentence that requires it is wrong on every render —
Czech read "Odpověď od Petr" instead of "od Petra". Thirty keys are concerned,
and only those: the ones whose parameter receives `name`, `org`, `agent`,
`contact`, `tenant`, `domain`, `subject`, `team` or `title`. The proven ways out,
in order of preference: a common noun that carries the case in front of the
proper noun ("Kontakty organizace {org}", "l-organizzazzjoni {org}"), the
sentence turned around to make the parameter its subject, or typographic
detachment ("agent: {agent}"). And beware of agreements the parameter commands
without anyone thinking about it: Croatian agreed a participle with the agent's
name, wrong for any woman.

**Destructive verbs that blur together.** In four of the last fourteen languages
shipped, the natural word for revoking was also the word for cancelling: the red
link that permanently invalidates an API key carried the same word as the Cancel
button on the same screen. Check that "revoke", "delete", "disable", "remove",
"close" and "cancel" stay distinguishable **when they live on the same screen**;
elsewhere, one word is often legitimate.

**Vocabulary sets.** Statuses, priorities, urgencies and channels live in tables
away from the screens that display them, and two identical values in one set
give an unusable filter without anything breaking. Mind grammatical gender too:
portal statuses qualify a "request", agent-space statuses a "ticket", and those
two words need not share a gender.

## Nothing translatable lives outside this folder

`en.ts` is the source, and the only one. A label written inside a component will
never be translated — it will be missing from no language, the compiler will say
nothing, and only a reader of another language will notice. The mistake was made
at scale: a hundred and forty-eight strings, including the whole automations
screen and the whole onboarding.

`packages/smoke/src/i18n-hardcoded.spec.ts` stands guard: it sweeps
`apps/web/src` and `ee/web/src` outside `i18n/` and rejects any accented text
that does not go through `t()`. Its exceptions are listed with their reason —
category names entered by the tenant and compared as-is, and the database value
of ticket types. A third case either justifies itself or goes through the
dictionary.

That guard has a known limit worth stating: it keys on accents, so a hardcoded
**English** label slips through it. It is kept because it still catches the
likeliest accident, and because a check with no false positives is a check that
survives. Two habits close the gap: add the key first, then use it; and read the
diff of any file where a literal string sits next to JSX.

Three traps of that sweep are worth knowing before adding text to it:

**An assembled sentence is not translatable.** The rule summary concatenated
"If" + conditions + "→" + actions: word order was frozen in one language. The
pattern is now a key (`summaryPattern`), and every fragment has its own. A
language that throws its verb to the end can do so.

**Never slice rendered text.** Two screens built the full sentence to strip its
beginning with a regular expression. As soon as the language changed, the
`replace` stripped nothing. Expose the half you need (`conditionsSummary`,
`actionsSummary`) instead of trimming a string.

**Not everything that looks like a word is text.** The ST-07 duration tokens
`min`, `h`, `j` are a syntax: the displayed value is read back by
`parseDurationTokens` on the next save, and translating them would prevent
saving.

Finally, beware of operations that look neutral: `toLowerCase()` is wrong as
soon as a language capitalises its nouns, and `localeCompare(a, "fr-FR")` sorts
neither Cyrillic nor Czech diacritics correctly — pass `t.locale.tag`.

## What is not translated

Brands and technical acronyms, keyboard keys (`⌘K`, `↑↓`, `↵` — in "G then B",
only the linking word changes), the `{{double.tokens}}` of macros, paths in
third-party consoles that are not localised, and the product's displayed roles:
**Owner, Admin, Agent, Viewer** are values, not text.

Do adapt units, example domains, the public holidays cited and the weekday
initials of the heatmap.

One technical trap: the example in `app.settings.sla.durationHint` is read back
by the duration parser, which literally accepts only `min`, `h` and `j` whatever
the language. Keep those tokens parseable and gloss them.

## Formats: do not write them, delegate them

Dates, times, numbers, plurals and relative time all go through `Intl` via
[`LocaleFormat`](format.ts). A number interpolated into a sentence is formatted
by `interpolate` with the locale: do not hardcode it. Languages do not group
thousands the same way, and some do not group four digits at all — Polish writes
"4262" where French writes "4 262".

`of()` is the one place where a language rule is hardcoded: French elision ("le
support d'Acme"). Other languages receive the name as-is and their dictionary
turns the sentence around.
