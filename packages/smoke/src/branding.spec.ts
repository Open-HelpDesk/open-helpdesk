import { expect, test, type Page } from "@playwright/test";
import { AGENTS, signInAgent } from "./helpers";
import { BASE_URL } from "../playwright.config";

/**
 * Workspace logo and favicon (ST-01).
 *
 * These two controls were drawn and inert: a dotted area that opened onto
 * nothing. They now really upload a file — and that is exactly the kind of
 * feature whose whole chain has to be verified, because an upload can succeed
 * without anything showing up: the object is stored, the `branding` column is
 * written, and both shells go on displaying the initial. This is the family of
 * defects that has cost the most on this product.
 */

/** A valid 2×2 PNG, the smallest file that proves the image is served. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8DAwMDEwMDAwAAAF7wBLwLZk2wAAAAASUVORK5CYII=",
  "base64",
);

/** A file the server must refuse: the type is not an accepted image. */
const TEXT = Buffer.from("ceci n'est pas une image", "utf8");

const FIELD = { logo: 'input[name="logo"]', favicon: 'input[name="favicon"]' } as const;

/** The design system accent, the one of the demo tenant. */
const ACCENT_DEFAULT = "#0B5F46";
/** An accent that cannot be mistaken for a hard-coded colour. */
const ACCENT_TEST = "#1D4ED8";

/** The hexadecimal field of the accent picker (the group's only visible field). */
function accentField(page: Page) {
  return page.locator('div:has(> input[name="accentColor"]) > input:not([type="hidden"])');
}

/**
 * The “✕” button of a brand field.
 *
 * Designated as a sibling of the file field, and not by its `aria-pressed`: the
 * accent colour picker on the same screen carries one on each of its five
 * swatches, and a global `.first()` would click a colour.
 */
function clearButton(page: Page, name: "logo" | "favicon") {
  // The field lives INSIDE the `label` of the dotted area, not as a direct
  // child of the row: so we climb with `:has` and no `>` on the field side, and
  // keep the `>` on the button side, the only way to rule out the enclosing
  // divs — `:has` climbs up to the page wrapper, which also contains the rail.
  return page.locator(`div:has(input[name="${name}"]) > button[aria-pressed]`);
}

/** The field's preview: the square at the head of the row, never the rail's logo. */
function fieldPreview(page: Page, name: "logo" | "favicon") {
  return page.locator(`div:has(input[name="${name}"]) > span > img`);
}

async function openSettings(page: Page) {
  await page.goto("/app/settings/general");
  // We wait for the form, not for the heading: the screen carries TWO <h1> —
  // the one of the settings navigation (“Settings”) and the one of the page. And
  // the form is what these tests need anyway.
  await expect(page.locator('form:has(select[name="locale"])')).toBeVisible();
}

/** Saves the identity form and waits for the acknowledgement. */
async function save(page: Page) {
  await page.locator('form:has(select[name="locale"]) button[type=submit]').last().click();
}

