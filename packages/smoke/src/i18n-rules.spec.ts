import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { AGENTS, setTenantLocale, signInAgent } from "./helpers";
import { simpleEntries } from "./dict-source";

/**
 * The rules summary, in a language other than French.
 *
 * This is the most fragile piece of the translation work. That summary is not a
 * sentence from the dictionary: it is ASSEMBLED at run time — a template,
 * fragments of conditions joined by an “and”, fragments of actions joined by
 * “·”. It carried three defects that nothing reported:
 *
 *  · the labels were French constants;
 *  · two screens cut the RENDERED TEXT down with a regular expression so as to
 *    keep only one half of it — `/^If always → /` and `/^If /` — which
 *    stopped removing anything as soon as the language changed;
 *  · the word order of the template was frozen, whereas a language may push its
 *    verb to the end.
 *
 * Polish serves as the control: its vocabulary is remote enough for a fragment
 * left in the source language to leap out.
 */

/** Source-language turns of phrase the assembled rendering used to let through. */
const LEFTOVERS = ["no action", "always", "assign to", "move to"];

/** The head and the tail of a template, around its parameter. */
function around(template: string, param: string): [string, string] {
  const [head = "", tail = ""] = template.split(`{${param}}`);
  return [head.trim(), tail.trim()];
}

test.describe("Translated rules summary", () => {
  let context: BrowserContext;
  let page: Page;
  let pl: Map<string, string>;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    pl = simpleEntries("pl");
    context = await browser.newContext();
    page = await context.newPage();
    await expect(async () => {
      await signInAgent(page, AGENTS.owner);
    }).toPass({ timeout: 60_000 });
    await setTenantLocale(page, "pl");
  });

  test.afterAll(async () => {
    // The tenant is shared: it goes back to French whatever happens.
    await setTenantLocale(page, "fr");
    await context.close();
  });

  test("every rule is summarised in Polish, with no French fragment", async () => {
    await page.goto("/app/settings/automations");
    const summaries = page.locator('div:has(> a[href^="/app/settings/automations/"]) > p');
    const lines = (await summaries.allInnerTexts()).map((s) => s.trim()).filter(Boolean);
    expect(lines.length, "the demo data set should carry rules").toBeGreaterThan(0);

    const [head] = around(pl.get("app.settings.rules.summaryPattern")!, "conditions");
    for (const line of lines) {
      // The Polish template opens the sentence: if its head is missing, the
      // summary was not rendered by the dictionary.
      if (head) expect(line, `“${line}”`).toContain(head);
      for (const leftover of LEFTOVERS) {
        expect(line.toLowerCase(), `“${line}” still carries “${leftover}”`).not.toContain(leftover);
      }
    }
  });

  test("the SLA editor shows only the conditions half", async () => {
    await page.goto("/app/settings/sla");
    // `body` and not `main`: the agent workspace has no `main` element, and a
    // selector that never resolves makes the test wait instead of making it
    // fail — that is how this test first timed out at thirty seconds.
    const text = await page.locator("body").innerText();

    // This screen used to obtain that half by building the whole sentence and
    // then stripping its head and its tail with a regular expression. Inert
    // outside French: the complete sentence would have shown in the column.
    const [head] = around(pl.get("app.settings.rules.summaryPattern")!, "conditions");
    if (head) expect(text, `“${head}” has no business here`).not.toContain(head);
    expect(text).not.toContain(pl.get("app.settings.rules.journalNoAction")!);
  });

  test("the condition group header follows the chosen mode", async () => {
    // The selector sits IN THE MIDDLE of a sentence, and the single frame used
    // before was wrong: French wrote “Correspond à au moins une les
    // conditions”, German “mindestens eine Bedingungen treffen zu”.
    //
    // The control here is FRENCH, and not Polish as in the tests above: Polish
    // places its selector at the end of the sentence, so it has no tail to
    // compare and the assertion would pass on nothing. French is the language
    // where the defect lived, and the one where the two frames differ —
    // “toutes LES conditions” against “au moins une DES conditions”.
    await setTenantLocale(page, "fr");
    await page.goto("/app/settings/automations");
    await page.locator('a[href^="/app/settings/automations/"]').first().click();
    await page.waitForURL(/\/automations\/[^/]+$/, { timeout: 15_000 });

    const fr = simpleEntries("fr");
    const modes = [
      { label: fr.get("app.settings.rules.matchAll")!, frame: fr.get("app.settings.rules.matchAllPattern")! },
      { label: fr.get("app.settings.rules.matchAny")!, frame: fr.get("app.settings.rules.matchAnyPattern")! },
    ];
    const tails = modes.map((m) => around(m.frame, "mode")[1]);
    expect(tails[0], "the two French frames must differ").not.toBe(tails[1]);

    // The header is the block carrying the “SI” label as a direct child.
    const header = page.locator(
      `div:has(> span:text-is("${fr.get("app.settings.rules.matchIf")}"))`,
    ).first();
    await expect(header).toBeVisible();

    for (const [i, m] of modes.entries()) {
      await header.getByRole("button", { name: m.label, exact: true }).click();
      await expect(header).toContainText(tails[i]!);
      await expect(header, "the other mode's tail must not be displayed").not.toContainText(
        tails[1 - i]!,
      );
    }
  });
});
