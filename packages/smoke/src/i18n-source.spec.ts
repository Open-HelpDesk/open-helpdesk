import { expect, test } from "@playwright/test";
import { dictionaryCodes, localeTags, pluralEntries, simpleEntries } from "./dict-source";

/**
 * Static checks on the dictionaries — the only ones in this folder that do not
 * launch a browser: they read the translation files as text and therefore need
 * no instance at all.
 *
 * This spec is here because the defect it catches is of the same family as the
 * others: invisible at compile time, silent at run time. The `Message` type only
 * requires an `other` form; all the others are optional, because no language
 * uses the same set of them. So a Polish dictionary deprived of its `many` form
 * compiles perfectly — and displays “5 zgłoszenia” instead of “5 zgłoszeń” for
 * every number that selects it, which is to say very often.
 */

/**
 * The categories a dictionary must supply for this language.
 *
 * This is not quite `resolvedOptions().pluralCategories`, which also enumerates
 * categories that no count displayed by the product will ever select. So we take
 * the categories actually reached on the numbers the product renders — whole
 * counts, every counter here counting rows — plus `other`, which is
 * `renderMessage`'s fallback and must exist everywhere.
 *
 * Two exclusions, both deliberate:
 *  - the `many` of Czech, Slovak and Lithuanian only concerns decimal numbers.
 *    No plural of the product ever receives one: `size()` passes “1,2 Mo” as an
 *    already-formatted parameter, never as `{count}`.
 *  - the `many` of French, Spanish, Italian and Portuguese only fires at exactly
 *    one million — “un million DE tickets”. At that number written in digits,
 *    `other` stays correct, and no tenant will ever get there.
 * The `many` of Polish, on the other hand, is required: it falls on 5, 6, 22…
 * which is to say permanently.
 */
function expectedCategories(tag: string): string[] {
  const rules = new Intl.PluralRules(tag);
  const seen = new Set<string>(["other"]);
  for (let n = 0; n <= 9_999; n++) seen.add(rules.select(n));
  return [...seen].sort();
}

const REFERENCE = pluralEntries("en");
const CODES = dictionaryCodes();

test.describe("Plural tables", () => {
  test("French does declare a few dozen of them", () => {
    // Guard rail for the guard rail: if the parsing found nothing any more,
    // every test below would go green without verifying anything.
    expect(REFERENCE.size).toBeGreaterThan(40);
  });

  test("every language in the registry has its dictionary", () => {
    const expected = [...localeTags().keys()].filter((c) => c !== "en").sort();
    expect(CODES).toEqual(expected);
  });

  for (const code of CODES) {

    test(`${code}: every category the language can select`, () => {
      const tag = localeTags().get(code);
      expect(tag, `${code} missing from locales.ts`).toBeTruthy();
      const required = expectedCategories(tag!);
      const dict = pluralEntries(code);

      // Same set of plural keys as French: a key translated as a plain string
      // where French expects forms would not crash, it would just render the
      // same sentence for every number.
      expect([...dict.keys()].sort()).toEqual([...REFERENCE.keys()].sort());

      const missing = [...dict].flatMap(([key, forms]) =>
        required.filter((c) => !(c in forms)).map((c) => `${key} → ${c}`),
      );
      expect(missing, `${code} (${required.join(", ")})`).toEqual([]);
    });
  }
});

/**
 * Vocabulary sets — statuses, priorities, urgencies, channels.
 *
 * These labels do not live in the screens but in lookup tables, off to one
 * side: a wrong term survives there for a long time. The particular risk is
 * COLLISION. If two statuses of the same set translate to the same word, the
 * filter that lists them shows two identical entries and becomes unusable —
 * without anything crashing, and without any typing being able to see it.
 * English cannot reveal the defect: it is the source, its values are distinct
 * by construction.
 */
const SETS: Record<string, RegExp> = {
  "portal statuses": /^status\./,
  "agent workspace statuses": /^app\.status\./,
  "priorities": /^app\.priority\./,
  "customer form urgencies": /^newRequest\.urgency(?!Label)/,
  "channels": /^app\.channel\./,
};

