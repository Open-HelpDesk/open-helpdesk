import { expect, test, type Page } from "@playwright/test";
import { AGENTS, expectStatus, signInAgent } from "./helpers";

/**
 * The portal as an anonymous visitor meets it: no session, no cookie, just an
 * address. It is the public half of the product — the one that has to work
 * before anybody thinks of opening a request.
 *
 * What is peculiar about it is that it depends on settings living elsewhere:
 * the tenant is resolved from the subdomain, the knowledge base is only served
 * if ST-09 allows it. So a smoke test that opens these pages anonymously
 * verifies far more than rendering.
 */

/* Items of the demo data set chosen for their stability: the category and the
   article exist from the seed on and depend on no other spec. */
const CATEGORY = { name: "Billing", slug: "billing" } as const;
const ARTICLE = {
  title: "How to download your invoices",
  slug: "how-to-download-your-invoices",
} as const;

/** The hero bar's container: the field AND its suggestions panel. */
function heroSearch(page: Page) {
  return page.locator('div:has(> form[role="search"])');
}

/**
 * An article's number of “Yes” votes, read where the product really exposes it:
 * AG-10's “Helpful” column.
 *
 * The portal displays it nowhere and the vote button is optimistic — it colours
 * itself before the server action has even answered. Settling for the thank-you
 * on screen would let through a vote that never reaches the database.
 */
async function helpfulVotes(agentPage: Page): Promise<number> {
  await agentPage.goto("/app/kb");
  // The tree opens on the first category: the one carrying the article has to
  // be selected (a parent category includes the articles of its sections).
  await agentPage.locator('a[href^="/app/kb?cat="]').filter({ hasText: CATEGORY.name }).click();
  await agentPage.waitForURL(/\/app\/kb\?cat=/, { timeout: 10_000 });

  const row = agentPage.locator('a[href^="/app/kb/"]').filter({ hasText: ARTICLE.title });
  await expect(row).toHaveCount(1, { timeout: 10_000 });

  // The “Helpful” column is the row's only cell to prefix its number with a
  // “+”: that is how it is designated, rather than by its position, which would
  // move on the first reshuffle of the table. An article with no vote shows “—”
  // and no cell matches then: that is zero.
  const cell = row.locator("> span").filter({ hasText: /^\+\d/ });
  if ((await cell.count()) === 0) return 0;
  return Number((await cell.innerText()).replace(/\D/g, ""));
}