/** Hands the tenant back as it was found: no logo, no favicon, original accent. */
async function resetBranding(page: Page) {
  await openSettings(page);
  let accentToRestore = false;
  if ((await accentField(page).inputValue()) !== ACCENT_DEFAULT) {
    await accentField(page).fill(ACCENT_DEFAULT);
    accentToRestore = true;
  }
  let n = 0;
  for (const name of ["logo", "favicon"] as const) {
    const button = clearButton(page, name);
    if ((await button.count()) > 0) {
      await button.click();
      n++;
    }
  }
  if (n > 0 || accentToRestore) {
    await save(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
  }
}

test.describe("Workspace logo and favicon", () => {
  test.beforeEach(async ({ page }) => {
    // Owner: uploading is reserved for the management roles (requireManager).
    await expect(async () => {
      await signInAgent(page, AGENTS.owner);
    }).toPass({ timeout: 60_000 });
    await resetBranding(page);
  });

  test.afterEach(async ({ page }) => {
    await resetBranding(page);
  });

  test("the logo field is a real file input, not a decoration", async ({ page }) => {
    await openSettings(page);
    // The regression this test guards: both controls used to be <span>s.
    await expect(page.locator(FIELD.logo)).toHaveCount(1);
    await expect(page.locator(FIELD.favicon)).toHaveCount(1);
    await expect(page.locator(FIELD.logo)).toHaveAttribute("accept", /image\/png/);
    await expect(page.locator(FIELD.favicon)).toHaveAttribute("accept", /ico/);
  });

  test("an uploaded logo shows in the agent workspace AND in the portal header", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openSettings(page);
    await page
      .locator(FIELD.logo)
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await save(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

    // 1. The settings screen reads back what it has just written.
    const preview = page.locator('img[src^="/api/brand/"]');
    await expect(preview.first()).toBeVisible();
    const url = (await preview.first().getAttribute("src"))!;

    // 2. The file is really served — a preview can point at a 404.
    const served = await page.request.get(url);
    expect(served.status(), `${url} should answer 200`).toBe(200);
    expect(served.headers()["content-type"]).toContain("image/png");

    // 3. The agent workspace rail: that is where the initial used to show.
    await page.goto("/app/tickets");
    await expect(page.locator(`aside img[src="${url}"]`)).toBeVisible();

    // 4. The portal header — another shell, another layout. This is the place
    //    a partial wiring forgets.
    await page.goto("/help");
    await expect(page.locator(`header img[src="${url}"]`)).toBeVisible();
  });

  test("an uploaded favicon is declared in the document head", async ({ page }) => {
    await openSettings(page);
    await page
      .locator(FIELD.favicon)
      .setInputFiles({ name: "favicon.png", mimeType: "image/png", buffer: PNG });
    await save(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

    // The favicon lives in the ROOT layout, shared by the portal and the agent
    // workspace: it must be declared on both sides.
    for (const path of ["/app/tickets", "/help"]) {
      await page.goto(path);
      const link = page.locator('link[rel="icon"]');
      await expect(link, `favicon missing from ${path}`).toHaveCount(1);
      await expect(link).toHaveAttribute("href", /^\/api\/brand\//);
    }
  });

  test("removing the logo restores the workspace initial", async ({ page }) => {
    await openSettings(page);
    await page
      .locator(FIELD.logo)
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await save(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
    await expect(page.locator('img[src^="/api/brand/"]').first()).toBeVisible();

    // The ✕ does not remove on its own: it marks, and saving is what applies.
    // A button that had submitted on its own would have carried away the name
    // and the language just changed on the same screen.
    await clearButton(page, "logo").click();
    // The field's preview falls back to the initial, but the agent workspace
    // rail keeps the logo: nothing is saved yet, and that is exactly what we
    // want. So the assertion is carried by the field, not by the page.
    await expect(fieldPreview(page, "logo")).toHaveCount(0);
    await expect(page.locator('aside img[src^="/api/brand/"]')).toBeVisible();

    await save(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

    // Once saved, no logo anywhere — rail included.
    await expect(page.locator('img[src^="/api/brand/"]')).toHaveCount(0);
    await page.goto("/help");
    await expect(page.locator('header img[src^="/api/brand/"]')).toHaveCount(0);
  });

  test("a file in the wrong format is refused, and says so", async ({ page }) => {
    await openSettings(page);
    await page
      .locator(FIELD.logo)
      .setInputFiles({ name: "logo.txt", mimeType: "text/plain", buffer: TEXT });
    await save(page);

    // Refused BEFORE writing: the URL carries the error, not ?saved=1, and the
    // banner announces it. A silent refusal is the defect looked for here.
    await expect(page).toHaveURL(/error=logo-format/, { timeout: 15_000 });
    await expect(page.locator('img[src^="/api/brand/"]')).toHaveCount(0);
  });

  test("a logo URL only serves the workspace of its own domain", async ({ page }) => {
    await openSettings(page);
    await page
      .locator(FIELD.logo)
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await save(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

    const url = (await page.locator('img[src^="/api/brand/"]').first().getAttribute("src"))!;
    // Same key, another tenant identifier: the route must refuse. Without that
    // guard, a logo URL would let another workspace's files be read.
    const otherTenantUrl = url.replace(
      /\/api\/brand\/[0-9a-f-]{36}\//,
      "/api/brand/00000000-0000-0000-0000-000000000000/",
    );
    expect(otherTenantUrl, "the URL was not rewritten — the test would prove nothing").not.toBe(url);
    await expectRefused(page, otherTenantUrl);

    // And a malformed key is refused by the expression, without touching
    // storage. (No “..” here: `new URL` would normalise it, and the test would
    // then bear on a route other than the one we mean to exercise.)
    await expectRefused(page, "/api/brand/pas-un-uuid/logo-x.png");
    await expectRefused(page, "/api/brand/00000000-0000-0000-0000-000000000000/sansprefixe.png");
  });
  test("the public satisfaction page carries the tenant's brand", async ({ page }) => {
    await openSettings(page);
    await page
      .locator(FIELD.logo)
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await page
      .locator(FIELD.favicon)
      .setInputFiles({ name: "favicon.png", mimeType: "image/png", buffer: PNG });
    // An accent that is not the design system's: without it, the assertion on
    // the colour would pass just as well with the value left hard-coded.
    await accentField(page).fill(ACCENT_TEST);
    await save(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

    // /api/csat is a standalone HTML document, assembled by hand, outside any
    // layout: it benefits from nothing and must therefore declare everything
    // itself. It is called WITHOUT a valid signature — the error page goes
    // through the same template, which saves having to forge an HMAC.
    const res = await page.request.get("/api/csat");
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html, "the tenant's favicon must be declared").toMatch(
      /<link rel="icon" href="\/api\/brand\/[0-9a-f-]{36}\/favicon-/,
    );
    expect(html, "the tenant's logo must be displayed").toMatch(
      /<img src="\/api\/brand\/[0-9a-f-]{36}\/logo-/,
    );
    // The tenant's accent replaces the design system green in the stylesheet:
    // the page used to hard-code its colour.
    expect(html.toLowerCase()).toContain(`background:${ACCENT_TEST.toLowerCase()};color:#fff`);
    expect(html.toLowerCase()).not.toContain(ACCENT_DEFAULT.toLowerCase());
  });

  test("a malformed brand identity is ignored, not interpolated", async ({ page }) => {
    // The colour goes into CSS and the URLs into attributes, both assembled by
    // hand. The values are validated on saving, but a value that arrived by
    // another route must not be able to close a declaration. With no logo and no
    // favicon set, the page must simply declare nothing — never an empty
    // attribute or an open tag.
    const html = await (await page.request.get("/api/csat")).text();
    expect(html).not.toContain('<link rel="icon" href="">');
    expect(html).not.toContain('<img src=""');
    // And the accent stays a hexadecimal colour, whatever happens.
    expect(html).toMatch(/background:#[0-9a-fA-F]{6};color:#fff;border:0/);
  });
});

/** A blunt 404, no redirect: the route refuses instead of serving. */
async function expectRefused(page: Page, path: string) {
  const res = await page.request.get(new URL(path, BASE_URL).toString(), {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(res.status(), `${path} should be refused`).toBe(404);
}
