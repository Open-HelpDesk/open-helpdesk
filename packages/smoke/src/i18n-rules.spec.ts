import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { AGENTS, setTenantLocale, signInAgent } from "./helpers";
import { simpleEntries } from "./dict-source";

/**
 * Le résumé des règles, dans une autre langue que le français.
 *
 * C'est la pièce la plus fragile du travail de traduction. Ce résumé n'est pas
 * une phrase du dictionnaire : il est ASSEMBLÉ à l'exécution — un gabarit, des
 * bribes de conditions reliées par un « et », des bribes d'actions reliées par
 * « · ». Il portait trois défauts que rien ne signalait :
 *
 *  · les libellés étaient des constantes françaises ;
 *  · deux écrans découpaient le TEXTE RENDU à l'expression régulière pour n'en
 *    garder qu'une moitié — `/^Si toujours → /` et `/^Si /` — ce qui ne retirait
 *    plus rien dès que la langue changeait ;
 *  · l'ordre des mots du gabarit était figé, alors qu'une langue peut rejeter
 *    son verbe à la fin.
 *
 * Le polonais sert de témoin : son vocabulaire est assez éloigné pour qu'un
 * fragment resté français saute aux yeux.
 */

/** Tournures françaises que le rendu assemblé laissait passer. */
const RESTES = ["aucune action", "toujours", "assigner à", "passer en"];

/** La tête et la queue d'un gabarit, autour de son paramètre. */
function autour(gabarit: string, param: string): [string, string] {
  const [avant = "", apres = ""] = gabarit.split(`{${param}}`);
  return [avant.trim(), apres.trim()];
}

test.describe("Résumé des règles traduit", () => {
  let context: BrowserContext;
  let page: Page;
  let pl: Map<string, string>;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    pl = simpleEntries("pl");
    context = await browser.newContext();
    page = await context.newPage();
    await expect(async () => {
      await signInAgent(page, AGENTS.owner);
    }).toPass({ timeout: 60_000 });
    await setTenantLocale(page, "pl");
  });

  test.afterAll(async () => {
    // Le tenant est partagé : il repart en français quoi qu'il arrive.
    await setTenantLocale(page, "fr");
    await context.close();
  });

  test("chaque règle est résumée en polonais, sans fragment français", async () => {
    await page.goto("/app/settings/automations");
    const resumes = page.locator('div:has(> a[href^="/app/settings/automations/"]) > p');
    const lignes = (await resumes.allInnerTexts()).map((s) => s.trim()).filter(Boolean);
    expect(lignes.length, "le jeu de démonstration devrait porter des règles").toBeGreaterThan(0);

    const [tete] = autour(pl.get("app.settings.rules.summaryPattern")!, "conditions");
    for (const ligne of lignes) {
      // Le gabarit polonais ouvre la phrase : si sa tête manque, le résumé n'a
      // pas été rendu par le dictionnaire.
      if (tete) expect(ligne, `« ${ligne} »`).toContain(tete);
      for (const reste of RESTES) {
        expect(ligne.toLowerCase(), `« ${ligne} » garde « ${reste} »`).not.toContain(reste);
      }
    }
  });

  test("l'éditeur SLA n'affiche que la moitié conditions", async () => {
    await page.goto("/app/settings/sla");
    // `body` et non `main` : l'espace agent n'a pas d'élément `main`, et un
    // sélecteur qui ne résout jamais fait attendre le test au lieu de le faire
    // échouer — c'est ainsi que ce test a d'abord expiré à trente secondes.
    const texte = await page.locator("body").innerText();

    // Cet écran obtenait cette moitié en fabriquant la phrase entière puis en
    // retirant sa tête et sa queue à l'expression régulière. Inopérant hors du
    // français : la phrase complète se serait affichée dans la colonne.
    const [tete] = autour(pl.get("app.settings.rules.summaryPattern")!, "conditions");
    if (tete) expect(texte, `« ${tete} » n'a rien à faire ici`).not.toContain(tete);
    expect(texte).not.toContain(pl.get("app.settings.rules.journalNoAction")!);
  });

  test("l'entête du groupe de conditions suit le mode choisi", async () => {
    // Le sélecteur est posé AU MILIEU d'une phrase, et le cadre unique d'avant
    // était fautif : le français écrivait « Correspond à au moins une les
    // conditions », l'allemand « mindestens eine Bedingungen treffen zu ».
    //
    // Le témoin est ici le FRANÇAIS, et non le polonais comme dans les tests
    // ci-dessus : le polonais place son sélecteur en fin de phrase, il n'a donc
    // aucune queue à comparer et l'assertion passerait à vide. Le français est
    // la langue où le défaut vivait, et celle où les deux cadres diffèrent —
    // « toutes LES conditions » contre « au moins une DES conditions ».
    await setTenantLocale(page, "fr");
    await page.goto("/app/settings/automations");
    await page.locator('a[href^="/app/settings/automations/"]').first().click();
    await page.waitForURL(/\/automations\/[^/]+$/, { timeout: 15_000 });

    const fr = simpleEntries("fr");
    const modes = [
      { label: fr.get("app.settings.rules.matchAll")!, cadre: fr.get("app.settings.rules.matchAllPattern")! },
      { label: fr.get("app.settings.rules.matchAny")!, cadre: fr.get("app.settings.rules.matchAnyPattern")! },
    ];
    const queues = modes.map((m) => autour(m.cadre, "mode")[1]);
    expect(queues[0], "les deux cadres français doivent différer").not.toBe(queues[1]);

    // L'entête est le bloc qui porte l'étiquette « SI » en enfant direct.
    const entete = page.locator(
      `div:has(> span:text-is("${fr.get("app.settings.rules.matchIf")}"))`,
    ).first();
    await expect(entete).toBeVisible();

    for (const [i, m] of modes.entries()) {
      await entete.getByRole("button", { name: m.label, exact: true }).click();
      await expect(entete).toContainText(queues[i]!);
      await expect(entete, "la queue de l'autre mode ne doit pas s'afficher").not.toContainText(
        queues[1 - i]!,
      );
    }
  });
});
