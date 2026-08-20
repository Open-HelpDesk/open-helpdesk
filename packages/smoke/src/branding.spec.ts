import { expect, test, type Page } from "@playwright/test";
import { AGENTS, signInAgent } from "./helpers";
import { BASE_URL } from "../playwright.config";

/**
 * Logo et favicon du workspace (ST-01).
 *
 * Ces deux contrôles étaient dessinés et inertes : une zone en pointillés qui ne
 * s'ouvrait sur rien. Ils déposent maintenant un fichier — et c'est exactement
 * le genre de fonction dont il faut vérifier la chaîne complète, parce qu'un
 * dépôt peut réussir sans que rien ne s'affiche : l'objet est rangé, la colonne
 * `branding` est écrite, et les deux shells continuent d'afficher l'initiale.
 * C'est la famille de défauts qui a coûté le plus cher sur ce produit.
 */

/** Un PNG 2×2 valide, le plus petit fichier qui prouve que l'image est servie. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8DAwMDEwMDAwAAAF7wBLwLZk2wAAAAASUVORK5CYII=",
  "base64",
);

/** Un fichier que le serveur doit refuser : le type n'est pas une image admise. */
const TEXTE = Buffer.from("ceci n'est pas une image", "utf8");

const CHAMP = { logo: 'input[name="logo"]', favicon: 'input[name="favicon"]' } as const;

/**
 * Le bouton « ✕ » d'un champ de marque.
 *
 * Désigné comme frère du champ de fichier, et non par son `aria-pressed` : le
 * sélecteur de couleur d'accent du même écran en porte un sur chacune de ses
 * cinq pastilles, et un `.first()` global cliquerait une couleur.
 */
function croix(page: Page, name: "logo" | "favicon") {
  // Le champ vit DANS le `label` de la zone en pointillés, pas en enfant direct
  // de la rangée : on remonte donc par `:has` sans `>` du côté du champ, et on
  // garde le `>` du côté du bouton, seul moyen d'écarter les div englobantes —
  // `:has` remonte jusqu'à l'enveloppe de la page, qui contient aussi le rail.
  return page.locator(`div:has(input[name="${name}"]) > button[aria-pressed]`);
}

/** L'aperçu du champ : le carré de tête de la rangée, jamais le logo du rail. */
function apercuChamp(page: Page, name: "logo" | "favicon") {
  return page.locator(`div:has(input[name="${name}"]) > span > img`);
}

async function ouvrirReglages(page: Page) {
  await page.goto("/app/settings/general");
  // On attend le formulaire, pas le titre : l'écran porte DEUX <h1> — celui de
  // la navigation des réglages (« Paramètres ») et celui de la page. Et c'est le
  // formulaire dont ces tests ont besoin de toute façon.
  await expect(page.locator('form:has(select[name="locale"])')).toBeVisible();
}

/** Enregistre le formulaire d'identité et attend l'accusé de réception. */
async function enregistrer(page: Page) {
  await page.locator('form:has(select[name="locale"]) button[type=submit]').last().click();
}

