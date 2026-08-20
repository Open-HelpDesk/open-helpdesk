import { expect, test } from "@playwright/test";
import { dictionaryCodes, localeTags, pluralEntries, simpleEntries } from "./dict-source";

/**
 * Contrôles statiques des dictionnaires — les seuls de ce dossier qui ne
 * lancent pas de navigateur : ils lisent les fichiers de traduction comme du
 * texte et n'ont donc besoin d'aucune instance.
 *
 * Elle est ici parce que le défaut qu'elle attrape est de la même famille que
 * les autres : invisible à la compilation, silencieux à l'exécution. Le type
 * `Message` n'exige qu'une forme `other` ; toutes les autres sont optionnelles,
 * parce qu'aucune langue n'en utilise le même jeu. Un dictionnaire polonais
 * privé de sa forme `many` compile donc parfaitement — et affiche
 * « 5 zgłoszenia » au lieu de « 5 zgłoszeń » pour tout nombre qui la
 * sélectionne, c'est-à-dire très souvent.
 */

/**
 * Les catégories qu'un dictionnaire doit fournir pour cette langue.
 *
 * Ce n'est pas tout à fait `resolvedOptions().pluralCategories`, qui énumère
 * aussi des catégories qu'aucun effectif affiché par le produit ne
 * sélectionnera. On prend donc les catégories réellement atteintes sur les
 * nombres que le produit rend — des effectifs entiers, tous les compteurs d'ici
 * comptant des lignes — plus `other`, qui est le repli de `renderMessage` et
 * doit exister partout.
 *
 * Deux exclusions, toutes deux assumées :
 *  - le `many` du tchèque, du slovaque et du lituanien ne concerne que les
 *    nombres décimaux. Aucun pluriel du produit n'en reçoit : `size()` passe
 *    « 1,2 Mo » en paramètre déjà formaté, jamais en `{count}`.
 *  - le `many` du français, de l'espagnol, de l'italien et du portugais ne se
 *    déclenche qu'au million exact — « un million DE tickets ». À ce nombre
 *    écrit en chiffres, `other` reste correct, et aucun tenant n'y arrivera.
 * Le `many` du polonais, lui, est exigé : il tombe sur 5, 6, 22… c'est-à-dire
 * en permanence.
 */
function categoriesAttendues(tag: string): string[] {
  const regles = new Intl.PluralRules(tag);
  const vues = new Set<string>(["other"]);
  for (let n = 0; n <= 9_999; n++) vues.add(regles.select(n));
  return [...vues].sort();
}

const REFERENCE = pluralEntries("fr");
const CODES = dictionaryCodes();

test.describe("Tables de pluriel", () => {
  test("le français en déclare bien quelques dizaines", () => {
    // Garde-fou du garde-fou : si l'analyse ne trouvait plus rien, tous les
    // tests ci-dessous passeraient au vert sans rien vérifier.
    expect(REFERENCE.size).toBeGreaterThan(40);
  });

  test("chaque langue du registre a son dictionnaire", () => {
    const attendus = [...localeTags().keys()].filter((c) => c !== "fr").sort();
    expect(CODES).toEqual(attendus);
  });

  for (const code of CODES) {

    test(`${code} : toutes les catégories que la langue peut sélectionner`, () => {
      const tag = localeTags().get(code);
      expect(tag, `${code} absent de locales.ts`).toBeTruthy();
      const requises = categoriesAttendues(tag!);
      const dico = pluralEntries(code);

      // Même jeu de clés au pluriel que le français : une clé traduite en
      // chaîne simple là où le français attend des formes ne planterait pas,
      // elle rendrait juste la même phrase à tous les nombres.
      expect([...dico.keys()].sort()).toEqual([...REFERENCE.keys()].sort());

      const manquantes = [...dico].flatMap(([cle, formes]) =>
        requises.filter((c) => !(c in formes)).map((c) => `${cle} → ${c}`),
      );
      expect(manquantes, `${code} (${requises.join(", ")})`).toEqual([]);
    });
  }
});

/**
 * Jeux de vocabulaire — statuts, priorités, urgences, canaux.
 *
 * Ces libellés ne vivent pas dans les écrans mais dans des tables de
 * correspondance, à l'écart : un terme faux y survit longtemps. Le risque
 * particulier est la COLLISION. Si deux statuts d'un même jeu se traduisent par
 * le même mot, le filtre qui les liste affiche deux entrées identiques et
 * devient inutilisable — sans que rien ne plante, et sans qu'aucun typage ne
 * puisse le voir. Le français ne peut pas révéler le défaut : c'est lui la
 * source, ses valeurs sont distinctes par construction.
 */
const JEUX: Record<string, RegExp> = {
  "statuts du portail": /^status\./,
  "statuts de l'espace agent": /^app\.status\./,
  "priorités": /^app\.priority\./,
  "urgences du formulaire client": /^newRequest\.urgency(?!Label)/,
  "canaux": /^app\.channel\./,
};

