import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Lecture des dictionnaires de traduction depuis leur source.
 *
 * Ce paquet n'a ni les alias de chemin d'`apps/web` ni son bundler : importer
 * `@/i18n/dictionaries/pl` d'ici demanderait de recréer sa configuration pour
 * lire une table de constantes. On balaie donc le fichier comme du texte, ce
 * qui suffit aux deux questions qu'on lui pose : quelles clés porte-t-il des
 * formes de pluriel, et quelles formes exactement.
 *
 * Ce paquet est transpilé en CommonJS par le chargeur de Playwright :
 * `__dirname` est disponible, `import.meta` non.
 */

const DICTS = join(__dirname, "../../../apps/web/src/i18n/dictionaries");
const LOCALES_TS = join(DICTS, "../locales.ts");

/** `{ code: "pl", tag: "pl-PL" }` → l'étiquette qui porte les règles de pluriel. */
export function localeTags(): Map<string, string> {
  const src = readFileSync(LOCALES_TS, "utf8");
  return new Map(
    [...src.matchAll(/\{ code: "(\w+)", tag: "([\w-]+)"/g)].map((m) => [m[1]!, m[2]!]),
  );
}

/** Les codes qui ont un fichier de dictionnaire, français exclu (c'est la source). */
export function dictionaryCodes(): string[] {
  return readdirSync(DICTS)
    .filter((f) => f.endsWith(".ts") && f !== "fr.ts")
    .map((f) => f.replace(".ts", ""))
    .sort();
}

/**
 * Les entrées au pluriel d'un dictionnaire : clé → { forme: texte }.
 *
 * Une entrée au pluriel s'écrit `"clé": { one: "…", other: "…" }` sur une ligne
 * ou sur plusieurs. On repère donc le début, puis on lit jusqu'à l'accolade
 * fermante — les accolades des paramètres (`{count}`) vont toujours par paires,
 * ce qui rend le comptage fiable. Le `\s*` après les deux-points est
 * indispensable : une forme au texte long passe à la ligne suivante.
 */
export function pluralEntries(code: string): Map<string, Record<string, string>> {
  const lines = readFileSync(join(DICTS, `${code}.ts`), "utf8").split("\n");
  const out = new Map<string, Record<string, string>>();
  for (let i = 0; i < lines.length; i++) {
    const start = /^ {2}"([^"]+)": \{/.exec(lines[i]!);
    if (!start) continue;
    let acc = lines[i]!;
    while ((acc.match(/\{/g) ?? []).length !== (acc.match(/\}/g) ?? []).length) {
      acc += `\n${lines[++i]!}`;
    }
    const formes: Record<string, string> = {};
    for (const m of acc.matchAll(/(?:^|[{\s])(\w+):\s*"((?:[^"\\]|\\.)*)"/g)) {
      formes[m[1]!] = m[2]!.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    out.set(start[1]!, formes);
  }
  return out;
}

/**
 * Les entrées à valeur simple d'un dictionnaire : clé → texte.
 *
 * Sert aux contrôles qui comparent des libellés entre eux — les jeux de
 * vocabulaire, par exemple, où deux valeurs identiques rendraient un filtre
 * inutilisable.
 */
export function simpleEntries(code: string): Map<string, string> {
  const src = readFileSync(join(DICTS, `${code}.ts`), "utf8");
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^ {2}"([^"]+)": "((?:[^"\\]|\\.)*)",$/gm)) {
    out.set(m[1]!, m[2]!);
  }
  return out;
}
