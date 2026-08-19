import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { AGENTS, expectStatus, signInAgent, uniqueEmail, uniqueSubject } from "./helpers";

/**
 * La journée d'un agent : il se connecte, lit son inbox, change de vue, ouvre un
 * ticket, en corrige la priorité, cherche dans la palette, puis s'en va.
 *
 * Chaque test part d'une demande qu'il a lui-même déposée sur le portail. Le jeu
 * de démonstration bouge — les autres parcours créent, assignent et résolvent
 * des tickets — et viser un ticket du seed ferait échouer ce fichier pour une
 * raison qui n'a rien à voir avec l'espace agent.
 */

// Le panneau de propriétés est en `xl:flex` : sous 1280 px il n'est pas caché,
// il est absent du DOM. Sans cette fenêtre, les assertions qui le visent
// échoueraient à cause de la taille du navigateur, pas du produit.
test.use({ viewport: { width: 1440, height: 900 } });

// Déposer une demande, se connecter et recharger un ticket ne tient pas toujours
// en 30 s sur une instance partagée : le budget par défaut est trop court ici.
test.describe.configure({ timeout: 90_000 });

/* ---------------------------------------------------------------------------
 * Session agent
 *
 * better-auth n'accepte que trois appels à /sign-in par tranche de 10 s, toutes
 * origines confondues. Un fichier qui rejoue le formulaire à chaque test se fait
 * jeter au troisième : le test échoue alors sur une protection du produit, pas
 * sur ce qu'il prétend vérifier. On ouvre donc UNE session pour tout le fichier
 * et on la prête aux contextes suivants ; seul le test qui parle vraiment de
 * connexion repasse par le formulaire.
 * ------------------------------------------------------------------------- */

let agentCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

/**
 * Connexion agent tolérante au quota d'authentification : une tentative refusée
 * laisse le formulaire en place, on la rejoue jusqu'à obtenir l'inbox. Si toutes
 * échouent, l'erreur remontée est celle du helper (l'inbox n'est jamais venue).
 */
async function signIn(page: Page, email: string): Promise<void> {
  await expect(async () => {
    await signInAgent(page, email);
  }).toPass({ timeout: 60_000, intervals: [2_000, 5_000, 8_000] });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext();
  await signIn(await context.newPage(), AGENTS.agent);
  agentCookies = await context.cookies();
  await context.close();
});

/** Rend le contexte courant authentifié, sans repasser par le formulaire. */
async function reuseAgentSession(page: Page): Promise<void> {
  await page.context().addCookies(agentCookies);
}

/* ---------------------------------------------------------------------------
 * Matière du test
 * ------------------------------------------------------------------------- */

type PortalTicket = { number: string; subject: string; body: string };

/**
 * Dépose une demande par le portail public, sans session, comme un visiteur.
 * Le ticket obtenu est neuf : statut « Nouveau », priorité normale, sans
 * assigné — exactement ce qu'un agent trouve en arrivant le matin.
 */
