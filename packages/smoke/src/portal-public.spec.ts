import { expect, test, type Page } from "@playwright/test";
import { AGENTS, expectStatus, signInAgent } from "./helpers";

/**
 * Le portail tel qu'un visiteur anonyme le rencontre : pas de session, pas de
 * cookie, juste une adresse. C'est la moitié publique du produit — celle qui
 * doit fonctionner avant que quiconque songe à ouvrir une demande.
 *
 * Ce qu'elle a de particulier, c'est qu'elle dépend de réglages qui vivent
 * ailleurs : le tenant est résolu par le sous-domaine, la base de connaissances
 * n'est servie que si ST-09 l'autorise. Un smoke test qui ouvre ces pages
 * anonymement vérifie donc bien plus que du rendu.
 */

/* Éléments du jeu de démonstration choisis pour leur stabilité : la catégorie
   et l'article existent depuis le seed et ne dépendent d'aucune autre spec. */
const CATEGORIE = { nom: "Facturation", slug: "facturation" } as const;
const ARTICLE = {
  titre: "Comment télécharger vos factures",
  slug: "comment-telecharger-vos-factures",
} as const;

/** Le conteneur de la barre du hero : le champ ET son panneau de suggestions. */
function rechercheHero(page: Page) {
  return page.locator('div:has(> form[role="search"])');
}

/**
 * Le nombre de votes « Oui » d'un article, lu là où le produit l'expose
 * vraiment : la colonne « Utile » d'AG-10.
 *
 * Le portail ne l'affiche nulle part et le bouton de vote est optimiste — il se
 * colore avant même que la server action ait répondu. Se contenter du
 * remerciement à l'écran laisserait passer un vote qui n'atteint jamais la base.
 */
async function votesUtiles(agentPage: Page): Promise<number> {
  await agentPage.goto("/app/kb");
  // L'arbre s'ouvre sur la première catégorie : il faut sélectionner celle qui
  // porte l'article (une catégorie parente inclut les articles de ses sections).
  await agentPage.locator('a[href^="/app/kb?cat="]').filter({ hasText: CATEGORIE.nom }).click();
  await agentPage.waitForURL(/\/app\/kb\?cat=/, { timeout: 10_000 });

  const ligne = agentPage.locator('a[href^="/app/kb/"]').filter({ hasText: ARTICLE.titre });
  await expect(ligne).toHaveCount(1, { timeout: 10_000 });

  // La colonne « Utile » est la seule cellule de la ligne à préfixer son nombre
  // d'un « + » : on la désigne par là plutôt que par sa position, qui bougerait
  // au premier remaniement de la table. Un article sans vote affiche « — » et
  // aucune cellule ne correspond alors : c'est zéro.
  const cellule = ligne.locator("> span").filter({ hasText: /^\+\d/ });
  if ((await cellule.count()) === 0) return 0;
  return Number((await cellule.innerText()).replace(/\D/g, ""));
}

