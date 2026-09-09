import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  AGENT_NAMES,
  AGENTS,
  dismissTour,
  expectStatus,
  signInAgent,
  uniqueEmail,
  uniqueSubject,
} from "./helpers";

/**
 * An agent's day: they sign in, read their inbox, switch view, open a ticket,
 * fix its priority, search in the palette, then leave.
 *
 * Every test starts from a request the test itself submitted on the portal. The
 * demo data set moves — the other journeys create, assign and resolve tickets —
 * and aiming at a seeded ticket would make this file fail for a reason that has
 * nothing to do with the agent workspace.
 */

// The properties panel is `xl:flex`: below 1280 px it is not hidden, it is
// absent from the DOM. Without this viewport, the assertions aiming at it
// would fail because of the browser size, not because of the product.
test.use({ viewport: { width: 1440, height: 900 } });

// Submitting a request, signing in and reloading a ticket does not always fit
// in 30 s on a shared instance: the default budget is too short here.
test.describe.configure({ timeout: 90_000 });

/* ---------------------------------------------------------------------------
 * Agent session
 *
 * better-auth only accepts three calls to /sign-in per 10 s window, all origins
 * taken together. A file that replays the form on every test gets thrown out on
 * the third: the test then fails on a product protection, not on what it claims
 * to verify. So ONE session is opened for the whole file and lent to the
 * following contexts; only the test that is really about signing in goes back
 * through the form.
 * ------------------------------------------------------------------------- */

let agentCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

/**
 * Agent sign-in tolerant of the authentication quota: a refused attempt leaves
 * the form in place, so it is replayed until the inbox comes up. If they all
 * fail, the error reported is the helper's (the inbox never came).
 */
async function signIn(page: Page, email: string): Promise<void> {
  await expect(async () => {
    await signInAgent(page, email);
  }).toPass({ timeout: 60_000, intervals: [2_000, 5_000, 8_000] });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, AGENTS.agent);
  // The first-run tour draws a scrim over the whole inbox: without this, every
  // click below waits ninety seconds for an element that cannot receive it.
  await dismissTour(page);
  agentCookies = await context.cookies();
  await context.close();
});

/** Makes the current context authenticated, without going through the form. */
async function reuseAgentSession(page: Page): Promise<void> {
  await page.context().addCookies(agentCookies);
}

/* ---------------------------------------------------------------------------
 * Test material
 * ------------------------------------------------------------------------- */

type PortalTicket = { number: string; subject: string; body: string };

/**
 * Submits a request through the public portal, with no session, like a visitor.
 * The resulting ticket is brand new: status “New”, normal priority, no
 * assignee — exactly what an agent finds on arriving in the morning.
 */
