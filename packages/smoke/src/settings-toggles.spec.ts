import { expect, test, type Page } from "@playwright/test";
import { AGENTS, expectStatus, signInAgent, uniqueEmail, uniqueSubject } from "./helpers";

/**
 * ST-09 — les deux interrupteurs du portail coupent vraiment.
 *
 * « Portail client activé » et « Base de connaissances publiée » étaient
 * enregistrés par l'écran d'administration sans que personne ne les lise : on
 * les basculait, l'écran confirmait, et le portail continuait de tout servir.
 * Un test qui se contenterait de rouvrir l'écran verrait le réglage « à off » et
 * passerait au vert. C'est pourquoi tout se vérifie ici du côté du visiteur —
 * codes HTTP des pages publiques, contenu de l'accueil, réponse de l'API de
 * suggestions — et jamais dans le formulaire qui vient d'être soumis.
 *
 * Le tenant est partagé par toutes les specs : les deux réglages sont remis en
 * service dans un afterEach, échec compris.
 */

/** Les trois portes du portail : consultation, connexion, dépôt de demande. */
const PORTAL_ROUTES = ["/help", "/help/login", "/help/requests/new"];

/**
 * Ouvre l'écran des réglages du portail avec une session de gestionnaire.
 *
 * La connexion agent atterrit sur l'inbox — la page la plus lourde du produit —
 * et le helper partagé lui laisse 15 s. Sur une machine chargée, ce délai est
 * dépassé alors que la session est bel et bien ouverte. On vise donc directement
 * l'écran de réglages, et on ne passe par le formulaire que si l'application
 * nous renvoie vers /login. Si la connexion est réellement cassée, l'échec vient
 * quand même — simplement au bout de la boucle, et sur la même erreur.
 */
async function openPortalSettings(page: Page): Promise<void> {
  await expect(async () => {
    await page.goto("/app/settings/portal");
    if (page.url().includes("/app/settings/portal")) return;
    // Les réglages du tenant demandent un gestionnaire : l'Agent n'y accède pas.
    await signInAgent(page, AGENTS.admin);
    await page.goto("/app/settings/portal");
    await expect(page).toHaveURL(/\/app\/settings\/portal/);
  }).toPass({ timeout: 60_000 });
}

