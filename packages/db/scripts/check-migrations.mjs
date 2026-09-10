/**
 * Fails when the schema and the migrations disagree.
 *
 * The failure this prevents is the worst one a deployment can carry: a column
 * added to the schema, the migration never generated, and both the typecheck
 * and every test passing — because they read the TypeScript schema, not the
 * database. Production then runs `migrate`, which has nothing to apply, and the
 * application queries a column that does not exist. The error surfaces at the
 * first request from a real customer.
 *
 * The check is mechanical: ask drizzle-kit to generate, and refuse if it
 * produces anything. A generator with nothing to say is the proof that the
 * committed migrations describe the committed schema.
 *
 * No database is contacted — `generate` compares the schema to the snapshots in
 * `drizzle/meta`, which is why this can be a CI gate rather than an integration
 * test.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "drizzle");

const META = join(MIGRATIONS, "meta");

const sqlFiles = () => readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
const metaFiles = () => readdirSync(META);

const before = new Set(sqlFiles());
/*
 * L'état de `drizzle/meta` AVANT, et pas seulement la liste des .sql.
 *
 * Trouvé en éprouvant cette garde dans les deux sens, ce qui est exactement
 * pourquoi il faut l'éprouver : `generate` n'écrit pas qu'un .sql, il ajoute un
 * instantané et une entrée au journal. Ne retirer que le .sql laissait le
 * journal en avance, et la garde échouait ensuite sur un schéma pourtant
 * correct — un faux positif permanent, causé par le contrôle lui-même.
 *
 * Un contrôle qui modifie ce qu'il contrôle finit désactivé.
 */
const metaBefore = new Set(metaFiles());
const journal = join(META, "_journal.json");
const journalBefore = readFileSync(journal, "utf8");

try {
  execFileSync("pnpm", ["exec", "drizzle-kit", "generate"], {
    cwd: ROOT,
    stdio: "pipe",
    env: {
      ...process.env,
      // The URL only has to parse: nothing connects.
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://x:x@127.0.0.1:1/x",
    },
  });
} catch (err) {
  console.error("❌ drizzle-kit generate a échoué :\n");
  console.error(String(err.stdout ?? ""), String(err.stderr ?? ""));
  process.exit(1);
}

const created = sqlFiles().filter((f) => !before.has(f));

if (created.length > 0) {
  /*
   * Tout est remis en état avant d'échouer : le .sql, les instantanés ajoutés
   * et le journal. Laisser le .sql ferait passer une seconde exécution — une
   * porte qui repasse au vert toute seule est pire qu'aucune porte — et laisser
   * le journal en avance ferait échouer les suivantes sur un schéma correct.
   */
  for (const f of created) rmSync(join(MIGRATIONS, f));
  for (const f of metaFiles()) if (!metaBefore.has(f)) rmSync(join(META, f));
  writeFileSync(journal, journalBefore);
  console.error(
    `\n❌ Le schéma a changé sans migration : drizzle-kit en a généré ${created.length}.\n\n` +
      created.map((f) => `     ${f}`).join("\n") +
      "\n\n   Ni le typecheck ni les tests ne le voient : ils lisent le schéma\n" +
      "   TypeScript, pas la base. En production, `migrate` n'aurait rien à\n" +
      "   appliquer et l'application interrogerait une colonne absente — au\n" +
      "   premier client.\n\n" +
      "   Corriger : pnpm --filter @openhelpdesk/db db:generate, puis commiter\n" +
      "   la migration ET son instantané dans drizzle/meta.\n",
  );
  process.exit(1);
}

console.log(`✅ ${sqlFiles().length} migrations, et le schéma n'en réclame aucune de plus.`);
