/**
 * Auth agents — Better Auth (specs/01 § 3) :
 * email + mot de passe et OAuth Google/Microsoft en open source ;
 * SAML/SCIM arrivent dans /ee (ST-13, Lot 5a). 2FA : fin de Lot 0.
 *
 * Les sessions sont globales (schéma auth, non tenanté) ; l'appartenance au
 * workspace est vérifiée à chaque requête via app.users (email), côté apps/web.
 */
import { betterAuth } from "better-auth";
import { sendInstanceEmail } from "@openhelpdesk/mail";
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

const baseDomain = process.env.BASE_DOMAIN ?? "localhost:3000";

/*
 * Options cloud, inertes en auto-hébergé :
 * - AUTH_COOKIE_DOMAIN pose le cookie sur .open-helpdesk.com — la session du
 *   signup (www.) est déjà valide sur {slug}. à l'arrivée dans l'onboarding.
 * - REQUIRE_EMAIL_VERIFICATION=true bloque la connexion par mot de passe tant
 *   que l'email n'est pas vérifié (l'inscription OAuth est vérifiée d'office).
 */
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;
const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? `http://${baseDomain}`,
  // Chaque tenant vit sur son sous-domaine : {slug}.BASE_DOMAIN.
  trustedOrigins: [
    `http://${baseDomain}`,
    `http://*.${baseDomain}`,
    `https://${baseDomain}`,
    `https://*.${baseDomain}`,
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
    requireEmailVerification,
  },
  emailVerification: {
    sendOnSignUp: requireEmailVerification,
    sendVerificationEmail: async ({ user, url }) => {
      await sendInstanceEmail({
        to: user.email,
        subject: "Vérifiez votre adresse email — Verify your email address",
        text:
          `Confirmez votre adresse pour activer votre compte Open HelpDesk :\n${url}\n\n` +
          `Confirm your address to activate your Open HelpDesk account:\n${url}\n\n` +
          `Si vous n'êtes pas à l'origine de cette demande, ignorez cet email. / ` +
          `If you did not request this, please ignore this email.`,
      });
    },
  },
  ...(cookieDomain
    ? {
        advanced: {
          crossSubDomainCookies: { enabled: true, domain: cookieDomain },
        },
      }
    : {}),
  socialProviders,
});

export type AuthSession = typeof auth.$Infer.Session;
