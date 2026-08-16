/**
 * Crée les identités Better Auth des 5 agents du seed démo (Acme Support).
 * Mot de passe commun de démo : « demo-openhelpdesk » — dev uniquement.
 * Usage : pnpm db:seed:auth (après pnpm db:seed).
 */
import { auth } from "./index";

const DEMO_PASSWORD = "demo-openhelpdesk";

const agents = [
  ["Claire Bonnet", "claire.bonnet@acme.example"],
  ["Marie Dupont", "marie.dupont@acme.example"],
  ["Thomas Roux", "thomas.roux@acme.example"],
  ["Sofiane Amrani", "sofiane.amrani@acme.example"],
  ["Élise Chabot", "elise.chabot@acme.example"],
] as const;

for (const [name, email] of agents) {
  try {
    await auth.api.signUpEmail({ body: { name, email, password: DEMO_PASSWORD } });
    console.log(`OK  ${email}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/exist/i.test(message)) {
      console.log(`déjà présent  ${email}`);
    } else {
      throw err;
    }
  }
}

console.log(`\nConnexion démo : <agent>@acme.example / ${DEMO_PASSWORD}`);
process.exit(0);
