/**
 * Auth agents — Better Auth (specs/01 § 3) :
 * email + mot de passe et OAuth Google/Microsoft en open source ;
 * SAML/SCIM arrivent dans /ee (ST-13, Lot 5a). 2FA : fin de Lot 0.
 *
 * Les sessions sont globales (schéma auth, non tenanté) ; l'appartenance au
 * workspace est vérifiée à chaque requête via app.users (email), côté apps/web.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  db,
} from "@openhelpdesk/db";

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  socialProviders.microsoft = {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  // Chaque tenant vit sur son sous-domaine : {slug}.BASE_DOMAIN.
  trustedOrigins: [
    "http://localhost:3000",
    "http://*.localhost:3000",
    ...(process.env.BASE_DOMAIN && process.env.BASE_DOMAIN !== "localhost:3000"
      ? [`https://${process.env.BASE_DOMAIN}`, `https://*.${process.env.BASE_DOMAIN}`]
      : []),
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authUsers,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders,
});

export type AuthSession = typeof auth.$Infer.Session;
