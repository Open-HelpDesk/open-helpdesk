import { expect, type Page } from "@playwright/test";
import { BASE_URL, MAILPIT_URL } from "../playwright.config";

/* ---------------------------------------------------------------------------
 * Demo data set accounts (packages/db seed + pnpm db:seed:auth).
 * The password is shared and deliberately trivial: dev only.
 * ------------------------------------------------------------------------- */

export const PASSWORD = "demo-openhelpdesk";

export const AGENTS = {
  owner: "claire.bonnet@acme.example",
  admin: "marie.dupont@acme.example",
  agent: "thomas.roux@acme.example",
} as const;

/** A fresh address on every run: the portal creates the contact on the fly. */
export function uniqueEmail(prefix = "smoke"): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@nordfil.example`;
}

/** A distinctive subject, so the request can be found again on the agent side. */
export function uniqueSubject(label: string): string {
  return `[smoke ${new Date().toISOString().slice(11, 19)}] ${label}`;
}

/* ---------------------------------------------------------------------------
 * Sign-in
 * ------------------------------------------------------------------------- */

/**
 * Signs an agent in with email + password and waits for the inbox.
 *
 * The attempt is replayed: Better Auth caps /sign-in at three calls per ten
 * seconds per IP, and a whole suite shares that counter. On screen the 429 is
 * indistinguishable from a wrong password — the application shows “Incorrect
 * credentials.” in both cases — so the only way to tell is to try again after
 * the window.
 */
export async function signInAgent(page: Page, email: string): Promise<void> {
  await expect(async () => {
    await page.goto("/login");
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/app\//, { timeout: 8_000 });
  }).toPass({ timeout: 60_000, intervals: [1_000, 3_000, 6_000, 12_000] });
}

export async function signOutAgent(page: Page): Promise<void> {
  await page.request.post("/api/auth/sign-out");
  await page.context().clearCookies();
}

/* ---------------------------------------------------------------------------
 * Magic link — the only way to open a customer session
 * ------------------------------------------------------------------------- */

type MailpitMessage = { ID: string; Subject: string; To: { Address: string }[] };

/**
 * Retrieves the sign-in link sent to this address.
 *
 * Mailpit is polled in a loop: sending is asynchronous and a test that reads
 * the mailbox too early fails for a reason unrelated to the product.
 */
export async function magicLinkFor(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=30`);
    const { messages } = (await res.json()) as { messages: MailpitMessage[] };
    const hit = messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()));
    if (hit) {
      const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${hit.ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      const body = `${full.Text ?? ""}${full.HTML ?? ""}`;
      const link = [...body.matchAll(/https?:\/\/[^\s"<>]+/g)]
        .map((m) => m[0])
        .find((u) => u.includes("/help/auth"));
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `No magic link for ${email} after ${timeoutMs} ms. ` +
      `Is Mailpit answering on ${MAILPIT_URL}? Do the tenant's email settings point at its SMTP (localhost:1026)?`,
  );
}

/** Opens a customer session end to end: form → email → link. */
export async function signInContact(page: Page, email: string): Promise<void> {
  await page.goto("/help/login");
  await page.locator("#pt-login-email").fill(email);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/sent=1/);

  const link = await magicLinkFor(email);
  // The link MUST carry the tenant's subdomain: that is exactly what was
  // broken (a redirect to a bare domain, hence 404).
  expect(link).toContain(new URL(BASE_URL).host);
  await page.goto(link);
  await expect(page).toHaveURL(/\/help\/requests/);
}

/* ---------------------------------------------------------------------------
 * Tenant settings, driven through the administration interface
 *
 * We go through the screens rather than through SQL: a smoke test writing
 * straight to the database would say nothing about the administration screen,
 * and that is precisely where a setting can be saved without ever being read.
 * ------------------------------------------------------------------------- */

/**
 * Flips one of the ST-09 toggles and saves. `on` = wanted state.
 *
 * The checkbox itself is hidden by the Toggle component
 * (`.ohd-toggle input { opacity: 0; width: 0; height: 0 }`): it measures 0×0 and
 * refuses the click, even with `force`. The visible knob is what to aim at.
 */
export async function setPortalToggle(
  page: Page,
  name: "portalEnabled" | "kbPublished",
  on: boolean,
): Promise<void> {
  await page.goto("/app/settings/portal");
  const box = page.locator(`input[name="${name}"]`);
  await expect(box).toHaveCount(1);
  if ((await box.isChecked()) !== on) {
    await page.locator(`label.ohd-toggle:has(input[name="${name}"]) .ohd-knob`).click();
    await expect(box).toBeChecked({ checked: on });
  }
  await page.locator('form:has(input[name="portalEnabled"]) button[type=submit]').click();
  // The server action redirects with ?saved=1: without this wait, the next
  // navigation is cancelled by the redirect and we read the old state.
  await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
}

/**
 * Changes the software language (ST-01) and waits for the server's confirmation.
 *
 * Waiting for the `<select>` to carry the value proves nothing — it carries it
 * from the click on, before the action has answered. We wait for the
 * acknowledgement, failing which the late redirect cancels the next navigation.
 */
export async function setTenantLocale(page: Page, code: string): Promise<void> {
  await page.goto("/app/settings/general");
  await page.locator('select[name="locale"]').selectOption(code);
  await page.locator('form:has(select[name="locale"]) button[type=submit]').last().click();
  await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
  await expect(page.locator('select[name="locale"]')).toHaveValue(code);
}

/* ---------------------------------------------------------------------------
 * Small shared assertions
 * ------------------------------------------------------------------------- */

/** Checks that a URL really answers the expected status, without navigating. */
export async function expectStatus(page: Page, path: string, status: number): Promise<void> {
  const res = await page.request.get(path, { maxRedirects: 0, failOnStatusCode: false });
  expect(res.status(), `${path} should answer ${status}`).toBe(status);
}
