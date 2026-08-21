import { expect, type Page } from "@playwright/test";
import { BASE_URL, MAILPIT_URL } from "../playwright.config";

/* ---------------------------------------------------------------------------
 * Comptes du jeu de démonstration (packages/db seed + pnpm db:seed:auth).
 * Le mot de passe est commun et volontairement trivial : dev uniquement.
 * ------------------------------------------------------------------------- */

export const PASSWORD = "demo-openhelpdesk";

export const AGENTS = {
  owner: "claire.bonnet@acme.example",
  admin: "marie.dupont@acme.example",
  agent: "thomas.roux@acme.example",
} as const;

/** Une adresse neuve à chaque exécution : le portail crée le contact au vol. */
export function uniqueEmail(prefix = "smoke"): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@nordfil.example`;
}

/** Un sujet reconnaissable, pour retrouver la demande côté agent. */
export function uniqueSubject(label: string): string {
  return `[smoke ${new Date().toISOString().slice(11, 19)}] ${label}`;
}

/* ---------------------------------------------------------------------------
 * Connexion
 * ------------------------------------------------------------------------- */

/**
 * Connecte un agent par email + mot de passe et attend l'inbox.
 *
 * La tentative est rejouée : Better Auth plafonne /sign-in à trois appels par
 * dizaine de secondes et par IP, et une suite entière partage ce compteur. La
 * 429 est indiscernable d'un mauvais mot de passe à l'écran — l'application
 * affiche « Identifiants incorrects. » dans les deux cas — donc on ne peut pas
 * la reconnaître autrement qu'en réessayant après la fenêtre.
 */
export async function signInAgent(page: Page, email: string): Promise<void> {
  await expect(async () => {
    await page.goto("/login");
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/app\//, { timeout: 8_000 });
  }).toPass({ timeout: 60_000, intervals: [1_000, 3_000, 6_000, 12_000] });
}

export async function signOutAgent(page: Page): Promise<void> {
  await page.request.post("/api/auth/sign-out");
  await page.context().clearCookies();
}

/* ---------------------------------------------------------------------------
 * Lien magique — la seule façon d'ouvrir une session client
 * ------------------------------------------------------------------------- */

type MailpitMessage = { ID: string; Subject: string; To: { Address: string }[] };

/**
 * Récupère le lien de connexion envoyé à cette adresse.
 *
 * Mailpit est interrogé en boucle : l'envoi est asynchrone et un test qui lit
 * la boîte trop tôt échoue pour une raison qui n'a rien à voir avec le produit.
 */
export async function magicLinkFor(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=30`);
    const { messages } = (await res.json()) as { messages: MailpitMessage[] };
    const hit = messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()));
    if (hit) {
      const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${hit.ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      const body = `${full.Text ?? ""}${full.HTML ?? ""}`;
      const link = [...body.matchAll(/https?:\/\/[^\s"<>]+/g)]
        .map((m) => m[0])
        .find((u) => u.includes("/help/auth"));
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Aucun lien magique pour ${email} après ${timeoutMs} ms. ` +
      `Mailpit répond-il sur ${MAILPIT_URL} ? Les réglages email du tenant pointent-ils vers son SMTP (localhost:1026) ?`,
  );
}

/** Ouvre une session client de bout en bout : formulaire → email → lien. */
export async function signInContact(page: Page, email: string): Promise<void> {
  await page.goto("/help/login");
  await page.locator("#pt-login-email").fill(email);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/sent=1/);

  const link = await magicLinkFor(email);
  // Le lien DOIT porter le sous-domaine du tenant : c'est exactement ce qui
  // était cassé (redirection vers un domaine nu, donc 404).
  expect(link).toContain(new URL(BASE_URL).host);
  await page.goto(link);
  await expect(page).toHaveURL(/\/help\/requests/);
}

/* ---------------------------------------------------------------------------
 * Réglages du tenant, pilotés par l'interface d'administration
 *
 * On passe par les écrans plutôt que par SQL : un smoke test qui écrirait en
 * base directement ne dirait rien de l'écran d'administration, et c'est
 * précisément là qu'un réglage peut être enregistré sans jamais être lu.
 * ------------------------------------------------------------------------- */

/**
 * Bascule un interrupteur de ST-09 et enregistre. `on` = état voulu.
 *
 * La case elle-même est masquée par le composant Toggle
 * (`.ohd-toggle input { opacity: 0; width: 0; height: 0 }`) : elle mesure 0×0 et
 * refuse le clic, même en `force`. C'est le curseur visible qu'il faut viser.
 */
export async function setPortalToggle(
  page: Page,
  name: "portalEnabled" | "kbPublished",
  on: boolean,
): Promise<void> {
  await page.goto("/app/settings/portal");
  const box = page.locator(`input[name="${name}"]`);
  await expect(box).toHaveCount(1);
  if ((await box.isChecked()) !== on) {
    await page.locator(`label.ohd-toggle:has(input[name="${name}"]) .ohd-knob`).click();
    await expect(box).toBeChecked({ checked: on });
  }
  await page.locator('form:has(input[name="portalEnabled"]) button[type=submit]').click();
  // L'action serveur redirige avec ?saved=1 : sans cette attente, la navigation
  // suivante est annulée par la redirection et on lit l'ancien état.
  await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
}

/**
 * Change la langue du logiciel (ST-01) et attend la confirmation du serveur.
 *
 * Attendre que le `<select>` porte la valeur ne prouve rien — il la porte dès le
 * clic, avant que l'action ait répondu. On attend l'accusé de réception, faute
 * de quoi la redirection tardive annule la navigation suivante.
 */
export async function setTenantLocale(page: Page, code: string): Promise<void> {
  await page.goto("/app/settings/general");
  await page.locator('select[name="locale"]').selectOption(code);
  await page.locator('form:has(select[name="locale"]) button[type=submit]').last().click();
  await expect(page).toHaveURL(/saved=1/, { timeout: 15_000 });
  await expect(page.locator('select[name="locale"]')).toHaveValue(code);
}

/* ---------------------------------------------------------------------------
 * Petites assertions partagées
 * ------------------------------------------------------------------------- */

/** Vérifie qu'une URL répond bien le statut attendu, sans naviguer. */
export async function expectStatus(page: Page, path: string, status: number): Promise<void> {
  const res = await page.request.get(path, { maxRedirects: 0, failOnStatusCode: false });
  expect(res.status(), `${path} devrait répondre ${status}`).toBe(status);
}
