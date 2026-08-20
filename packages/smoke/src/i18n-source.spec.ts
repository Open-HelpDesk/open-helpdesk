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
