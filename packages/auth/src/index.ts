/**
 * Agent auth — Better Auth:
 * email + password and Google/Microsoft OAuth in open source;
 * SAML/SCIM land in /ee (ST-13, Lot 5a). 2FA: end of Lot 0.
 *
 * Sessions are global (auth schema, not tenant-scoped); workspace membership is
 * checked on every request via app.users (email), on the apps/web side.
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
 * Control-plane options, inert when self-hosted:
 * - AUTH_COOKIE_DOMAIN sets the cookie on the parent domain (.BASE_DOMAIN) — the
 *   session from the signup (www.) is already valid on {slug}. when landing in
 *   the onboarding.
 * - REQUIRE_EMAIL_VERIFICATION=true blocks password sign-in as long as the email
 *   is not verified (an OAuth sign-up is verified by default).
 */
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;
const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? `http://${baseDomain}`,
  // Every tenant lives on its own subdomain: {slug}.BASE_DOMAIN.
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
        // Sent from a package: no access to the i18n dictionaries (apps/web/src/i18n),
        // and the account has no tenant yet at this point — hence English only.
        subject: "Verify your email address",
        text:
          `Confirm your address to activate your Open HelpDesk account:\n${url}\n\n` +
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
