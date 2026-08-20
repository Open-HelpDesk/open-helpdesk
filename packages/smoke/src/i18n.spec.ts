import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { AGENTS, setTenantLocale, signInAgent } from "./helpers";
import { pluralEntries, simpleEntries } from "./dict-source";

/**
 * La langue du logiciel (ST-01).
 *
 * Un tenant porte UNE langue : elle vaut pour ses agents comme pour ses
 * clients, il n'y a ni préférence individuelle ni préfixe d'URL. Changer ce
 * réglage doit donc retraduire les deux espaces d'un coup — le portail et
 * l'inbox — et rien d'autre : ce que le tenant a écrit lui-même (titres
 * d'articles, sujets de demandes) reste tel quel.
 *
 * L'allemand sert de langue témoin parce qu'il éloigne assez le vocabulaire
 * pour qu'une chaîne oubliée saute aux yeux, et parce que son séparateur de
 * milliers est le point : « 4.182 » là où le français écrit « 4 182 ».
 *
 * Le polonais sert de second témoin, pour une raison différente : il compte
 * quatre formes de pluriel là où le français et l'allemand en ont deux. Une
 * langue à deux formes ne peut pas révéler une sélection de pluriel cassée —
 * `other` y est juste presque partout. En polonais, non.
 */

/**
 * L'article le plus consulté du jeu de démonstration. Son titre est du contenu
 * de tenant — il ne doit jamais changer avec la langue — et son compteur de
 * vues est le seul nombre à quatre chiffres visible sans se connecter.
 */
const ARTICLE = {
  slug: "comment-telecharger-vos-factures",
  title: "Comment télécharger vos factures",
} as const;

