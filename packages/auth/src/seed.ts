/**
 * Creates the Better Auth identities of the 5 agents of the demo seed (Acme Support).
 * Shared demo password: "demo-openhelpdesk" — development only.
 * Usage: pnpm db:seed:auth (after pnpm db:seed).
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
      console.log(`already there  ${email}`);
    } else {
      throw err;
    }
  }
}

console.log(`\nDemo sign-in: <agent>@acme.example / ${DEMO_PASSWORD}`);
process.exit(0);