async function submitPortalRequest(page: Page, label: string): Promise<PortalTicket> {
  const subject = uniqueSubject(label);
  const body = `Details of request ${subject} — the backup stops halfway through.`;

  await page.goto("/help/requests/new");
  await page.locator("#pt-email").fill(uniqueEmail("workday"));
  await page.locator("#pt-subject").fill(subject);
  await page.locator("#pt-body").fill(body);
  await page.locator("button[type=submit]").click();

  await expect(page).toHaveURL(/\/help\/requests\/submitted/);
  const reference = await page.locator("span.font-mono").first().innerText();
  expect(reference, "the confirmation must carry the request's reference").toMatch(/^#\d+$/);

  return { number: reference.replace("#", ""), subject, body };
}

/**
 * The inbox row that carries this subject.
 *
 * The V2 list made the rows **real links**: each card is an `<a href>` to its
 * ticket. The previous version of this helper aimed at `div.cursor-pointer`,
 * which no longer exists anywhere in the inbox — so it matched nothing, and
 * three tests died waiting on a click that could never land.
 *
 * Aiming at the role rather than at a class is also what stops this file
 * rotting again at the next redesign: a row will still be a link.
 */
function inboxRow(page: Page, subject: string) {
  return page.getByRole("link").filter({ hasText: subject });
}

/* ------------------------------------------------------------------------- */

test.describe("An agent's day", () => {
  test("an agent signs in and lands on their inbox", async ({ page }) => {
    await signIn(page, AGENTS.agent);

    await expect(page).toHaveURL(/\/app\/tickets/);
    // The views panel is the inbox's landmark: without it the agent may be
    // authenticated, but they are not home.
    await expect(page.getByRole("link", { name: /Unassigned/ })).toBeVisible();
  });

  test("the inbox row carries what an agent triages on", async ({ page }) => {
    const ticket = await submitPortalRequest(page, "Sauvegarde interrompue");
    await reuseAgentSession(page);
    await page.goto("/app/tickets?view=unassigned");

    /*
     * Rewritten for the V2 list, which is a list of cards and no longer a
     * table. The previous version asserted a sticky header with the columns
     * “Status”, “SLA” and “Assignee” — that header does not exist any more, and
     * the assignee was **deliberately** dropped from the row by the redesign.
     * Patching the selector would have been the wrong fix: the test was
     * describing a screen the product no longer has.
     *
     * What the row must still carry is what an agent decides from: which ticket
     * it is, what it is about, where it stands, and how long is left.
     */
    const row = inboxRow(page, ticket.subject);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`#${ticket.number}`);
    await expect(row).toContainText("New");

    // The link really goes to the ticket: a card that reads right and leads
    // nowhere is the defect this replaces the old click-target check with.
    await expect(row).toHaveAttribute("href", new RegExp(`/app/tickets/${ticket.number}`));

    /*
     * The SLA chip. The countdown is set at creation, so a brand new request
     * always has one.
     *
     * It is aimed at by the exact shape `slaShort()` produces — "42 min",
     * "3 h", "3 h 59", "2 d", and "-42 min" once overdue — and not by a class.
     * The anchors matter: the row also carries a relative activity time ("2 min
     * ago"), which a loose “some number and a unit” pattern would match, and the
     * assertion would then be green on a row with no deadline at all. That is
     * the trap the previous version fell into from the other side, by aiming at
     * `span.inline-flex.tabular-nums`, a class the redesign had removed.
     */
    await expect(row.getByText(/^-?\d+\s?(min|h|d)(\s\d{2})?$/)).toHaveCount(1);
  });

  test("the “Unassigned” view changes the URL and the list", async ({ page }) => {
    const ticket = await submitPortalRequest(page, "Filtre des vues");
    await reuseAgentSession(page);
    await page.goto("/app/tickets");

    // Observing an absence only makes sense once the inbox is rendered:
    // without that landmark, “no row” would also mean “no page yet”.
    const unassignedView = page.getByRole("link", { name: /Unassigned/ });
    await expect(unassignedView).toBeVisible();

    // Default view “My tickets”: the request, with no assignee, is not in it.
    await expect(inboxRow(page, ticket.subject)).toHaveCount(0);

    await unassignedView.click();

    // The view lives in the URL — that is what makes an inbox link shareable.
    await expect(page).toHaveURL(/\/app\/tickets\?view=unassigned/);
    // And the list really changed its content, not just its active view.
    await expect(inboxRow(page, ticket.subject)).toHaveCount(1);
  });

  test("opening a ticket shows its thread and its properties panel", async ({ page }) => {
    const ticket = await submitPortalRequest(page, "Ouverture du fil");
    await reuseAgentSession(page);
    await page.goto("/app/tickets?view=unassigned");
    await inboxRow(page, ticket.subject).click();

    await expect(page).toHaveURL(new RegExp(`/app/tickets/${ticket.number}`));
    await expect(page.getByRole("heading", { name: ticket.subject })).toBeVisible();

    // The customer's message is rendered in the thread, not in an input
    // field: we aim at the <article> that carries it. Looking for that text
    // anywhere would also find it in the composer, which is a textarea.
    await expect(page.locator("article").filter({ hasText: ticket.body })).toHaveCount(1);

    /*
     * The side panel. Rewritten for V2, which replaced the "Classification" and
     * "Assignment" group headings with a single "Properties" card — those two
     * i18n keys still exist in the dictionaries and are used by nothing, which
     * is how this assertion could keep naming a screen the product had
     * dropped.
     *
     * What the panel must carry is the SLA clocks an agent reads and the
     * properties they edit in place.
     */
    const panel = page.locator("aside").filter({ hasText: "Properties" });
    await expect(panel.getByText("1st reply")).toBeVisible();
    await expect(panel.locator('select:has(option[value="urgent"])')).toHaveValue("normal");
  });

  test("a priority changed in the panel survives a reload", async ({ page }) => {
    const ticket = await submitPortalRequest(page, "Priority to fix");
    await reuseAgentSession(page);
    await page.goto(`/app/tickets/${ticket.number}`);

    const priority = page.locator('select:has(option[value="urgent"])');
    await expect(priority).toHaveValue("normal");
    await priority.selectOption("high");

    // Saving is a server action. The select, for its part, would keep its new
    // value even if nothing had been sent: so we reload until the page rendered
    // by the server carries the chosen priority.
    await expect(async () => {
      await page.reload();
      await expect(priority).toHaveValue("high", { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    // The reload above is enough to prove persistence: /app/tickets/{n} is
    // rendered by the server, so the select's value comes from the database and
    // not from the state left behind by the click. This is exactly the class of
    // defect aimed at here — a setting saved but never read back.
    await expect(priority).toHaveValue("high");
  });

  test("the ⌘K palette opens on the shortcut and finds what is about invoicing", async ({
    page,
  }) => {
    await reuseAgentSession(page);
    await page.goto("/app/tickets");

    await page.keyboard.press("ControlOrMeta+k");
    const search = page.getByPlaceholder(/Search/);
    await expect(search).toBeFocused();
    await expect(page.getByText("Type at least two characters")).toBeVisible();

    await search.fill("invoice");

    // The query is deferred by 180 ms then served by /api/search: we wait for
    // the result, never for the delay.
    const article = page.getByRole("button", { name: /How to download your invoices/ });
    await expect(article).toBeVisible();
    await expect(page.getByText("Articles", { exact: true })).toBeVisible();

    // A result leads somewhere: the palette navigates and closes again. The
    // destination depends on the role — Thomas is an Agent, not a manager: he
    // is sent to the published article, the only place where he can read it.
    // The /app/kb editor stays with the managers.
    await article.click();
    await expect(search).toBeHidden();
    await expect(page).toHaveURL(/\/help\/articles\/how-to-download-your-invoices/);
  });

  // Last of the day, and it must stay that way: signing out revokes the
  // session shared by all the tests in this file.
  test("signing out closes the agent workspace again", async ({ page }) => {
    await reuseAgentSession(page);
    await page.goto("/app/tickets");

    /*
     * Sign-out lives in the agent menu since V2 — the topbar's avatar opens a
     * real menu, where it used to be a bare control with a `title`. The old
     * `getByTitle("Sign out")` matched nothing and waited out the whole
     * ninety-second budget.
     *
     * The menu button is named after its owner, so this is also the path a
     * screen reader takes.
     */
    await page.getByRole("button", { name: AGENT_NAMES.agent }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    // The real test is not the redirect but the session: the inbox must become
    // inaccessible again, even when going back to it by hand.
    await expectStatus(page, "/app/tickets", 307);
    await page.goto("/app/tickets");
    await expect(page).toHaveURL(/\/login/);
  });
});
