import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { AGENTS, signInAgent } from "./helpers";

/**
 * The role boundary on the knowledge base.
 *
 * Product rule: the whole team READS the base — an agent draws their answers
 * from it — but only Owner and Admin WRITE to it. The risk is not hiding a
 * button badly, it is hiding ONLY the button: a guard that lives in the
 * interface alone leaves the URL and the API wide open. Each prohibition is
 * therefore verified twice — the screen, then the service door.
 */

/** A tiny but genuine image: the route filters on the MIME type. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Uploads an article image the way the editor does: multipart, `file` field. */
function uploadImage(request: APIRequestContext) {
  return request.post("/api/kb/images", {
    multipart: { file: { name: "pixel.png", mimeType: "image/png", buffer: PIXEL_PNG } },
    failOnStatusCode: false,
  });
}

/**
 * Better Auth caps /sign-in at three attempts per ten-second window per IP. It
 * is a legitimate protection, but the smoke test is what trips it: past that,
 * signing in fails showing “Incorrect credentials” while the credentials are
 * good. So we retry until the session opens — a signal from the product, not a
 * blind wait.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await expect(async () => {
    await signInAgent(page, email);
  }).toPass({ timeout: 90_000, intervals: [1_000] });
}

/*
 * Both sessions are opened once for the whole file. This is not an
 * optimisation: seven sign-ins in a row would be capped by the limit above and
 * the file would fail on authentication, never on what it claims to verify.
 * None of these tests writes anything, so the pages can be shared without one
 * test soiling another.
 */
let adminContext: BrowserContext;
let adminPage: Page;
let agentContext: BrowserContext;
let agentPage: Page;
/**
 * The id of an existing article. An agent cannot discover it from their own
 * screens — their rows point at the portal, never at the editor — and that is
 * precisely why it has to be supplied from the outside in order to exercise
 * direct access by URL.
 */
let articleId: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);

  adminContext = await browser.newContext();
  adminPage = await adminContext.newPage();
  await signIn(adminPage, AGENTS.admin);

  agentContext = await browser.newContext();
  agentPage = await agentContext.newPage();
  await signIn(agentPage, AGENTS.agent);

  const res = await adminPage.request.get("/api/search?q=invoice");
  expect(res.ok(), "search must answer an Admin").toBeTruthy();
  const { articles } = (await res.json()) as { articles: { id: string }[] };
  expect(
    articles.length,
    "the demo data set must carry “invoice” articles",
  ).toBeGreaterThan(0);
  articleId = articles[0]!.id;
});

test.afterAll(async () => {
  await agentContext?.close();
  await adminContext?.close();
});

