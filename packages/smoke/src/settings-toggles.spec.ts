import { expect, test, type Page } from "@playwright/test";
import { AGENTS, expectStatus, signInAgent, uniqueEmail, uniqueSubject } from "./helpers";

/**
 * ST-09 — the two portal toggles really do switch things off.
 *
 * “Customer portal enabled” and “Knowledge base published” were saved by the
 * administration screen without anybody ever reading them: they were flipped,
 * the screen confirmed, and the portal went on serving everything. A test that
 * merely reopened the screen would see the setting “off” and go green. That is
 * why everything is verified here from the visitor's side — HTTP codes of the
 * public pages, content of the home page, answer of the suggestions API — and
 * never in the form that has just been submitted.
 *
 * The tenant is shared by every spec: both settings are put back in service in
 * an afterEach, failures included.
 */

/** The portal's three doors: browsing, signing in, submitting a request. */
const PORTAL_ROUTES = ["/help", "/help/login", "/help/requests/new"];

/**
 * Opens the portal settings screen with a manager session.
 *
 * Agent sign-in lands on the inbox — the heaviest page of the product — and the
 * shared helper allows it 15 s. On a loaded machine that budget is exceeded
 * while the session is in fact wide open. So the settings screen is aimed at
 * directly, and the form is only used if the application sends us back to
 * /login. If signing in is really broken, the failure still comes — simply at
 * the end of the loop, and on the same error.
 */
async function openPortalSettings(page: Page): Promise<void> {
  await expect(async () => {
    await page.goto("/app/settings/portal");
    if (page.url().includes("/app/settings/portal")) return;
    // Tenant settings require a manager: the Agent has no access to them.
    await signInAgent(page, AGENTS.admin);
    await page.goto("/app/settings/portal");
    await expect(page).toHaveURL(/\/app\/settings\/portal/);
  }).toPass({ timeout: 60_000 });
}

/**
 * Flips one of the ST-09 toggles and saves.
 *
 * The `<input>` is not what gets clicked: the settings toggle hides its checkbox
 * (`position:absolute; width:0; height:0; opacity:0`), it measures 0×0 and
 * refuses the click even with `force` (“Element is outside of the viewport”). So
 * we click what a user clicks: the visible knob, `span.ohd-knob`.
 *
 * This selector used to carry an `st-` prefix that exists nowhere in the
 * product — the component renders `label.ohd-toggle`. The click was therefore
 * ALWAYS ignored, and these two tests only passed when the wanted state already
 * happened to be in place: the tests written to catch “a saved setting nobody
 * reads” were not actuating any toggle at all.
 */
async function setToggle(
  page: Page,
  name: "portalEnabled" | "kbPublished",
  on: boolean,
): Promise<void> {
  await openPortalSettings(page);
  const box = page.locator(`input[name="${name}"]`);
  await expect(box).toHaveCount(1);
  if ((await box.isChecked()) !== on) {
    await page.locator(`label.ohd-toggle:has(input[name="${name}"]) .ohd-knob`).click();
  }
  // The wanted state must be reached BEFORE submitting: a knob that had not
  // taken the click would get the opposite state saved, and the test would lie
  // in both directions at once.
  await expect(box).toBeChecked({ checked: on });
  await page.locator('form:has(input[name="portalEnabled"]) button[type=submit]').click();
  // The `saved=1` redirect is the only confirmation that the server action went
  // all the way through: staying on the screen would prove nothing.
  await expect(page).toHaveURL(/saved=1/);
}

test.describe("Portal toggles (ST-09)", () => {
  test.beforeEach(async ({ page }) => {
    // Two round trips through the settings plus a customer journey: the default
    // 30 s budget is not enough, and a test that times out says nothing.
    test.setTimeout(120_000);
    await openPortalSettings(page);
  });

  test.afterEach(async ({ page }) => {
    // Unconditional restoration: the tenant is shared and workers is 1. A
    // portal left switched off would drop every following spec into 404, and
    // they would then fail for a reason that is none of their business.
    await setToggle(page, "portalEnabled", true);
    await setToggle(page, "kbPublished", true);
  });

  test("portal switched off, the help centre and the widget no longer exist", async ({ page }) => {
    await setToggle(page, "portalEnabled", false);

    // The whole portal disappears — including customer sign-in and request
    // submission, which live under /help. That is the setting's promise: not an
    // information page, a shutdown.
    for (const path of PORTAL_ROUTES) await expectStatus(page, path, 404);
    // The embedded widget submits its requests to the same place: it falls too.
    await expectStatus(page, "/widget", 404);

    /* --- Switched back on, everything comes back --- */
    await setToggle(page, "portalEnabled", true);
    for (const path of PORTAL_ROUTES) await expectStatus(page, path, 200);
    await expectStatus(page, "/widget", 200);
  });

  test("knowledge base unpublished, support stays open but the articles disappear", async ({
    page,
  }) => {
    await setToggle(page, "portalEnabled", true);

    // Control: base published, the home page does announce its categories and
    // its search. Without this step, the absence observed below would prove
    // nothing — a home page left empty for an entirely different reason would go
    // green.
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
    await expect(page.locator('form[role="search"]')).toBeVisible();
    await expect(page.locator('a[href^="/help/categories/"]').first()).toBeVisible();

    await setToggle(page, "kbPublished", false);

    // Switching the base off does not close support: the portal still answers
    // and a request can still be submitted. The two settings are independent.
    await expectStatus(page, "/help", 200);
    await expectStatus(page, "/help/requests/new", 200);

    // The base's pages, on the other hand, cease to exist. “Billing” is a
    // category of the demo data set, stable from one run to the next.
    await expectStatus(page, "/help/categories/billing", 404);
    await expectStatus(page, "/help/search?q=invoice", 404);

    // The typeahead is served by a public API: if it went on answering, it
    // would remain a window open onto articles the pages refuse to open — hence
    // a leak of unpublished content.
    const suggest = await page.request.get("/api/portal/kb-suggest?q=invoice", {
      failOnStatusCode: false,
    });
    expect(suggest.status(), "/api/portal/kb-suggest should answer 200").toBe(200);
    expect(await suggest.json(), "no suggestion once the base is unpublished").toEqual([]);

    // The home page stops announcing what it can no longer serve: no
    // “Categories” section, no search bar. The category links are counted on
    // top of the heading — it is the whole section that must fall, not just its
    // header.
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Categories" })).toHaveCount(0);
    await expect(page.locator('form[role="search"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/help/categories/"]')).toHaveCount(0);

    /* --- Support really still works, not just in HTTP 200 --- */
    const email = uniqueEmail("kb-off");
    const subject = uniqueSubject("Base unpublished, request all the same");
    await page.goto("/help/requests/new");
    await page.locator("#pt-email").fill(email);
    await page.locator("#pt-subject").fill(subject);
    await page.locator("#pt-body").fill(
      "Bonjour, je ne trouve plus la documentation. Pouvez-vous m'aider ?",
    );
    await page.locator("button[type=submit]").click();

    // The reference on the confirmation page is the only proof that the request
    // was created: the fields' content, for its part, would stay in the DOM even
    // if nothing had been sent.
    await expect(page).toHaveURL(/\/help\/requests\/submitted/);
    const reference = await page.locator("span.font-mono").first().innerText();
    expect(reference, "the submitted request must carry a number").toMatch(/^#\d+$/);
  });
});
