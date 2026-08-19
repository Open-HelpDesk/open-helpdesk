import { defineConfig } from "@playwright/test";

/**
 * Smoke test de bout en bout d'Open HelpDesk.
 *
 * Il ne teste pas des fonctions : il rejoue les parcours du produit sur une
 * instance qui tourne vraiment, avec sa base, son SMTP et ses sessions. C'est ce
 * qui permet d'attraper la classe de défaut qui nous a le plus coûté ici — un
 * réglage enregistré que personne ne lit, une redirection qui perd le
 * sous-domaine, une garde de rôle qui n'existe que dans l'interface.
 *
 * TROIS CHOSES DOIVENT ÊTRE VRAIES AVANT DE LANCER :
 *  1. docker compose -f docker/docker-compose.yml up -d   (Postgres, Mailpit, MinIO)
 *  2. la base est migrée et remplie   (pnpm db:migrate && pnpm db:seed && pnpm db:seed:auth)
 *  3. le serveur tourne avec un BASE_DOMAIN qui CORRESPOND à son port :
 *       BASE_DOMAIN=localhost:3006 pnpm --filter @openhelpdesk/web exec next start --port 3006
 *     Sans cette correspondance, le middleware ne résout aucun tenant et tout
 *     répond 404 — c'est le premier piège de l'environnement local.
 *
 * Le navigateur est le Chrome installé sur la machine (`channel: "chrome"`) :
 * pas de binaire à télécharger, et c'est le même moteur que celui des captures.
 */

const PORT = process.env.SMOKE_PORT ?? "3006";
const TENANT = process.env.SMOKE_TENANT ?? "acme";

/** L'app se sert par sous-domaine : le tenant fait partie de l'adresse. */
export const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://${TENANT}.localhost:${PORT}`;
/** Interface web de Mailpit — c'est par là que les liens magiques arrivent. */
export const MAILPIT_URL = process.env.SMOKE_MAILPIT_URL ?? "http://localhost:8026";

export default defineConfig({
  testDir: "./src",
  // Les parcours partagent un tenant unique : deux specs qui basculent la langue
  // ou coupent le portail en même temps se marcheraient dessus. Le parallélisme
  // se gagnerait en donnant un tenant par worker, pas en forçant ici.
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
    // Une capture et une trace uniquement sur échec : un smoke test qui passe
    // ne doit rien laisser derrière lui.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
});
