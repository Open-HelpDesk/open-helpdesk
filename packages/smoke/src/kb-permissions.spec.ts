import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { AGENTS, signInAgent } from "./helpers";

/**
 * La frontière de rôle sur la base de connaissances.
 *
 * Règle du produit : toute l'équipe LIT la base — un agent y puise ses réponses —
 * mais seuls Owner et Admin y ÉCRIVENT. Le risque n'est pas de mal cacher un
 * bouton, c'est de ne cacher QUE le bouton : une garde qui ne vit que dans
 * l'interface laisse l'URL et l'API grandes ouvertes. Chaque interdiction est
 * donc vérifiée deux fois — l'écran, puis la porte de service.
 */

/** Une image minuscule mais authentique : la route filtre le type MIME. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Dépose une image d'article comme le fait l'éditeur : multipart, champ `file`. */
function deposerUneImage(request: APIRequestContext) {
  return request.post("/api/kb/images", {
    multipart: { file: { name: "pixel.png", mimeType: "image/png", buffer: PIXEL_PNG } },
    failOnStatusCode: false,
  });
}

/**
 * Better Auth plafonne /sign-in à trois tentatives par tranche de dix secondes
 * et par IP. C'est une protection légitime, mais c'est le smoke test qui la
 * déclenche : au-delà, la connexion échoue en affichant « Identifiants
 * incorrects » alors que les identifiants sont bons. On réessaie donc jusqu'à ce
 * que la session s'ouvre — un signal du produit, pas une attente en aveugle.
 */
async function connexion(page: Page, email: string): Promise<void> {
  await expect(async () => {
    await signInAgent(page, email);
  }).toPass({ timeout: 90_000, intervals: [1_000] });
}

/*
 * Les deux sessions sont ouvertes une seule fois pour tout le fichier. Ce n'est
 * pas une optimisation : sept connexions à la suite se feraient plafonner par la
 * limite ci-dessus et le fichier échouerait sur l'authentification, jamais sur
 * ce qu'il prétend vérifier. Aucun de ces tests n'écrit quoi que ce soit, les
 * pages peuvent donc être partagées sans qu'un test en salisse un autre.
 */
let adminContext: BrowserContext;
let adminPage: Page;
let agentContext: BrowserContext;
let agentPage: Page;
/**
 * L'identifiant d'un article existant. Un agent ne peut pas le découvrir depuis
 * ses écrans — ses lignes pointent vers le portail, jamais vers l'éditeur — et
 * c'est précisément pour cela qu'il faut le lui fournir de l'extérieur pour
 * éprouver l'accès direct par URL.
 */
let articleId: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);

  adminContext = await browser.newContext();
  adminPage = await adminContext.newPage();
  await connexion(adminPage, AGENTS.admin);

  agentContext = await browser.newContext();
  agentPage = await agentContext.newPage();
  await connexion(agentPage, AGENTS.agent);

  const res = await adminPage.request.get("/api/search?q=factures");
  expect(res.ok(), "la recherche doit répondre à un Admin").toBeTruthy();
  const { articles } = (await res.json()) as { articles: { id: string }[] };
  expect(
    articles.length,
    "le jeu de démonstration doit porter des articles « factures »",
  ).toBeGreaterThan(0);
  articleId = articles[0]!.id;
});

test.afterAll(async () => {
  await agentContext?.close();
  await adminContext?.close();
});