test.describe("Portail public", () => {
  test("l'accueil du centre d'aide s'ouvre sans compte et porte son hero", async ({ page }) => {
    // Un 200 franc, sans redirection : c'est la preuve que le middleware a
    // résolu le tenant depuis le sous-domaine. Quand cette résolution tombe,
    // tout le portail répond 404 et chaque autre assertion ment sur la cause.
    await expectStatus(page, "/help", 200);

    await page.goto("/help");
    const titre = page.getByRole("heading", { level: 1 });
    await expect(titre).toBeVisible();
    // Le hero affiche soit le texte d'accueil réglé dans ST-09, soit la
    // traduction : on ne fige pas sa valeur, mais un titre vide serait un
    // accueil cassé — c'est la seule chose que le visiteur lit en arrivant.
    await expect(titre).not.toBeEmpty();

    // La recherche est offerte à l'anonyme : la base est publiée et publique.
    await expect(rechercheHero(page).getByRole("textbox")).toBeVisible();
  });

  test("la recherche du hero suggère des articles pendant la frappe", async ({ page }) => {
    await page.goto("/help");
    const barre = rechercheHero(page);
    await barre.getByRole("textbox").fill("factur");

    // Les suggestions viennent de /api/portal/kb-suggest, appelée après une
    // pause de frappe : on attend le panneau, jamais un délai. L'assertion est
    // portée par le conteneur de la barre, car les mêmes titres figurent aussi
    // dans « Les plus consultés » plus bas — y chercher un lien passerait au
    // vert avec un typeahead entièrement mort.
    const suggestion = barre.getByRole("link", { name: ARTICLE.titre });
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toHaveAttribute("href", `/help/articles/${ARTICLE.slug}`);
  });

  test("une catégorie de l'accueil ouvre sa page", async ({ page }) => {
    await page.goto("/help");
    await page.locator(`a[href="/help/categories/${CATEGORIE.slug}"]`).click();

    await expect(page).toHaveURL(new RegExp(`/help/categories/${CATEGORIE.slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(CATEGORIE.nom);
  });

  test("un article s'ouvre depuis sa catégorie avec son corps, sa date et son vote", async ({
    page,
  }) => {
    await page.goto(`/help/categories/${CATEGORIE.slug}`);
    await page.getByRole("link", { name: ARTICLE.titre }).click();

    await expect(page).toHaveURL(new RegExp(`/help/articles/${ARTICLE.slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ARTICLE.titre);

    // Le corps est stocké en markdown et rendu par ArticleBody : un titre de
    // section prouve que le rendu riche a bien eu lieu, là où un simple bout de
    // texte passerait même si la page recrachait le markdown brut.
    await expect(page.getByRole("heading", { level: 2, name: "Depuis l'espace client" })).toBeVisible();
    await expect(page.locator("p").filter({ hasText: "restent accessibles pendant dix ans" })).toBeVisible();

    // La méta doit porter une VRAIE date : l'assertion exige un chiffre après
    // « Mis à jour le », ce qu'un gabarit non interpolé (« {date} ») n'aurait
    // pas. Elle est cherchée dans un <p> et non dans toute la page, car le
    // dictionnaire de traduction est sérialisé dans un <script> de la page et
    // contient le gabarit mot pour mot.
    await expect(page.locator("p").filter({ hasText: /^Mis à jour le \d/ })).toBeVisible();

    // Le bloc de vote fait partie de l'article : sans lui, aucun retour ne
    // remonte de la base de connaissances.
    await expect(page.getByRole("button", { name: /Oui/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Non/ })).toBeVisible();
  });

  test("le vote « Oui » d'un article est comptabilisé et le visiteur est remercié", async ({
    page,
  }) => {
    // Deux sessions et plusieurs allers-retours sur AG-10 : la vérification vaut
    // le temps qu'elle prend, mais elle ne tient pas dans le budget par défaut.
    test.setTimeout(120_000);

    const agent = await page.context().browser()!.newContext();
    const agentPage = await agent.newPage();
    // Deux raisons, toutes deux étrangères au portail, font échouer une
    // connexion agent isolée : AG-01 est un composant client, et un clic arrivé
    // avant l'hydratation part en soumission native qui laisse le navigateur sur
    // /login ; et Better Auth limite /sign-in/email à trois appels par dizaine de
    // secondes et par IP, ce que l'écran affiche comme « Identifiants
    // incorrects ». On réessaie jusqu'à ce que l'espace agent s'ouvre.
    await expect(async () => {
      await signInAgent(agentPage, AGENTS.admin);
    }).toPass({ timeout: 45_000 });
    const avant = await votesUtiles(agentPage);

    await page.goto(`/help/articles/${ARTICLE.slug}`);

    // Même course pour le bloc de vote : un clic antérieur à l'hydratation est
    // perdu sans un mot à l'écran. On réessaie jusqu'au remerciement — le
    // composant ignore un second clic identique, le compteur ne peut donc pas
    // être incrémenté deux fois par cette boucle. Le +1 laissé sur l'article du
    // seed est assumé : c'est un compteur, pas un réglage, et l'exécution
    // suivante repart de la valeur qu'elle vient de lire.
    await expect(async () => {
      await page.getByRole("button", { name: /Oui/ }).click();
      await expect(page.locator("p").filter({ hasText: "Merci pour votre retour." })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });

    // Ce que le produit retient. Le vote part dans une transition React : la
    // base est en retard sur l'écran, on relit la colonne jusqu'au +1 plutôt
    // que de parier sur un instant.
    await expect(async () => {
      expect(await votesUtiles(agentPage)).toBe(avant + 1);
    }).toPass({ timeout: 25_000 });

    await agent.close();
  });

  test("la recherche pleine page liste les articles correspondants", async ({ page }) => {
    await page.goto("/help/search?q=facture");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Résultats");
    // Au moins un résultat, et il mène quelque part : la liste de résultats
    // sait rendre des titres sans savoir construire les liens vers les articles.
    const resultats = page.locator('main a[href^="/help/articles/"]');
    await expect(resultats.first()).toBeVisible();
    await expect(resultats.filter({ hasText: ARTICLE.titre })).toHaveCount(1);
  });

  test("une recherche sans résultat propose de soumettre une demande", async ({ page }) => {
    const introuvable = "zzqqxwv-introuvable";
    await page.goto(`/help/search?q=${introuvable}`);

    // L'état vide reprend la requête : c'est ce qui distingue « rien trouvé
    // pour ce mot » d'une page de recherche cassée.
    await expect(page.locator("p").filter({ hasText: "Aucun résultat" })).toContainText(introuvable);

    // Le bouton est la sortie de secours du visiteur. Il est cherché dans
    // <main> : l'en-tête du portail porte le même libellé sur toutes les pages,
    // et le trouver là ne dirait rien de l'état vide.
    const bouton = page.locator("main").getByRole("link", { name: "Soumettre une demande" });
    await expect(bouton).toBeVisible();
    await expect(bouton).toHaveAttribute("href", "/help/requests/new");
  });

  test("le pied de page du portail porte le copyright du tenant", async ({ page }) => {
    await page.goto("/help");
    const pied = page.locator("footer");

    // Le copyright est toujours là, quel que soit le réglage.
    await expect(pied).toContainText(new RegExp(`© ${new Date().getFullYear()}`));

    // « Propulsé par Open HelpDesk » dépend de ST-09 (« Masquer Propulsé par »,
    // réservé au plan Pro) : un smoke test ne doit pas présumer d'un réglage
    // qu'il ne pilote pas. On vérifie donc seulement la cohérence — si la
    // mention est là, la phrase est recollée autour de son lien, ce qui est le
    // vrai risque (elle est découpée pour garder l'ordre des mots de chaque
    // langue). Le fait de la masquer est couvert par settings-toggles.
    const mention = pied.getByRole("link", { name: "Open HelpDesk" });
    if ((await mention.count()) > 0) {
      await expect(pied).toContainText("Propulsé par Open HelpDesk");
      await expect(mention).toHaveAttribute("href", "https://open-helpdesk.com");
    }
  });
});
