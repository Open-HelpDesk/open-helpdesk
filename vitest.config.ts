import { defineConfig } from "vitest/config";

/**
 * Two families of tests, and the line between them is whether they need a
 * database.
 *
 *   pnpm test        → the unit projet only. No Postgres, no Redis, no network.
 *                      This is the one a pull request must always be able to run.
 *   pnpm test:db     → the integration projet. Needs docker/docker-compose.yml up
 *                      and a migrated database; it writes, and it cleans up.
 *
 * Keeping them apart is not tidiness. A suite that cannot run without
 * infrastructure gets skipped, and a skipped suite is a suite nobody trusts —
 * which is exactly how the end-to-end suite came to spend ten days red without
 * anyone noticing. So the fast half has no excuse to be skipped, and the slow
 * half says out loud what it needs.
 *
 * The end-to-end journeys stay in packages/smoke under Playwright: they drive a
 * browser against a running instance, which is a third thing again.
 */
/**
 * Ce que la couverture surveille — et pourquoi la liste est explicite.
 *
 * Mesurer tout le dépôt donnerait un pourcentage à un chiffre, dominé par des
 * dizaines de milliers de lignes d'écrans React que la suite Playwright couvre
 * déjà en les parcourant. Ce chiffre-là ne dirait rien et personne ne le
 * regarderait : il baisserait à chaque écran ajouté et monterait en écrivant des
 * tests sur ce qui est facile.
 *
 * La liste ci-dessous est donc celle des modules qui **décident** — ce qui
 * arrive à un ticket, ce qui part chez un client, ce qu'un espace a le droit de
 * faire, ce qu'un appel coûte. Ce sont aussi les seuls qui se testent sans
 * navigateur ni base. Un module qui entre ici entre avec ses tests.
 */
const COVERED = [
  "packages/rules/src/evaluate.ts",
  "packages/rules/src/business-hours.ts",
  "packages/config/src/entitlements.ts",
  "apps/web/src/lib/format.ts",
  "apps/web/src/lib/entitlements.ts",
  "ee/ai/src/redact.ts",
  "ee/ai/src/provider.ts",
  "ee/ai/src/similarity.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["{packages,apps,ee}/*/src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/*.db.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "db",
          include: ["{packages,apps,ee}/*/src/**/*.db.test.ts"],
          exclude: ["**/node_modules/**"],
          environment: "node",
          /* Une base partagée : deux fichiers qui sèment en parallèle se
             marchent dessus. Le parallélisme se gagnerait avec un espace par
             worker, pas en le forçant ici — même raisonnement que la suite
             Playwright. */
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: COVERED,
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      /*
       * Un plancher, pas une cible.
       *
       * Ces chiffres sont le niveau **mesuré** le 09/09/2026 sur la liste
       * ci-dessus, arrondi au point inférieur. Ils ne disent pas « voilà ce
       * qu'il faut atteindre » : ils disent « on ne redescend pas ». Une cible
       * ronde choisie d'avance se satisfait en testant ce qui est facile, et le
       * chiffre monte pendant que le risque reste où il était.
       *
       * Ce qui reste découvert est découvert pour une raison nommée : `embed()`
       * et le corps réseau de `chatComplete` sont éprouvés par `ee/ai/live.mts`
       * contre le vrai fournisseur, et `occupiedSeats` par le projet `db`. Les
       * simuler ici gonflerait le chiffre sans rien garder de plus.
       *
       * Pour relever le plancher : mesurer, et remonter ces valeurs dans le même
       * commit que les tests qui les justifient.
       *
       * **Rebasé le 10/09 au passage à vitest 5, sans qu'aucun test change.**
       * Le total d'instructions surveillées est passé de 545 à 248 et celui des
       * branches de 149 à 228 : l'outil ne compte plus les mêmes choses. Les 69
       * tests passent tous, à l'identique — ce n'est pas la couverture qui a
       * baissé, c'est la règle de mesure qui a bougé.
       *
       * C'est le défaut d'un plancher chiffré, et il vaut mieux le connaître
       * que le découvrir : à chaque montée de l'outil de mesure, remesurer et
       * re-geler, **dans le commit de la montée** et jamais dans un autre —
       * sinon on ne distingue plus un instrument qui change d'une couverture
       * qui tombe.
       */
      thresholds: {
        statements: 87,
        branches: 75,
        functions: 86,
        lines: 88,
      },
    },
  },
});
