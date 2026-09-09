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
  },
});
