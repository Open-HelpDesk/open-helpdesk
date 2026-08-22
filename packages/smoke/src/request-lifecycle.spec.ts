import { expect, test } from "@playwright/test";
import { AGENTS, signInAgent, signInContact, uniqueEmail, uniqueSubject } from "./helpers";

/**
 * The journey that makes the product: a customer submits a request, an agent
 * answers it, the customer reads the answer.
 *
 * It crosses almost everything — contact created on the fly, email sending,
 * magic link, customer session, agent inbox, discussion thread, resolution. If
 * this test passes, the product works; if it breaks, something essential is
 * broken.
 */
test.describe("Request lifecycle", () => {
  test("a customer submits a request, an agent answers, the customer reads it", async ({ page }) => {
    const email = uniqueEmail("client");
    const subject = uniqueSubject("Export PDF impossible");

    /* --- 1. Submitting the request, with no prior account --- */
    await page.goto("/help/requests/new");
    await page.locator("#pt-email").fill(email);
    await page.locator("#pt-subject").fill(subject);
    await page.locator("#pt-body").fill(
      "Hello, the export button has stopped responding since this morning. Thanks for your help.",
    );
    await page.locator('button[type=submit]').click();

    // The confirmation carries the reference: that is what the customer keeps.
    await expect(page).toHaveURL(/\/help\/requests\/submitted/);
    const reference = await page.locator("span.font-mono").first().innerText();
    expect(reference).toMatch(/^#\d+$/);
    const number = reference.replace("#", "");

    /* --- 2. The customer opens their session through the magic link --- */
    await signInContact(page, email);
    await expect(page.getByText(subject)).toBeVisible();

    /* --- 3. Agent side: the request has landed in the inbox --- */
    const agent = await page.context().browser()!.newContext();
    const agentPage = await agent.newPage();
    await signInAgent(agentPage, AGENTS.admin);
    await agentPage.goto(`/app/tickets/${number}`);
    await expect(agentPage.getByText(subject).first()).toBeVisible();

    /* --- 4. The agent answers --- */
    const answer = "Hello, the fix is deployed. Could you try again?";
    const editor = agentPage.locator("textarea").first();
    await editor.fill(answer);
    await agentPage.getByRole("button", { name: /Send/i }).first().click();

    /* --- 5. The customer sees the answer on their portal --- */
    // This is where the sending is verified, and nowhere else. On the agent
    // side the composer keeps its draft after submission and the text stays in
    // the field's DOM: looking for the answer there would go green without
    // anything having been sent. The customer's thread, on the other hand, is
    // rendered by the server — we reload until it carries the answer.
    await expect(async () => {
      await page.goto(`/help/requests/${number}`);
      await expect(page.getByText(answer)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 25_000 });

    await agent.close();
  });

  test("a request submitted without a valid email is not created", async ({ page }) => {
    await page.goto("/help/requests/new");
    await page.locator("#pt-subject").fill(uniqueSubject("sans email"));
    await page.locator("#pt-body").fill("Body of the request.");
    await page.locator('button[type=submit]').click();
    // The email field is required: the browser blocks, we stay on the form.
    await expect(page).toHaveURL(/\/help\/requests\/new/);
  });
});