test.describe("Public portal", () => {
  test("the help centre home page opens without an account and carries its hero", async ({ page }) => {
    // A blunt 200, no redirect: that is the proof that the middleware resolved
    // the tenant from the subdomain. When that resolution falls over, the whole
    // portal answers 404 and every other assertion lies about the cause.
    await expectStatus(page, "/help", 200);

    await page.goto("/help");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    // The hero shows either the welcome text set in ST-09 or the translation:
    // we do not pin its value down, but an empty heading would be a broken home
    // page — it is the only thing the visitor reads on arriving.
    await expect(heading).not.toBeEmpty();

    // Search is offered to the anonymous visitor: the base is published and public.
    await expect(heroSearch(page).getByRole("textbox")).toBeVisible();
  });

  test("the hero search suggests articles while typing", async ({ page }) => {
    await page.goto("/help");
    const bar = heroSearch(page);
    await bar.getByRole("textbox").fill("invoice");

    // The suggestions come from /api/portal/kb-suggest, called after a typing
    // pause: we wait for the panel, never for a delay. The assertion is carried
    // by the bar's container, because the same titles also appear in “Most
    // viewed” further down — looking for a link there would go green with an
    // entirely dead typeahead.
    const suggestion = bar.getByRole("link", { name: ARTICLE.title });
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toHaveAttribute("href", `/help/articles/${ARTICLE.slug}`);
  });

  test("a category on the home page opens its own page", async ({ page }) => {
    await page.goto("/help");
    await page.locator(`a[href="/help/categories/${CATEGORY.slug}"]`).click();

    await expect(page).toHaveURL(new RegExp(`/help/categories/${CATEGORY.slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(CATEGORY.name);
  });

  test("an article opens from its category with its body, its date and its vote", async ({
    page,
  }) => {
    await page.goto(`/help/categories/${CATEGORY.slug}`);
    await page.getByRole("link", { name: ARTICLE.title }).click();

    await expect(page).toHaveURL(new RegExp(`/help/articles/${ARTICLE.slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ARTICLE.title);

    // The body is stored as markdown and rendered by ArticleBody: a section
    // heading proves the rich rendering really happened, where a mere snippet
    // of text would pass even if the page spat the raw markdown back out.
    await expect(page.getByRole("heading", { level: 2, name: "From the customer area" })).toBeVisible();
    await expect(page.locator("p").filter({ hasText: "stay accessible for ten years" })).toBeVisible();

    // The meta line must carry a REAL date: the assertion demands a digit
    // after “Updated”, which an uninterpolated template (“{date}”)
    // would not have. It is looked for inside a <p> and not in the whole page,
    // because the translation dictionary is serialised in a <script> of the page
    // and contains the template word for word.
    await expect(page.locator("p").filter({ hasText: /^Updated \d/ })).toBeVisible();

    // The vote block is part of the article: without it, no feedback comes back
    // from the knowledge base.
    await expect(page.getByRole("button", { name: /Yes/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /No/ })).toBeVisible();
  });

  test("an article's “Yes” vote is counted and the visitor is thanked", async ({
    page,
  }) => {
    // Two sessions and several round trips through AG-10: the check is worth
    // the time it takes, but it does not fit in the default budget.
    test.setTimeout(120_000);

    const agent = await page.context().browser()!.newContext();
    const agentPage = await agent.newPage();
    // Two reasons, both foreign to the portal, make an isolated agent sign-in
    // fail: AG-01 is a client component, and a click arriving before hydration
    // goes out as a native submission that leaves the browser on /login; and
    // Better Auth limits /sign-in/email to three calls per ten seconds per IP,
    // which the screen displays as “Incorrect credentials”. We retry until the
    // agent workspace opens.
    await expect(async () => {
      await signInAgent(agentPage, AGENTS.admin);
    }).toPass({ timeout: 45_000 });
    const before = await helpfulVotes(agentPage);

    await page.goto(`/help/articles/${ARTICLE.slug}`);

    // Same race for the vote block: a click earlier than hydration is lost
    // without a word on screen. We retry until the thank-you — the component
    // ignores a second identical click, so the counter cannot be incremented
    // twice by this loop. The +1 left on the seeded article is deliberate: it is
    // a counter, not a setting, and the next run starts again from the value it
    // has just read.
    await expect(async () => {
      await page.getByRole("button", { name: /Yes/ }).click();
      await expect(page.locator("p").filter({ hasText: "Thanks for your feedback." })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });

    // What the product retains. The vote goes out in a React transition: the
    // database lags behind the screen, so the column is read again until the +1
    // rather than betting on a single moment.
    await expect(async () => {
      expect(await helpfulVotes(agentPage)).toBe(before + 1);
    }).toPass({ timeout: 25_000 });

    await agent.close();
  });

  test("the full-page search lists the matching articles", async ({ page }) => {
    await page.goto("/help/search?q=invoice");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Results");
    // At least one result, and it leads somewhere: the result list can render
    // titles without knowing how to build the links to the articles.
    const results = page.locator('main a[href^="/help/articles/"]');
    await expect(results.first()).toBeVisible();
    await expect(results.filter({ hasText: ARTICLE.title })).toHaveCount(1);
  });

  test("a search with no result offers to submit a request", async ({ page }) => {
    const query = "zzqqxwv-introuvable";
    await page.goto(`/help/search?q=${query}`);

    // The empty state echoes the query: that is what distinguishes “nothing
    // found for this word” from a broken search page.
    await expect(page.locator("p").filter({ hasText: "No results" })).toContainText(query);

    // The button is the visitor's emergency exit. It is looked for inside
    // <main>: the portal header carries the same label on every page, and
    // finding it there would say nothing about the empty state.
    const button = page.locator("main").getByRole("link", { name: "Submit a request" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("href", "/help/requests/new");
  });

  test("the portal footer carries the tenant's copyright", async ({ page }) => {
    await page.goto("/help");
    const footer = page.locator("footer");

    // The copyright is always there, whatever the setting.
    await expect(footer).toContainText(new RegExp(`© ${new Date().getFullYear()}`));

    // “Powered by Open HelpDesk” depends on ST-09 (“Hide Powered by”, gated by
    // an entitlement): a smoke test must not presume a setting it does not
    // drive. So only consistency is checked — if the mention is there, the
    // sentence is glued back together around its link, which is the real risk
    // (it is split up to keep each language's word order). Hiding it is covered
    // by settings-toggles.
    const mention = footer.getByRole("link", { name: "Open HelpDesk" });
    if ((await mention.count()) > 0) {
      await expect(footer).toContainText("Powered by Open HelpDesk");
      await expect(mention).toHaveAttribute("href", "https://open-helpdesk.com");
    }
  });
});