/**
 * Bascule un interrupteur de ST-09 et enregistre.
 *
 * Le helper partagé `setPortalToggle` clique l'`<input>` lui-même. Il ne peut pas
 * fonctionner ici : le toggle des réglages masque sa case
 * (`position:absolute; width:0; height:0; opacity:0`) et n'affiche qu'un curseur
 * `.st-knob` de 34×20. Un clic, même forcé, sur une boîte de 0×0 échoue
 * (« Element is outside of the viewport »). On clique donc ce que clique un
 * utilisateur : le curseur visible.
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
    await page.locator(`label.st-toggle:has(input[name="${name}"]) .st-knob`).click();
  }
  // L'état voulu doit être atteint AVANT l'envoi : un curseur qui n'aurait pas
  // pris le clic ferait enregistrer l'état inverse, et le test mentirait dans
  // les deux sens à la fois.
  await expect(box).toBeChecked({ checked: on });
  await page.locator('form:has(input[name="portalEnabled"]) button[type=submit]').click();
  // La redirection `saved=1` est la seule confirmation que l'action serveur est
  // allée au bout : rester sur l'écran ne prouverait rien.
  await expect(page).toHaveURL(/saved=1/);
}

test.describe("Interrupteurs du portail (ST-09)", () => {
  test.beforeEach(async ({ page }) => {
    // Deux allers-retours dans les réglages plus un parcours client : le budget
    // par défaut de 30 s ne suffit pas, et un test qui expire ne dit rien.
    test.setTimeout(120_000);
    await openPortalSettings(page);
  });

  test.afterEach(async ({ page }) => {
    // Restauration inconditionnelle : le tenant est partagé et les workers valent
    // 1. Un portail laissé coupé ferait tomber en 404 toutes les specs suivantes,
    // qui échoueraient alors pour une raison qui ne les concerne pas.
    await setToggle(page, "portalEnabled", true);
    await setToggle(page, "kbPublished", true);
  });

  test("portail coupé, le centre d'aide et le widget n'existent plus", async ({ page }) => {
    await setToggle(page, "portalEnabled", false);

    // Le portail entier disparaît — y compris la connexion client et le dépôt de
    // demande, qui vivent sous /help. C'est la promesse du réglage : pas une
    // page d'information, une extinction.
    for (const path of PORTAL_ROUTES) await expectStatus(page, path, 404);
    // Le widget embarqué dépose ses demandes au même endroit : il tombe avec lui.
    await expectStatus(page, "/widget", 404);

    /* --- Réactivé, tout revient --- */
    await setToggle(page, "portalEnabled", true);
    for (const path of PORTAL_ROUTES) await expectStatus(page, path, 200);
    await expectStatus(page, "/widget", 200);
  });

  test("base de connaissances dépubliée, le support reste ouvert mais les articles disparaissent", async ({
    page,
  }) => {
    await setToggle(page, "portalEnabled", true);

    // Témoin : base publiée, l'accueil annonce bien ses catégories et sa
    // recherche. Sans ce passage, l'absence constatée plus bas ne prouverait
    // rien — un accueil vide pour une tout autre raison passerait au vert.
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Catégories" })).toBeVisible();
    await expect(page.locator('form[role="search"]')).toBeVisible();
    await expect(page.locator('a[href^="/help/categories/"]').first()).toBeVisible();

    await setToggle(page, "kbPublished", false);

    // Couper la base ne ferme pas le support : le portail répond toujours et la
    // demande reste déposable. Les deux réglages sont indépendants.
    await expectStatus(page, "/help", 200);
    await expectStatus(page, "/help/requests/new", 200);

    // Les pages de la base, elles, cessent d'exister. « Facturation » est une
    // catégorie du jeu de démonstration, stable d'une exécution à l'autre.
    await expectStatus(page, "/help/categories/facturation", 404);
    await expectStatus(page, "/help/search?q=factur", 404);

    // Le typeahead est servi par une API publique : si elle continuait de
    // répondre, elle resterait une fenêtre ouverte sur des articles que les
    // pages refusent d'ouvrir — donc une fuite de contenu dépublié.
    const suggest = await page.request.get("/api/portal/kb-suggest?q=factur", {
      failOnStatusCode: false,
    });
    expect(suggest.status(), "/api/portal/kb-suggest devrait répondre 200").toBe(200);
    expect(await suggest.json(), "aucune suggestion quand la base est dépubliée").toEqual([]);

    // L'accueil cesse d'annoncer ce qu'il ne peut plus servir : ni section
    // « Catégories », ni barre de recherche. Les liens de catégorie sont comptés
    // en plus du titre — c'est la section entière qui doit tomber, pas son seul
    // en-tête.
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Catégories" })).toHaveCount(0);
    await expect(page.locator('form[role="search"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/help/categories/"]')).toHaveCount(0);

    /* --- Le support fonctionne encore vraiment, pas seulement en code 200 --- */
    const email = uniqueEmail("kb-off");
    const subject = uniqueSubject("Base dépubliée, demande quand même");
    await page.goto("/help/requests/new");
    await page.locator("#pt-email").fill(email);
    await page.locator("#pt-subject").fill(subject);
    await page.locator("#pt-body").fill(
      "Bonjour, je ne trouve plus la documentation. Pouvez-vous m'aider ?",
    );
    await page.locator("button[type=submit]").click();

    // La référence de la page de confirmation est la seule preuve que la demande
    // a été créée : le contenu des champs, lui, resterait dans le DOM même si
    // rien n'était parti.
    await expect(page).toHaveURL(/\/help\/requests\/submitted/);
    const reference = await page.locator("span.font-mono").first().innerText();
    expect(reference, "la demande déposée doit porter un numéro").toMatch(/^#\d+$/);
  });
});