test.describe("Langue du logiciel", () => {
  /**
   * Une seule session pour tout le fichier.
   *
   * L'authentification est limitée en fréquence (Better Auth refuse la
   * quatrième tentative dans la même fenêtre de dix secondes), et le formulaire
   * de connexion annonce alors « Identifiants incorrects. ». Se reconnecter à
   * chaque test ferait donc échouer les suivants sur un message trompeur, sans
   * aucun rapport avec la langue. On se connecte une fois, on garde la page.
   */
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    context = await browser.newContext();
    page = await context.newPage();
    // Le quota de connexions est commun à toute l'instance : une autre spec en
    // cours peut l'avoir épuisé. On réessaie jusqu'à ce que le produit accepte,
    // plutôt que d'échouer sur une contention qui ne dit rien du produit.
    await expect(async () => {
      await signInAgent(page, AGENTS.owner);
    }).toPass({ timeout: 60_000 });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.afterEach(async () => {
    // Le tenant est partagé par toutes les specs et ne porte qu'une langue :
    // quoi qu'il soit arrivé au-dessus, il repart en français.
    await switchLocale("fr");
  });

  /**
   * Bascule la langue du tenant et attend que l'enregistrement soit ACQUITTÉ.
   *
   * `setTenantLocale` rend la main dès que le `<select>` porte la valeur
   * choisie, c'est-à-dire avant que l'action serveur ait répondu. Naviguer
   * aussitôt après fait annuler la navigation par la redirection
   * d'enregistrement qui arrive derrière : on se retrouve sur l'écran de
   * réglages, dans l'ANCIENNE langue, et le test échoue pour une raison qui
   * n'est pas la sienne. `?saved=1` est l'accusé de réception du produit — on
   * l'attend avant d'aller voir ailleurs.
   */
  async function switchLocale(code: string): Promise<void> {
    await setTenantLocale(page, code);
    await expect(page).toHaveURL(/saved=1/);
  }

  /** La ligne de cet article dans le palmarès de l'accueil du portail. */
  function popularRow() {
    return page.locator(`a[href="/help/articles/${ARTICLE.slug}"]`).first();
  }

  test("en allemand, le portail client s'affiche en allemand", async () => {
    await switchLocale("de");
    await page.goto("/help");

    // `lang` sort de la même source que les traductions : s'il reste au
    // français, c'est la mise en page racine qui n'a pas relu le tenant.
    await expect(page.locator("html")).toHaveAttribute("lang", "de");

    // Le titre d'accueil traduit — le tenant n'a pas de texte d'accueil
    // personnalisé, qui primerait sur la traduction (ST-09).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Wie können wir Ihnen helfen?",
    );

    // Le chrome du portail est rendu par une autre mise en page que la page :
    // c'est le genre d'endroit qui reste en français quand le reste a basculé.
    await expect(page.getByRole("link", { name: "Anfrage stellen" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Meine Anfragen" }).first()).toBeVisible();
  });

  test("en allemand, les nombres portent le séparateur de milliers allemand", async () => {
    await switchLocale("de");
    await page.goto("/help");

    // Traduire ne suffit pas : un nombre interpolé dans une phrase doit passer
    // par le formateur de la langue. Sans cela il ressort brut — « 4182 » — et
    // le défaut reste invisible tant qu'on ne relit que du texte.
    // Le compteur n'est pas figé (chaque lecture d'article l'incrémente) : c'est
    // la FORME qui est vérifiée, pas la valeur.
    await expect(popularRow().locator("span.tabular-nums")).toHaveText(
      /^\d{1,3}\.\d{3} Aufrufe$/,
    );
  });

  test("en allemand, l'espace agent et ses statuts s'affichent en allemand", async () => {
    await switchLocale("de");
    await page.goto("/app/tickets");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Meine Tickets");

    // Les statuts vivent dans une table de correspondance à part, pas dans les
    // écrans : c'est exactement le vocabulaire qui reste en français quand tout
    // le reste est traduit. On les lit dans le filtre « Statut », seul endroit
    // où les libellés sont rendus quelles que soient les données de l'inbox.
    const statusFilter = page.locator('details:has(a[href="/app/tickets?status=open"])');
    await statusFilter.locator("summary").click();
    await expect(statusFilter.getByRole("link", { name: "Offen", exact: true })).toBeVisible();
    await expect(statusFilter.getByRole("link", { name: "Neu", exact: true })).toBeVisible();
    await expect(statusFilter.getByRole("link", { name: "Wartend", exact: true })).toBeVisible();
  });

  test("en polonais, la forme de pluriel est celle que la langue sélectionne", async () => {
    // Le vrai test de la couche de pluriels. Le polonais a quatre formes, et
    // aucun nombre ENTIER n'y sélectionne `other` : le compteur de vues de
    // l'accueil exerce donc forcément `one`, `few` ou `many`. Un rendu qui
    // retomberait sur le repli — dictionnaire incomplet, ou sélection faite en
    // « n > 1 » plutôt que par `Intl.PluralRules` — se voit ici, alors qu'il
    // passe inaperçu dans les deux tests allemands ci-dessus.
    await switchLocale("pl");
    await page.goto("/help");
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");

    const compteur = popularRow().locator("span.tabular-nums");
    const rendu = (await compteur.innerText()).trim();

    // Le nombre affiché n'est pas figé : chaque lecture d'article l'incrémente.
    // On lit donc celui que la page vient d'afficher, et on en déduit la forme
    // attendue — le test suit le produit au lieu de parier sur une valeur.
    const n = Number(rendu.replace(/\D/g, ""));
    expect(n).toBeGreaterThan(0);

    const categorie = new Intl.PluralRules("pl-PL").select(n);
    expect(categorie, "le polonais ne sélectionne jamais `other` sur un entier").not.toBe("other");

    const formes = pluralEntries("pl").get("home.views");
    expect(formes, "home.views devrait porter des formes de pluriel en pl.ts").toBeTruthy();
    const attendu = formes![categorie]!.replace(
      "{count}",
      new Intl.NumberFormat("pl-PL").format(n),
    );
    // L'égalité stricte couvre les deux moitiés d'un coup : la bonne forme, et
    // le nombre passé par le formateur polonais (espace insécable étroite).
    expect(rendu).toBe(attendu);
  });

  test("les effectifs du modal de suppression déclinent chacun leur nom", async () => {
    // L'avertissement le plus grave du produit comptait TROIS effectifs
    // indépendants dans une phrase, là où une clé ne porte qu'une dimension de
    // pluriel : les trois noms étaient figés au pluriel et, à un seul ticket, la
    // phrase écrivait « Les 1 tickets » — dans toutes les langues. Les trois
    // groupes nominaux sont sortis dans des clés comptées à part.
    //
    // Le polonais est le témoin : quatre formes, et aucun entier n'y sélectionne
    // `other`. Une phrase figée s'y verrait immédiatement.
    await switchLocale("pl");
    await page.goto("/app/settings/general");

    // Ouvrir le modal de la zone de danger. Le libellé du déclencheur est lu
    // dans le dictionnaire plutôt que codé en polonais : « Usuń » sert aussi
    // aux boutons de retrait du logo et du favicon du même écran, et un
    // `has-text` en attraperait un autre. On ne touche à rien dans le modal —
    // le bouton de suppression reste verrouillé par la saisie du slug.
    const declencheur = simpleEntries("pl").get("app.settings.workspace.delete")!;
    await page.getByRole("button", { name: declencheur, exact: true }).click();
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // La phrase ne porte plus aucun paramètre.
    const phrase = modal.locator("p").first();
    await expect(phrase).not.toContainText("{");

    // La ligne des effectifs : trois groupes nominaux séparés par « · ».
    const ligne = modal.locator("p").nth(1);
    const texte = (await ligne.innerText()).trim();
    const groupes = texte.split("·").map((g) => g.trim());
    expect(groupes, `« ${texte} » devrait porter trois effectifs`).toHaveLength(3);

    const regles = new Intl.PluralRules("pl-PL");
    const nf = new Intl.NumberFormat("pl-PL");
    for (const [i, cle] of [
      "app.settings.workspace.generalDeleteTicketCount",
      "app.settings.workspace.generalDeleteContactCount",
      "app.settings.workspace.generalDeleteArticleCount",
    ].entries()) {
      const n = Number(groupes[i]!.replace(/[^0-9]/g, ""));
      const categorie = regles.select(n);
      expect(categorie, "le polonais ne sélectionne jamais `other` sur un entier").not.toBe(
        "other",
      );
      const formes = pluralEntries("pl").get(cle);
      expect(formes, `${cle} devrait porter des formes de pluriel en pl.ts`).toBeTruthy();
      expect(groupes[i]).toBe(formes![categorie]!.replace("{count}", nf.format(n)));
    }
  });

  test("le contenu du tenant n'est pas traduit avec l'interface", async () => {
    // Le titre d'article appartient au tenant : il est écrit dans SA langue et
    // aucun changement de réglage ne doit y toucher. Un dictionnaire qui
    // déborderait sur les données se verrait ici, et nulle part ailleurs.
    const title = popularRow().locator("span.flex-1");

    await switchLocale("fr");
    await page.goto("/help");
    await expect(title).toHaveText(ARTICLE.title);

    await switchLocale("de");
    await page.goto("/help");
    await expect(title).toHaveText(ARTICLE.title);
  });

  test("revenir au français rétablit l'interface française", async () => {
    // Un aller simple ne prouve rien : c'est le retour qui montre que la langue
    // est relue à chaque rendu, et non figée au premier passage par un cache.
    await switchLocale("de");
    await switchLocale("fr");

    await page.goto("/help");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Comment pouvons-nous vous aider ?",
    );

    await page.goto("/app/tickets");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mes tickets");
  });
});
