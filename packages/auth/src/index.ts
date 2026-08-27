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

/*
 * Sending the confirmation and *gating* on it are two different decisions, and
 * they used to be one flag.
 *
 * Blocking at the door means the first thing a new account meets is an empty
 * screen telling it to go read its mail — the setup wizard is never seen from
 * its first step. Confirming on a deadline instead lets the account work
 * immediately and still get its address confirmed: the mail goes out, and
 * whoever enforces the deadline (the control plane, hourly) suspends what never
 * got confirmed.
 *
 * SEND_EMAIL_VERIFICATION=true asks for the mail without the gate.
 * REQUIRE_EMAIL_VERIFICATION=true still implies it — a gate with no mail would
 * lock the account out for good.
 * EMAIL_VERIFICATION_DEADLINE_DAYS, when set, is named in the mail: a deadline
 * nobody was told about is a trap. Unset, the mail states no deadline, which is
 * the honest text for a self-hosted instance that enforces none.
 */
const sendEmailVerification =
  requireEmailVerification || process.env.SEND_EMAIL_VERIFICATION === "true";
const verificationDeadlineDays = Number(process.env.EMAIL_VERIFICATION_DEADLINE_DAYS ?? "");

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
    sendOnSignUp: sendEmailVerification,
    // Clicking the link from a phone, when the account was created on a laptop,
    // should land signed in rather than on a sign-in form.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // The account is already usable unless REQUIRE_EMAIL_VERIFICATION gates
      // it, so the mail must not claim the link is what "activates" it — it
      // confirms the address, and says what happens if it never is.
      const deadline =
        Number.isFinite(verificationDeadlineDays) && verificationDeadlineDays > 0
          ? `\nConfirm within ${verificationDeadlineDays} days, or access will be suspended until you do.\n`
          : "";
      await sendInstanceEmail({
        to: user.email,
        // Sent from a package: no access to the i18n dictionaries (apps/web/src/i18n),
        // and the account has no tenant yet at this point — hence English only.
        subject: "Confirm your email address",
        text:
          `Confirm this address for your Open HelpDesk account:\n${url}\n${deadline}\n` +
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