async function submitPortalRequest(page: Page, label: string): Promise<PortalTicket> {
  const subject = uniqueSubject(label);
  const body = `Détail de la demande ${subject} — la sauvegarde s'interrompt à mi-parcours.`;

  await page.goto("/help/requests/new");
  await page.locator("#pt-email").fill(uniqueEmail("journee"));
  await page.locator("#pt-subject").fill(subject);
  await page.locator("#pt-body").fill(body);
  await page.locator("button[type=submit]").click();

  await expect(page).toHaveURL(/\/help\/requests\/submitted/);
  const reference = await page.locator("span.font-mono").first().innerText();
  expect(reference, "la confirmation doit porter la référence de la demande").toMatch(/^#\d+$/);

  return { number: reference.replace("#", ""), subject, body };
}

/**
 * La ligne d'inbox qui porte ce sujet.
 *
 * Les lignes ne sont pas des liens mais des `<div>` cliquables : impossible de
 * les viser par leur URL. Le sujet, lui, est unique à chaque exécution — deux
 * specs qui s'enchaînent ne se confondent pas.
 */
function inboxRow(page: Page, subject: string) {
  return page.locator("div.cursor-pointer").filter({ hasText: subject });
}

/* ------------------------------------------------------------------------- */

test.describe("Journée d'un agent", () => {
  test("un agent se connecte et atterrit sur son inbox", async ({ page }) => {
    await signIn(page, AGENTS.agent);

    await expect(page).toHaveURL(/\/app\/tickets/);
    // Le panneau des vues est le repère de l'inbox : sans lui, l'agent est
    // peut-être authentifié, mais il n'est pas chez lui.
    await expect(page.getByRole("link", { name: /Non assignés/ })).toBeVisible();
  });

  test("l'inbox liste les tickets avec leur statut, leur SLA et leur assigné", async ({
    page,
  }) => {
    const ticket = await submitPortalRequest(page, "Sauvegarde interrompue");
    await reuseAgentSession(page);
    await page.goto("/app/tickets?view=unassigned");

    // Les trois colonnes sur lesquelles un agent décide quoi traiter. On les
    // cherche dans l'en-tête de la table, pas n'importe où dans la page : les
    // mêmes mots servent aussi de libellés aux filtres de la barre du haut.
    const columns = page.locator("div.sticky").first();
    await expect(columns).toContainText("Statut");
    await expect(columns).toContainText("SLA");
    await expect(columns).toContainText("Assigné");

    const row = inboxRow(page, ticket.subject);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`#${ticket.number}`);
    // Arrivée du jour, personne dessus : la colonne assigné affiche « — ».
    await expect(row).toContainText("Nouveau");
    await expect(row).toContainText("—");
    // Le compte à rebours SLA est posé à la création. On vise le badge (le seul
    // `inline-flex` chiffré de la ligne) et non n'importe quel nombre : la
    // colonne activité est elle aussi en chiffres tabulaires et rendrait
    // l'assertion verte même sans échéance.
    await expect(row.locator("span.inline-flex.tabular-nums")).toHaveText(/\d+\s*(min|h)/);
  });

  test("la vue « Non assignés » change l'URL et la liste", async ({ page }) => {
    const ticket = await submitPortalRequest(page, "Filtre des vues");
    await reuseAgentSession(page);
    await page.goto("/app/tickets");

    // Constater une absence n'a de sens qu'une fois l'inbox rendue : sans ce
    // repère, « aucune ligne » voudrait aussi dire « pas encore de page ».
    const unassignedView = page.getByRole("link", { name: /Non assignés/ });
    await expect(unassignedView).toBeVisible();

    // Vue par défaut « Mes tickets » : la demande, sans assigné, n'y est pas.
    await expect(inboxRow(page, ticket.subject)).toHaveCount(0);

    await unassignedView.click();

    // La vue vit dans l'URL — c'est ce qui rend un lien d'inbox partageable.
    await expect(page).toHaveURL(/\/app\/tickets\?view=unassigned/);
    // Et la liste a réellement changé de contenu, pas seulement de vue active.
    await expect(inboxRow(page, ticket.subject)).toHaveCount(1);
  });

  test("ouvrir un ticket affiche son fil et son panneau de propriétés", async ({ page }) => {
    const ticket = await submitPortalRequest(page, "Ouverture du fil");
    await reuseAgentSession(page);
    await page.goto("/app/tickets?view=unassigned");
    await inboxRow(page, ticket.subject).click();

    await expect(page).toHaveURL(new RegExp(`/app/tickets/${ticket.number}`));
    await expect(page.getByRole("heading", { name: ticket.subject })).toBeVisible();

    // Le message du client est rendu dans le fil, pas dans un champ de saisie :
    // on vise l'<article> qui le porte. Chercher ce texte n'importe où le
    // trouverait aussi dans le composeur, qui est un textarea.
    await expect(page.locator("article").filter({ hasText: ticket.body })).toHaveCount(1);

    // Panneau de propriétés : les groupes que l'agent manipule et le suivi SLA.
    const panel = page.locator("aside").filter({ hasText: "Classification" });
    await expect(panel.getByText("Affectation")).toBeVisible();
    await expect(panel.getByText("SLA", { exact: true })).toBeVisible();
    await expect(panel.locator('select:has(option[value="urgent"])')).toHaveValue("normal");
  });

  test("la priorité changée dans le panneau survit à un rechargement", async ({ page }) => {
    const ticket = await submitPortalRequest(page, "Priorité à corriger");
    await reuseAgentSession(page);
    await page.goto(`/app/tickets/${ticket.number}`);

    const priority = page.locator('select:has(option[value="urgent"])');
    await expect(priority).toHaveValue("normal");
    await priority.selectOption("high");

    // L'enregistrement est une action serveur. Le select, lui, garderait sa
    // nouvelle valeur même si rien n'était parti : on recharge donc jusqu'à ce
    // que la page rendue par le serveur porte la priorité choisie.
    await expect(async () => {
      await page.reload();
      await expect(priority).toHaveValue("high", { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    // Le rechargement ci-dessus suffit à prouver la persistance : /app/tickets/{n}
    // est rendu par le serveur, la valeur du select vient donc de la base et non
    // de l'état laissé par le clic. C'est bien la classe de défaut visée ici —
    // un réglage enregistré mais jamais relu.
    await expect(priority).toHaveValue("high");
  });

  test("la palette ⌘K s'ouvre au raccourci et trouve ce qui parle de facturation", async ({
    page,
  }) => {
    await reuseAgentSession(page);
    await page.goto("/app/tickets");

    await page.keyboard.press("ControlOrMeta+k");
    const search = page.getByPlaceholder(/Rechercher/);
    await expect(search).toBeFocused();
    await expect(page.getByText("Tapez au moins deux caractères")).toBeVisible();

    await search.fill("factur");

    // La requête est différée de 180 ms puis servie par /api/search : on attend
    // le résultat, jamais le délai.
    const article = page.getByRole("button", { name: /Comment télécharger vos factures/ });
    await expect(article).toBeVisible();
    await expect(page.getByText("Articles", { exact: true })).toBeVisible();

    // Un résultat mène quelque part : la palette navigue et se referme. La
    // destination dépend du rôle — Thomas est agent, pas gestionnaire : il est
    // envoyé vers l'article publié, le seul endroit où il peut le lire.
    // L'éditeur /app/kb reste aux gestionnaires.
    await article.click();
    await expect(search).toBeHidden();
    await expect(page).toHaveURL(/\/help\/articles\/comment-telecharger-vos-factures/);
  });

  // Dernier de la journée, et il doit le rester : se déconnecter révoque la
  // session partagée par tous les tests de ce fichier.
  test("la déconnexion referme l'espace agent", async ({ page }) => {
    await reuseAgentSession(page);
    await page.goto("/app/tickets");

    await page.getByTitle("Se déconnecter").click();
    await expect(page).toHaveURL(/\/login/);

    // Le vrai test n'est pas la redirection mais la session : l'inbox doit
    // redevenir inaccessible même en y retournant à la main.
    await expectStatus(page, "/app/tickets", 307);
    await page.goto("/app/tickets");
    await expect(page).toHaveURL(/\/login/);
  });
});
