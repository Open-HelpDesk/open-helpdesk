import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Aucun texte français ne doit vivre en dehors des dictionnaires.
 *
 * Ce contrôle existe parce que la faute a été commise à grande échelle : cent
 * quarante-huit chaînes françaises étaient écrites dans le code — tout l'écran
 * des automatisations, tout l'onboarding, les modèles d'articles, les entêtes du
 * CSV de rapports. Elles restaient françaises quelle que soit la langue du
 * workspace, et rien ne le signalait : ça compile, ça s'affiche, et seul un
 * lecteur bulgare s'en aperçoit.
 *
 * C'est donc le pendant statique du travail de traduction : le typage garantit
 * qu'aucune CLÉ ne manque à une langue, celui-ci garantit qu'aucun TEXTE ne
 * contourne le dictionnaire.
 *
 * Le signal retenu est l'accent : une chaîne destinée à l'écran qui porte un
 * é, è, à, ç, ê, î, ô, û ou ù est du français, et le produit n'a pas de langue
 * source ailleurs que dans `i18n/`. Un libellé français sans accent passe entre
 * les mailles — le compromis est assumé, il vaut mieux un contrôle sans faux
 * positif qu'un contrôle qu'on finit par désactiver.
 */

const SRC = join(__dirname, "../../../apps/web/src");
const ACCENTS = /[éèêëàâäçîïôöûùü]/i;

/**
 * Ce qui a le droit de rester en français, et pourquoi. Chaque entrée est une
 * décision, pas une exemption de confort : si cette liste s'allonge sans
 * justification, c'est le signe qu'on recommence.
 */
const AUTORISE: { fichier: string; contient: string; pourquoi: string }[] = [
  {
    fichier: "middleware.ts",
    contient: "Workspace introuvable",
    pourquoi:
      "La langue vient du tenant, et c'est le tenant qu'on n'a pas su résoudre. " +
      "Ce 404 s'adresse en outre à qui héberge l'instance, pas à un utilisateur.",
  },
  {
    fichier: "app/app/settings/macros/page.tsx",
    contient: "Réponses courantes",
    pourquoi:
      "Noms de catégorie SAISIS par le tenant, comparés tels quels pour l'ordre " +
      "d'affichage. Les traduire ferait échouer la correspondance.",
  },
  {
    fichier: "app/app/tickets/[number]/props-panel.tsx",
    contient: '"Tâche"',
    pourquoi:
      "Valeur enregistrée en base pour le type de ticket. Seul l'affichage est " +
      "traduit ; changer la valeur casserait les tickets déjà créés.",
  },
  {
    fichier: "app/api/widget/route.ts",
    contient: "// widget désactivé",
    pourquoi: "Commentaire du JavaScript servi, pas un texte d'interface.",
  },
];

/** Tous les fichiers TypeScript du produit, hors dictionnaires. */
function sources(): string[] {
  const out: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        if (e !== "i18n" && e !== "node_modules" && e !== ".next") walk(p);
      } else if (/\.tsx?$/.test(e)) out.push(p);
    }
  })(SRC);
  return out.sort();
}

/**
 * Retire les commentaires — c'est là que vit la prose française légitime, et de
 * loin la plus abondante : ce dépôt commente en français.
 *
 * Les blocs `/* … *\/` et `{/* … *\/}` partent d'un coup, sur tout le texte, car
 * ils courent sur plusieurs lignes. Les commentaires de fin de ligne ne sont
 * retirés que lorsqu'ils ne suivent pas un deux-points, ce qui épargne les URL.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i > 0 && l[i - 1] !== ":" ? l.slice(0, i) : i === 0 ? "" : l;
    })
    .join("\n");
}

/** Les textes destinés à l'écran d'un fichier : littéraux et nœuds JSX. */
function candidats(code: string): { ligne: number; texte: string }[] {
  const out: { ligne: number; texte: string }[] = [];
  for (const [i, l] of code.split("\n").entries()) {
    // Une ligne qui traduit déjà, jette une erreur ou importe n'est pas en cause.
    if (/\bt\(|\btr\(|console\.|throw new Error|^import |from "/.test(l)) continue;
    const trouves = [
      ...[...l.matchAll(/"([^"\\]{3,})"/g)].map((m) => m[1]!),
      ...[...l.matchAll(/`([^`\\$]{3,})`/g)].map((m) => m[1]!),
      ...[...l.matchAll(/>\s*([^<>{}][^<>{}]{2,}?)\s*</g)].map((m) => m[1]!),
    ];
    for (const brut of trouves) {
      const texte = brut.trim();
      if (!ACCENTS.test(texte)) continue;
      // Chemins, classes utilitaires et déclarations CSS ne sont pas du texte.
      if (/^[\w./#:%-]+$/.test(texte) || /var\(--|rgba?\(|\d+px|;\s*$/.test(texte)) continue;
      out.push({ ligne: i + 1, texte });
    }
  }
  return out;
}

test.describe("Français hors dictionnaire", () => {
  test("la liste des exceptions décrit des cas qui existent encore", () => {
    // Une exception qui ne correspond plus à rien est une exception à retirer :
    // sans ce garde-fou, la liste se remplirait de permissions périmées.
    for (const a of AUTORISE) {
      const chemin = join(SRC, a.fichier);
      const source = readFileSync(chemin, "utf8");
      expect(source, `${a.fichier} ne contient plus « ${a.contient} »`).toContain(a.contient);
    }
  });

  test("aucun texte français ne vit en dehors de i18n/", () => {
    const fautes: string[] = [];
    for (const chemin of sources()) {
      const rel = relative(SRC, chemin);
      const code = sansCommentaires(readFileSync(chemin, "utf8"));
      for (const { ligne, texte } of candidats(code)) {
        const permis = AUTORISE.some(
          (a) => a.fichier === rel && (texte.includes(a.contient) || a.contient.includes(texte)),
        );
        if (!permis) fautes.push(`${rel}:${ligne} — « ${texte.slice(0, 70)} »`);
      }
    }
    expect(
      fautes,
      "Ces textes doivent passer par le dictionnaire (voir apps/web/src/i18n/README.md), " +
        "ou rejoindre la liste AUTORISE de ce fichier avec la raison qui le justifie.",
    ).toEqual([]);
  });
});
