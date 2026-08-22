import { defineConfig } from "@playwright/test";

/**
 * Open HelpDesk end-to-end smoke test.
 *
 * It does not test functions: it replays the product's journeys against an
 * instance that really runs, with its database, its SMTP and its sessions. That
 * is what catches the class of defect that has cost us the most here — a saved
 * setting nobody reads, a redirect that loses the subdomain, a role guard that
 * only exists in the interface.
 *
 * THREE THINGS MUST BE TRUE BEFORE RUNNING:
 *  1. docker compose -f docker/docker-compose.yml up -d   (Postgres, Mailpit, MinIO)
 *  2. the database is migrated and seeded   (pnpm db:migrate && pnpm db:seed && pnpm db:seed:auth)
 *  3. the server runs with a BASE_DOMAIN that MATCHES its port:
 *       BASE_DOMAIN=localhost:3006 pnpm --filter @openhelpdesk/web exec next start --port 3006
 *     Without that match, the middleware resolves no tenant and everything
 *     answers 404 — the first pitfall of the local environment.
 *
 * The browser is the Chrome installed on the machine (`channel: "chrome"`):
 * no binary to download, and it is the same engine as the screenshots use.
 */

const PORT = process.env.SMOKE_PORT ?? "3006";
const TENANT = process.env.SMOKE_TENANT ?? "acme";

/** The app is served by subdomain: the tenant is part of the address. */
export const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://${TENANT}.localhost:${PORT}`;
/** Mailpit's web interface — this is where the magic links arrive. */
export const MAILPIT_URL = process.env.SMOKE_MAILPIT_URL ?? "http://localhost:8026";

export default defineConfig({
  testDir: "./src",
  // The journeys share a single tenant: two specs switching the language or
  // shutting the portal down at the same time would step on each other.
  // Parallelism would be won by giving one tenant per worker, not by forcing it
  // here.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    headless: !process.env.SMOKE_HEADED,
    locale: "fr-FR",
    // A screenshot and a trace on failure only: a smoke test that passes must
    // leave nothing behind.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
});