test.describe("Base de connaissances : écriture réservée aux gestionnaires", () => {
  test("un agent lit la base de connaissances", async () => {
    await agentPage.goto("/app/kb");

    // Lire est le droit qui reste : l'arbre s'affiche et une catégorie du jeu de
    // démonstration livre bien ses articles.
    const facturation = agentPage
      .locator('a[href^="/app/kb?cat="]')
      .filter({ hasText: "Facturation" });
    await expect(facturation).toBeVisible();
    await facturation.click();
    await expect(agentPage.getByText("Comment télécharger vos factures")).toBeVisible();
  });

  test("un agent ne voit aucune commande d'écriture", async () => {
    await agentPage.goto("/app/kb");

    // Une preuve que l'écran est rendu, d'abord : sans elle, les quatre absences
    // qui suivent passeraient au vert sur une page blanche ou une redirection.
    await expect(agentPage.getByText("Catégories", { exact: true })).toBeVisible();

    await expect(agentPage.getByRole("link", { name: "+ Article" })).toHaveCount(0);
    await expect(agentPage.locator("summary").filter({ hasText: "Renommer" })).toHaveCount(0);
    await expect(
      agentPage.getByRole("button", { name: "Supprimer la catégorie" }),
    ).toHaveCount(0);
    await expect(agentPage.getByPlaceholder("Nouvelle catégorie")).toHaveCount(0);
  });

  test("un agent qui vise l'éditeur par l'URL est renvoyé vers la liste", async () => {
    // Cet écran EST l'éditeur : il n'a pas de version consultable. Masquer le
    // lien ne suffirait pas, une URL se tape.
    await agentPage.goto("/app/kb/new");
    await expect(agentPage).toHaveURL(/\/app\/kb$/);

    await agentPage.goto(`/app/kb/${articleId}`);
    await expect(agentPage).toHaveURL(/\/app\/kb$/);
  });

  test("un agent ne peut pas déposer d'image d'article", async () => {
    // La route que l'éditeur appelle au glisser-déposer. C'est la seule écriture
    // de la base qui ne passe pas par une server action : si la garde manquait
    // ici, aucun écran ne le dirait.
    const res = await deposerUneImage(agentPage.request);
    expect(res.status(), "POST /api/kb/images doit être refusé à un Agent").toBe(403);
  });

  test("un administrateur dispose des commandes d'écriture", async () => {
    await adminPage.goto("/app/kb");

    await expect(adminPage.getByRole("link", { name: "+ Article" })).toBeVisible();
    await expect(adminPage.locator("summary").filter({ hasText: "Renommer" })).toBeVisible();
    await expect(
      adminPage.getByRole("button", { name: "Supprimer la catégorie" }),
    ).toBeVisible();
    await expect(adminPage.getByPlaceholder("Nouvelle catégorie")).toBeVisible();
  });

  test("un administrateur ouvre l'éditeur d'article", async () => {
    await adminPage.goto("/app/kb/new");

    // On reste sur /app/kb/new — là même où l'Agent était renvoyé — et l'écran
    // de démarrage s'affiche. Rien n'est écrit en base tant qu'on n'enregistre
    // pas : ce test ne laisse aucun article derrière lui.
    await expect(adminPage).toHaveURL(/\/app\/kb\/new$/);
    await expect(adminPage.getByText("Par où commencer ?")).toBeVisible();
  });

  test("un administrateur peut déposer une image d'article", async () => {
    const res = await deposerUneImage(adminPage.request);
    // Ce n'est pas le stockage objet qu'on éprouve, seulement la frontière de
    // rôle : 401 est exclu au même titre que 403, sinon une session perdue
    // ferait passer ce test pour la mauvaise raison. Le pixel déposé reste dans
    // le magasin d'objets — il n'existe pas de route pour le reprendre — mais il
    // n'est rattaché à aucun article et n'apparaît sur aucun écran.
    expect([401, 403], "POST /api/kb/images doit être ouvert à un Admin").not.toContain(
      res.status(),
    );
  });

  /*
   * Les deux écrans ne posent pas la même frontière, et c'est le seul point où
   * ce fichier a trouvé le produit en désaccord avec lui-même : /api/search
   * retient les brouillons parce qu'« un titre non publié est déjà une
   * information », tandis que la liste /app/kb les sert à tout le monde, badge
   * « Brouillon » compris, en se contentant de rendre la ligne non cliquable.
   * Les deux tests qui suivent tiennent les deux bouts : le vert épingle le
   * comportement actuel, le fixme dit ce qu'il faudrait obtenir.
   */
  test("un agent voit aujourd'hui les brouillons dans la liste des articles", async () => {
    await agentPage.goto("/app/kb");
    await agentPage
      .locator('a[href^="/app/kb?cat="]')
      .filter({ hasText: "Facturation" })
      .click();
    await expect(agentPage.getByText("Comment télécharger vos factures")).toBeVisible();
    await expect(agentPage.getByText("Brouillon", { exact: true }).first()).toBeVisible();
  });

  test.fixme("un agent ne voit aucun brouillon dans la liste des articles", async () => {
    await agentPage.goto("/app/kb");
    await agentPage
      .locator('a[href^="/app/kb?cat="]')
      .filter({ hasText: "Facturation" })
      .click();
    // La catégorie doit rester peuplée : sans cette ligne, l'absence de badge
    // serait satisfaite par une liste vide.
    await expect(agentPage.getByText("Comment télécharger vos factures")).toBeVisible();
    await expect(agentPage.getByText("Brouillon", { exact: true })).toHaveCount(0);
  });

  test("la recherche ne révèle aucun brouillon à un agent", async () => {
    type Article = { id: string; title: string; status: string };
    const requete = "/api/search?q=factures";

    const { articles: vusParLAdmin } = (await (
      await adminPage.request.get(requete)
    ).json()) as { articles: Article[] };
    const { articles: vusParLAgent } = (await (
      await agentPage.request.get(requete)
    ).json()) as { articles: Article[] };

    // Le jeu de démonstration porte des brouillons « factures » : sans eux, la
    // comparaison ci-dessous ne prouverait rien.
    expect(
      vusParLAdmin.filter((a) => a.status === "draft").length,
      "un Admin doit voir les brouillons dans la recherche",
    ).toBeGreaterThan(0);

    // Un titre de brouillon divulgue à lui seul un contenu non publié, et l'agent
    // n'a aucun écran pour l'ouvrir. La frontière tient donc dans la requête, pas
    // dans le composant qui affiche la palette ⌘K.
    expect(
      vusParLAgent.map((a) => a.status),
      "aucun brouillon ne doit remonter à un Agent",
    ).not.toContain("draft");
    expect(
      vusParLAgent.length,
      "un Agent doit tout de même voir les articles publiés",
    ).toBeGreaterThan(0);
  });
});