test.describe("Knowledge base: writing reserved for managers", () => {
  test("an agent reads the knowledge base", async () => {
    await agentPage.goto("/app/kb");

    // Reading is the right that remains: the tree shows and a category of the
    // demo data set does deliver its articles.
    const billingCategory = agentPage
      .locator('a[href^="/app/kb?cat="]')
      .filter({ hasText: "Billing" });
    await expect(billingCategory).toBeVisible();
    await billingCategory.click();
    await expect(agentPage.getByText("How to download your invoices")).toBeVisible();
  });

  test("an agent sees no write control", async () => {
    await agentPage.goto("/app/kb");

    // Proof that the screen is rendered, first: without it the four absences
    // that follow would go green on a blank page or on a redirect.
    await expect(agentPage.getByText("Categories", { exact: true })).toBeVisible();

    await expect(agentPage.getByRole("link", { name: "+ Article" })).toHaveCount(0);
    await expect(agentPage.locator("summary").filter({ hasText: "Rename" })).toHaveCount(0);
    await expect(
      agentPage.getByRole("button", { name: "Delete category" }),
    ).toHaveCount(0);
    await expect(agentPage.getByPlaceholder("New category")).toHaveCount(0);
  });

  test("an agent aiming at the editor by URL is sent back to the list", async () => {
    // This screen IS the editor: it has no read-only version. Hiding the link
    // would not be enough, a URL can be typed.
    await agentPage.goto("/app/kb/new");
    await expect(agentPage).toHaveURL(/\/app\/kb$/);

    await agentPage.goto(`/app/kb/${articleId}`);
    await expect(agentPage).toHaveURL(/\/app\/kb$/);
  });

  test("an agent cannot upload an article image", async () => {
    // The route the editor calls on drag and drop. It is the only write to the
    // base that does not go through a server action: if the guard were missing
    // here, no screen would say so.
    const res = await uploadImage(agentPage.request);
    expect(res.status(), "POST /api/kb/images must be refused to an Agent").toBe(403);
  });

  test("an Admin has the write controls", async () => {
    await adminPage.goto("/app/kb");

    await expect(adminPage.getByRole("link", { name: "+ Article" })).toBeVisible();
    await expect(adminPage.locator("summary").filter({ hasText: "Rename" })).toBeVisible();
    await expect(
      adminPage.getByRole("button", { name: "Delete category" }),
    ).toBeVisible();
    await expect(adminPage.getByPlaceholder("New category")).toBeVisible();
  });

  test("an Admin opens the article editor", async () => {
    await adminPage.goto("/app/kb/new");

    // We stay on /app/kb/new — the very place the Agent was sent away from —
    // and the start screen shows. Nothing is written to the database as long as
    // nothing is saved: this test leaves no article behind.
    await expect(adminPage).toHaveURL(/\/app\/kb\/new$/);
    await expect(adminPage.getByText("Where would you like to start?")).toBeVisible();
  });

  test("an Admin can upload an article image", async () => {
    const res = await uploadImage(adminPage.request);
    // It is not the object storage that is exercised here, only the role
    // boundary: 401 is excluded just as much as 403, otherwise a lost session
    // would make this test pass for the wrong reason. The uploaded pixel stays
    // in the object store — there is no route to take it back — but it is
    // attached to no article and appears on no screen.
    expect([401, 403], "POST /api/kb/images must be open to an Admin").not.toContain(
      res.status(),
    );
  });

  /*
   * The two screens do not draw the same boundary, and this is the only point
   * where this file found the product at odds with itself: /api/search holds
   * drafts back because “an unpublished title is already information”. The
   * /app/kb list still served them to everybody, “Draft” badge included, merely
   * rendering the row non-clickable: the two screens contradicted each other.
   * The list and its counters now filter the way search does, and this test
   * pins it down.
   */
  test("an agent sees no draft in the article list", async () => {
    await agentPage.goto("/app/kb");
    await agentPage
      .locator('a[href^="/app/kb?cat="]')
      .filter({ hasText: "Billing" })
      .click();
    // The category must stay populated: without this line, the absence of a
    // badge would be satisfied by an empty list.
    await expect(agentPage.getByText("How to download your invoices")).toBeVisible();
    await expect(agentPage.getByText("Brouillon", { exact: true })).toHaveCount(0);
  });

  test("search reveals no draft to an agent", async () => {
    type Article = { id: string; title: string; status: string };
    const searchUrl = "/api/search?q=invoice";

    const { articles: seenByAdmin } = (await (
      await adminPage.request.get(searchUrl)
    ).json()) as { articles: Article[] };
    const { articles: seenByAgent } = (await (
      await agentPage.request.get(searchUrl)
    ).json()) as { articles: Article[] };

    // The demo data set carries “invoice” drafts: without them, the comparison
    // below would prove nothing.
    expect(
      seenByAdmin.filter((a) => a.status === "draft").length,
      "an Admin must see the drafts in search",
    ).toBeGreaterThan(0);

    // A draft's title on its own discloses unpublished content, and the agent
    // has no screen to open it. So the boundary holds in the query, not in the
    // component that displays the ⌘K palette.
    expect(
      seenByAgent.map((a) => a.status),
      "no draft must come back to an Agent",
    ).not.toContain("draft");
    expect(
      seenByAgent.length,
      "an Agent must still see the published articles",
    ).toBeGreaterThan(0);
  });
});