/** Retire logo et favicon s'il en reste, pour rendre le tenant comme on l'a pris. */
async function remettreAZero(page: Page) {
  await ouvrirReglages(page);
  let n = 0;
  for (const name of ["logo", "favicon"] as const) {
    const bouton = croix(page, name);
    if ((await bouton.count()) > 0) {
      await bouton.click();
      n++;
    }
  }
  if (n > 0) {
    await enregistrer(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
  }
}

test.describe("Logo et favicon du workspace", () => {
  test.beforeEach(async ({ page }) => {
    // Owner : le dépôt est réservé aux rôles de gestion (requireManager).
    await expect(async () => {
      await signInAgent(page, AGENTS.owner);
    }).toPass({ timeout: 60_000 });
    await remettreAZero(page);
  });

  test.afterEach(async ({ page }) => {
    await remettreAZero(page);
  });

  test("le champ du logo est un vrai champ de fichier, pas un décor", async ({ page }) => {
    await ouvrirReglages(page);
    // La régression que ce test garde : les deux contrôles étaient des <span>.
    await expect(page.locator(CHAMP.logo)).toHaveCount(1);
    await expect(page.locator(CHAMP.favicon)).toHaveCount(1);
    await expect(page.locator(CHAMP.logo)).toHaveAttribute("accept", /image\/png/);
    await expect(page.locator(CHAMP.favicon)).toHaveAttribute("accept", /ico/);
  });

  test("un logo déposé s'affiche dans l'espace agent ET dans l'entête du portail", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await ouvrirReglages(page);
    await page
      .locator(CHAMP.logo)
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await enregistrer(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

    // 1. L'écran de réglages relit ce qu'il vient d'écrire.
    const apercu = page.locator('img[src^="/api/brand/"]');
    await expect(apercu.first()).toBeVisible();
    const url = (await apercu.first().getAttribute("src"))!;

    // 2. Le fichier est vraiment servi — un aperçu peut pointer vers un 404.
    const servi = await page.request.get(url);
    expect(servi.status(), `${url} devrait répondre 200`).toBe(200);
    expect(servi.headers()["content-type"]).toContain("image/png");

    // 3. Le rail de l'espace agent : c'est là que l'initiale s'affichait.
    await page.goto("/app/tickets");
    await expect(page.locator(`aside img[src="${url}"]`)).toBeVisible();

    // 4. L'entête du portail — un autre shell, une autre mise en page. C'est
    //    l'endroit qu'un branchement partiel oublie.
    await page.goto("/help");
    await expect(page.locator(`header img[src="${url}"]`)).toBeVisible();
  });

  test("un favicon déposé est déclaré dans l'entête du document", async ({ page }) => {
    await ouvrirReglages(page);
    await page
      .locator(CHAMP.favicon)
      .setInputFiles({ name: "favicon.png", mimeType: "image/png", buffer: PNG });
    await enregistrer(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

    // Le favicon vit dans la mise en page RACINE, partagée par le portail et
    // l'espace agent : il doit être déclaré des deux côtés.
    for (const chemin of ["/app/tickets", "/help"]) {
      await page.goto(chemin);
      const lien = page.locator('link[rel="icon"]');
      await expect(lien, `favicon absent de ${chemin}`).toHaveCount(1);
      await expect(lien).toHaveAttribute("href", /^\/api\/brand\//);
    }
  });

  test("retirer le logo rétablit l'initiale du workspace", async ({ page }) => {
    await ouvrirReglages(page);
    await page
      .locator(CHAMP.logo)
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await enregistrer(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
    await expect(page.locator('img[src^="/api/brand/"]').first()).toBeVisible();

    // Le ✕ ne retire pas tout seul : il marque, et c'est l'enregistrement qui
    // applique. Un bouton qui aurait soumis de son côté aurait emporté le nom
    // et la langue qu'on venait de changer sur le même écran.
    await croix(page, "logo").click();
    // L'aperçu du champ repasse à l'initiale, mais le rail de l'espace agent
    // garde le logo : rien n'est encore enregistré, et c'est bien ce qu'on veut.
    // L'assertion est donc portée par le champ, pas par la page.
    await expect(apercuChamp(page, "logo")).toHaveCount(0);
    await expect(page.locator('aside img[src^="/api/brand/"]')).toBeVisible();

    await enregistrer(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

    // Enregistré, plus aucun logo nulle part — rail compris.
    await expect(page.locator('img[src^="/api/brand/"]')).toHaveCount(0);
    await page.goto("/help");
    await expect(page.locator('header img[src^="/api/brand/"]')).toHaveCount(0);
  });

  test("un fichier au mauvais format est refusé, et le dit", async ({ page }) => {
    await ouvrirReglages(page);
    await page
      .locator(CHAMP.logo)
      .setInputFiles({ name: "logo.txt", mimeType: "text/plain", buffer: TEXTE });
    await enregistrer(page);

    // Refusé AVANT l'écriture : l'URL porte l'erreur, pas ?saved=1, et le
    // bandeau l'annonce. Un refus silencieux est le défaut qu'on cherche ici.
    await expect(page).toHaveURL(/error=logo-format/, { timeout: 15_000 });
    await expect(page.locator('img[src^="/api/brand/"]')).toHaveCount(0);
  });

  test("l'URL d'un logo ne sert que le workspace de son domaine", async ({ page }) => {
    await ouvrirReglages(page);
    await page
      .locator(CHAMP.logo)
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await enregistrer(page);
    await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });

    const url = (await page.locator('img[src^="/api/brand/"]').first().getAttribute("src"))!;
    // Même clé, autre identifiant de tenant : la route doit refuser. Sans cette
    // garde, l'URL d'un logo laisserait lire les fichiers d'un autre workspace.
    const autre = url.replace(
      /\/api\/brand\/[0-9a-f-]{36}\//,
      "/api/brand/00000000-0000-0000-0000-000000000000/",
    );
    expect(autre, "l'URL n'a pas été réécrite — le test ne prouverait rien").not.toBe(url);
    await expectRefus(page, autre);

    // Et une clé hors forme est refusée par l'expression, sans toucher au
    // stockage. (Pas de « .. » ici : `new URL` le normaliserait, et le test
    // porterait alors sur une autre route que celle qu'on veut éprouver.)
    await expectRefus(page, "/api/brand/pas-un-uuid/logo-x.png");
    await expectRefus(page, "/api/brand/00000000-0000-0000-0000-000000000000/sansprefixe.png");
  });
});

/** Un 404 franc, sans redirection : la route refuse au lieu de servir. */
async function expectRefus(page: Page, chemin: string) {
  const res = await page.request.get(new URL(chemin, BASE_URL).toString(), {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(res.status(), `${chemin} devrait être refusé`).toBe(404);
}
