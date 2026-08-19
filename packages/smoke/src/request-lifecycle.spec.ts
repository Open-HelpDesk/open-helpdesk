import { expect, test } from "@playwright/test";
import { AGENTS, signInAgent, signInContact, uniqueEmail, uniqueSubject } from "./helpers";

/**
 * Le parcours qui fait le produit : un client dépose une demande, un agent y
 * répond, le client lit la réponse.
 *
 * Il traverse presque tout — création de contact au vol, envoi d'email, lien
 * magique, session client, inbox agent, fil de discussion, résolution. Si ce
 * test passe, le produit fonctionne ; s'il casse, quelque chose d'essentiel est
 * cassé.
 */
test.describe("Cycle de vie d'une demande", () => {
  test("un client dépose une demande, un agent répond, le client la lit", async ({ page }) => {
    const email = uniqueEmail("client");
    const subject = uniqueSubject("Export PDF impossible");

    /* --- 1. Dépôt de la demande, sans compte préalable --- */
    await page.goto("/help/requests/new");
    await page.locator("#pt-email").fill(email);
    await page.locator("#pt-subject").fill(subject);
    await page.locator("#pt-body").fill(
      "Bonjour, le bouton d'export ne répond plus depuis ce matin. Merci de votre aide.",
    );
    await page.locator('button[type=submit]').click();

    // La confirmation porte la référence : c'est elle que le client gardera.
    await expect(page).toHaveURL(/\/help\/requests\/submitted/);
    const reference = await page.locator("span.font-mono").first().innerText();
    expect(reference).toMatch(/^#\d+$/);
    const number = reference.replace("#", "");

    /* --- 2. Le client ouvre sa session par lien magique --- */
    await signInContact(page, email);
    await expect(page.getByText(subject)).toBeVisible();

    /* --- 3. Côté agent : la demande est arrivée dans l'inbox --- */
    const agent = await page.context().browser()!.newContext();
    const agentPage = await agent.newPage();
    await signInAgent(agentPage, AGENTS.admin);
    await agentPage.goto(`/app/tickets/${number}`);
    await expect(agentPage.getByText(subject).first()).toBeVisible();

    /* --- 4. L'agent répond --- */
    const answer = "Bonjour, le correctif est déployé. Pouvez-vous réessayer ?";
    const editor = agentPage.locator("textarea").first();
    await editor.fill(answer);
    await agentPage.getByRole("button", { name: /Envoyer/i }).first().click();

    /* --- 5. Le client voit la réponse sur son portail --- */
    // C'est ici, et nulle part ailleurs, que se vérifie l'envoi. Côté agent, le
    // composeur garde son brouillon après soumission et le texte reste dans le
    // DOM du champ : y chercher la réponse passerait au vert sans que rien
    // n'ait été envoyé. Le fil du client, lui, est rendu par le serveur — on
    // recharge jusqu'à ce qu'il la porte.
    await expect(async () => {
      await page.goto(`/help/requests/${number}`);
      await expect(page.getByText(answer)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 25_000 });

    await agent.close();
  });

  test("une demande déposée sans email valide n'est pas créée", async ({ page }) => {
    await page.goto("/help/requests/new");
    await page.locator("#pt-subject").fill(uniqueSubject("sans email"));
    await page.locator("#pt-body").fill("Corps de la demande.");
    await page.locator('button[type=submit]').click();
    // Le champ email est requis : le navigateur bloque, on reste sur le formulaire.
    await expect(page).toHaveURL(/\/help\/requests\/new/);
  });
});