test.describe("Jeux de vocabulaire", () => {
  test("les jeux du français comptent bien plusieurs valeurs chacun", () => {
    // Garde-fou : si l'analyse ne trouvait plus les clés, les tests ci-dessous
    // passeraient au vert en ne comparant rien.
    const fr = simpleEntries("fr");
    for (const [nom, re] of Object.entries(JEUX)) {
      const n = [...fr.keys()].filter((k) => re.test(k)).length;
      expect(n, `jeu « ${nom} »`).toBeGreaterThan(2);
    }
  });

  for (const code of CODES) {
    test(`${code} : aucun libellé en double dans un même jeu`, () => {
      const d = simpleEntries(code);
      const collisions: string[] = [];
      for (const [nom, re] of Object.entries(JEUX)) {
        const par = new Map<string, string[]>();
        for (const cle of [...d.keys()].filter((k) => re.test(k))) {
          const valeur = d.get(cle)!;
          if (!par.has(valeur)) par.set(valeur, []);
          par.get(valeur)!.push(cle.split(".").pop()!);
        }
        for (const [valeur, cles] of par) {
          if (cles.length > 1) collisions.push(`${nom} : « ${valeur} » ← ${cles.join(" = ")}`);
        }
      }
      expect(collisions).toEqual([]);
    });
  }
});

/**
 * Verbes d'action que la traduction ne doit pas confondre.
 *
 * Chaque paire ci-dessous porte deux libellés qui sont DISTINCTS en français et
 * dont la confusion a une conséquence : cliquer sur l'un en croyant l'autre.
 * Le cas qui a motivé ce test s'est produit sur quatre des quatorze dernières
 * langues livrées — bulgare, estonien, lituanien, slovène — où le mot naturel
 * de la révocation est aussi celui de l'annulation. Le lien rouge qui invalide
 * définitivement une clé d'API portait alors le même mot que le bouton Annuler
 * du formulaire juste en dessous.
 *
 * On ne compare que des libellés courts et nus, et seulement des paires qui se
 * rencontrent SUR LE MÊME ÉCRAN. Deux verbes identiques sur deux écrans qui ne
 * se croisent jamais ne trompent personne : beaucoup de langues n'ont qu'un mot
 * pour « supprimer » et « retirer », et c'est légitime — exiger la distinction
 * ferait échouer le finnois, le néerlandais et le polonais sur une différence
 * que le français fait sans que le produit en dépende.
 */
const PAIRES: [string, string, string][] = [
  // Le défaut observé : le lien rouge de révocation et le bouton Annuler du
  // formulaire cohabitent sur l'écran API & webhooks, `cancel` du shell étant
  // rendu sur tous les écrans de réglages.
  ["révoquer une clé", "app.settings.dev.revoke", "app.settings.shell.cancel"],
  ["révoquer plutôt que supprimer", "app.settings.dev.revoke", "app.settings.dev.delete"],
  ["révoquer plutôt que désactiver", "app.settings.dev.revoke", "app.settings.dev.disable"],
  // Une règle d'automatisation se désactive ou se supprime depuis la même ligne.
  ["supprimer plutôt que désactiver", "app.settings.rules.delete", "app.settings.rules.ruleDisable"],
  // Zone de danger du workspace : désactiver un agent n'est pas supprimer.
  ["supprimer plutôt que désactiver", "app.settings.workspace.delete", "app.settings.workspace.deactivate"],
];

test.describe("Verbes d'action", () => {
  test("les paires sont bien distinctes en français", () => {
    // Sans ce garde-fou, une paire dont une clé aurait disparu de fr.ts
    // passerait au vert dans toutes les langues sans rien vérifier.
    const fr = simpleEntries("fr");
    for (const [nom, a, b] of PAIRES) {
      expect(fr.get(a), `${nom} : ${a} absente de fr.ts`).toBeTruthy();
      expect(fr.get(b), `${nom} : ${b} absente de fr.ts`).toBeTruthy();
      expect(fr.get(a), `${nom} : la paire est déjà confondue en français`).not.toBe(fr.get(b));
    }
  });

  for (const code of CODES) {
    test(`${code} : aucune paire d'actions confondue`, () => {
      const d = simpleEntries(code);
      // Comparaison insensible à la casse et à la ponctuation : « Odobrať: » et
      // « Odobrať » sont le même mot pour l'utilisateur qui lit le bouton.
      const nu = (v: string | undefined) =>
        (v ?? "").toLocaleLowerCase().replace(/[\s:.…—-]+$/u, "").trim();
      const confusions = PAIRES.filter(([, a, b]) => {
        const va = nu(d.get(a));
        return va !== "" && va === nu(d.get(b));
      }).map(([nom, a, b]) => `${nom} : « ${d.get(a)} » ← ${a} = ${b}`);
      expect(confusions).toEqual([]);
    });
  }
});