test.describe("Vocabulary sets", () => {
  test("the source sets do count several values each", () => {
    // Guard rail: if the parsing no longer found the keys, the tests below
    // would go green while comparing nothing.
    const source = simpleEntries("en");
    for (const [name, re] of Object.entries(SETS)) {
      const n = [...source.keys()].filter((k) => re.test(k)).length;
      expect(n, `set “${name}”`).toBeGreaterThan(2);
    }
  });

  for (const code of CODES) {
    test(`${code}: no duplicate label inside one set`, () => {
      const d = simpleEntries(code);
      const collisions: string[] = [];
      for (const [name, re] of Object.entries(SETS)) {
        const byValue = new Map<string, string[]>();
        for (const key of [...d.keys()].filter((k) => re.test(k))) {
          const value = d.get(key)!;
          if (!byValue.has(value)) byValue.set(value, []);
          byValue.get(value)!.push(key.split(".").pop()!);
        }
        for (const [value, keys] of byValue) {
          if (keys.length > 1) collisions.push(`${name}: “${value}” ← ${keys.join(" = ")}`);
        }
      }
      expect(collisions).toEqual([]);
    });
  }
});

/**
 * Action verbs the translation must not conflate.
 *
 * Each pair below carries two labels that are DISTINCT in French and whose
 * confusion has a consequence: clicking one while believing it is the other.
 * The case that motivated this test occurred in four of the fourteen most
 * recently shipped languages — Bulgarian, Estonian, Lithuanian, Slovenian —
 * where the natural word for revoking is also the word for cancelling. The red
 * link that permanently invalidates an API key then carried the same word as
 * the Cancel button of the form just below it.
 *
 * Only short, bare labels are compared, and only pairs that meet ON THE SAME
 * SCREEN. Two identical verbs on two screens that never cross paths mislead
 * nobody: many languages have only one word for “delete” and “remove”, and that
 * is legitimate — demanding the distinction would fail Finnish, Dutch and
 * Polish on a difference French makes without the product depending on it.
 */
const PAIRS: [string, string, string][] = [
  // The observed defect: the red revoke link and the form's Cancel button live
  // side by side on the API & webhooks screen, the shell's `cancel` being
  // rendered on every settings screen.
  ["revoke a key", "app.settings.dev.revoke", "app.settings.shell.cancel"],
  ["revoke rather than delete", "app.settings.dev.revoke", "app.settings.dev.delete"],
  ["revoke rather than disable", "app.settings.dev.revoke", "app.settings.dev.disable"],
  // An automation rule is disabled or deleted from the same row.
  ["delete rather than disable", "app.settings.rules.delete", "app.settings.rules.ruleDisable"],
  // Workspace danger zone: deactivating an agent is not deleting.
  ["delete rather than disable", "app.settings.workspace.delete", "app.settings.workspace.deactivate"],
];

test.describe("Action verbs", () => {
  test("the pairs really are distinct in the source", () => {
    // Without this guard rail, a pair with a key that had vanished from en.ts
    // would go green in every language without verifying anything.
    const source = simpleEntries("en");
    for (const [name, a, b] of PAIRS) {
      expect(source.get(a), `${name}: ${a} missing from en.ts`).toBeTruthy();
      expect(source.get(b), `${name}: ${b} missing from en.ts`).toBeTruthy();
      expect(source.get(a), `${name}: the pair is already conflated in the source`).not.toBe(
        source.get(b),
      );
    }
  });

  for (const code of CODES) {
    test(`${code}: no conflated action pair`, () => {
      const d = simpleEntries(code);
      // Comparison insensitive to case and punctuation: “Odobrať:” and
      // “Odobrať” are the same word for the user reading the button.
      const bare = (v: string | undefined) =>
        (v ?? "").toLocaleLowerCase().replace(/[\s:.…—-]+$/u, "").trim();
      const conflated = PAIRS.filter(([, a, b]) => {
        const bareA = bare(d.get(a));
        return bareA !== "" && bareA === bare(d.get(b));
      }).map(([name, a, b]) => `${name}: “${d.get(a)}” ← ${a} = ${b}`);
      expect(conflated).toEqual([]);
    });
  }
});
