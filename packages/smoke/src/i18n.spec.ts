import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { AGENTS, setTenantLocale, signInAgent } from "./helpers";
import { pluralEntries, simpleEntries } from "./dict-source";

/**
 * The software language (ST-01).
 *
 * A tenant carries ONE language: it holds for its agents just as for its
 * customers, there is neither an individual preference nor a URL prefix. So
 * changing this setting must retranslate both spaces at once — the portal and
 * the inbox — and nothing else: what the tenant wrote itself (article titles,
 * request subjects) stays as it is.
 *
 * German serves as the control language because it moves the vocabulary far
 * enough away for a forgotten string to leap out, and because its thousands
 * separator is the dot: “4.182” where English writes “4,182”.
 *
 * Polish serves as a second control, for a different reason: it counts four
 * plural forms where English and German have two. A two-form language cannot
 * reveal a broken plural selection — `other` is simply right almost everywhere
 * there. In Polish, it is not.
 */

/**
 * The most viewed article of the demo data set. Its title is tenant content —
 * it must never change with the language — and its view counter is the only
 * four-digit number visible without signing in.
 */
const ARTICLE = {
  slug: "how-to-download-your-invoices",
  title: "How to download your invoices",
} as const;

test.describe("Software language", () => {
  /**
   * A single session for the whole file.
   *
   * Authentication is rate-limited (Better Auth refuses the fourth attempt
   * inside the same ten-second window), and the sign-in form then announces
   * “Incorrect credentials.”. Signing in again on every test would therefore
   * make the following ones fail on a misleading message, entirely unrelated to
   * the language. We sign in once, we keep the page.
   */
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    context = await browser.newContext();
    page = await context.newPage();
    // The sign-in quota is shared by the whole instance: another spec in flight
    // may have exhausted it. We retry until the product accepts, rather than
    // failing on a contention that says nothing about the product.
    await expect(async () => {
      await signInAgent(page, AGENTS.owner);
    }).toPass({ timeout: 60_000 });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.afterEach(async () => {
    // The tenant is shared by every spec and carries only one language:
    // whatever happened above, it goes back to the baseline the others expect.
    await switchLocale("en");
  });

  /**
   * Switches the tenant's language and waits for the save to be ACKNOWLEDGED.
   *
   * `setTenantLocale` hands back control as soon as the `<select>` carries the
   * chosen value, that is, before the server action has answered. Navigating
   * right afterwards gets the navigation cancelled by the save redirect
   * arriving behind it: we end up on the settings screen, in the OLD language,
   * and the test fails for a reason that is not its own. `?saved=1` is the
   * product's acknowledgement — we wait for it before going to look elsewhere.
   */
  async function switchLocale(code: string): Promise<void> {
    await setTenantLocale(page, code);
    await expect(page).toHaveURL(/saved=1/);
  }

  /** This article's row in the ranking on the portal home page. */
  function popularRow() {
    return page.locator(`a[href="/help/articles/${ARTICLE.slug}"]`).first();
  }

  test("in German, the customer portal displays in German", async () => {
    await switchLocale("de");
    await page.goto("/help");

    // `lang` comes from the same source as the translations: if it stays on
    // French, it is the root layout that has not read the tenant again.
    await expect(page.locator("html")).toHaveAttribute("lang", "de");

    // The translated home heading — the tenant has no custom welcome text,
    // which would take precedence over the translation (ST-09).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Wie können wir Ihnen helfen?",
    );

    // The portal chrome is rendered by a different layout from the page: it is
    // the kind of place that stays behind when the rest has switched over.
    await expect(page.getByRole("link", { name: "Anfrage stellen" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Meine Anfragen" }).first()).toBeVisible();
  });

  test("in German, numbers carry the German thousands separator", async () => {
    await switchLocale("de");
    await page.goto("/help");

    // Translating is not enough: a number interpolated into a sentence must go
    // through the language's formatter. Without that it comes out raw — “4182” —
    // and the defect stays invisible as long as only text is read back.
    // The counter is not fixed (every article read increments it): it is the
    // SHAPE that is verified, not the value.
    await expect(popularRow().locator("span.tabular-nums")).toHaveText(
      /^\d{1,3}\.\d{3} Aufrufe$/,
    );
  });

  test("in German, the agent workspace and its statuses display in German", async () => {
    await switchLocale("de");
    await page.goto("/app/tickets");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Meine Tickets");

    // The statuses live in a separate lookup table, not in the screens: this is
    // exactly the vocabulary that stays untranslated when everything else has
    // switched over. They are read in the “Status” filter, the only place where the
    // labels are rendered whatever the inbox data holds.
    const statusFilter = page.locator('details:has(a[href="/app/tickets?status=open"])');
    await statusFilter.locator("summary").click();
    await expect(statusFilter.getByRole("link", { name: "Offen", exact: true })).toBeVisible();
    await expect(statusFilter.getByRole("link", { name: "Neu", exact: true })).toBeVisible();
    await expect(statusFilter.getByRole("link", { name: "Wartend", exact: true })).toBeVisible();
  });

  test("in Polish, the plural form is the one the language selects", async () => {
    // The real test of the plural layer. Polish has four forms, and no WHOLE
    // number selects `other` there: so the home page's view counter necessarily
    // exercises `one`, `few` or `many`. A rendering that fell back on the
    // fallback — incomplete dictionary, or a selection made with “n > 1” rather
    // than by `Intl.PluralRules` — shows up here, while it goes unnoticed in the
    // two German tests above.
    await switchLocale("pl");
    await page.goto("/help");
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");

    const counter = popularRow().locator("span.tabular-nums");
    const rendered = (await counter.innerText()).trim();

    // The displayed number is not fixed: every article read increments it. So
    // we read the one the page has just displayed and derive the expected form
    // from it — the test follows the product instead of betting on a value.
    const n = Number(rendered.replace(/\D/g, ""));
    expect(n).toBeGreaterThan(0);

    const category = new Intl.PluralRules("pl-PL").select(n);
    expect(category, "Polish never selects `other` on a whole number").not.toBe("other");

    const forms = pluralEntries("pl").get("home.views");
    expect(forms, "home.views should carry plural forms in pl.ts").toBeTruthy();
    const expected = forms![category]!.replace(
      "{count}",
      new Intl.NumberFormat("pl-PL").format(n),
    );
    // Strict equality covers both halves at once: the right form, and the
    // number passed through the Polish formatter (narrow no-break space).
    expect(rendered).toBe(expected);
  });

  test("the counts in the deletion modal each inflect their own noun", async () => {
    // The product's gravest warning counted THREE independent counts in one
    // sentence, where a key carries only one plural dimension: the three nouns
    // were frozen in the plural and, at a single ticket, the sentence wrote
    // “Les 1 tickets” — in every language. The three noun phrases have been
    // pulled out into keys counted separately.
    //
    // Polish is the control: four forms, and no whole number selects `other`
    // there. A frozen sentence would be seen there immediately.
    await switchLocale("pl");
    await page.goto("/app/settings/general");

    // Open the danger zone's modal. The trigger's label is read from the
    // dictionary rather than hard-coded in Polish: “Usuń” also serves the logo
    // and favicon removal buttons on the same screen, and a `has-text` would
    // catch one of those. Nothing in the modal is touched — the delete button
    // stays locked behind typing the slug.
    const trigger = simpleEntries("pl").get("app.settings.workspace.delete")!;
    await page.getByRole("button", { name: trigger, exact: true }).click();
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // The sentence no longer carries any parameter.
    const sentence = modal.locator("p").first();
    await expect(sentence).not.toContainText("{");

    // The line of counts: three noun phrases separated by “·”.
    const line = modal.locator("p").nth(1);
    const text = (await line.innerText()).trim();
    const groups = text.split("·").map((g) => g.trim());
    expect(groups, `“${text}” should carry three counts`).toHaveLength(3);

    const rules = new Intl.PluralRules("pl-PL");
    const nf = new Intl.NumberFormat("pl-PL");
    for (const [i, key] of [
      "app.settings.workspace.generalDeleteTicketCount",
      "app.settings.workspace.generalDeleteContactCount",
      "app.settings.workspace.generalDeleteArticleCount",
    ].entries()) {
      const n = Number(groups[i]!.replace(/[^0-9]/g, ""));
      const category = rules.select(n);
      expect(category, "Polish never selects `other` on a whole number").not.toBe(
        "other",
      );
      const forms = pluralEntries("pl").get(key);
      expect(forms, `${key} should carry plural forms in pl.ts`).toBeTruthy();
      expect(groups[i]).toBe(forms![category]!.replace("{count}", nf.format(n)));
    }
  });

  test("tenant content is not translated along with the interface", async () => {
    // The article title belongs to the tenant: it is written in ITS language
    // and no change of setting must touch it. A dictionary spilling over onto
    // the data would be seen here, and nowhere else.
    const title = popularRow().locator("span.flex-1");

    await switchLocale("en");
    await page.goto("/help");
    await expect(title).toHaveText(ARTICLE.title);

    await switchLocale("de");
    await page.goto("/help");
    await expect(title).toHaveText(ARTICLE.title);
  });

  test("going back to English restores the English interface", async () => {
    // A one-way trip proves nothing: it is the return that shows the language
    // is read again on every render, and not frozen at the first pass by a
    // cache.
    await switchLocale("de");
    await switchLocale("en");

    await page.goto("/help");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How can we help?");

    await page.goto("/app/tickets");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("My tickets");
  });
});
