/**
 * Agent auth — Better Auth:
 * email + password and Google/Microsoft OAuth in open source;
 * SAML/SCIM land in /ee (ST-13, Lot 5a). 2FA: end of Lot 0.
 *
 * Sessions are global (auth schema, not tenant-scoped); workspace membership is
 * checked on every request via app.users (email), on the apps/web side.
 */
import { betterAuth } from "better-auth";
import {
  brandedHtml,
  brandedText,
  sendInstanceEmail,
  type BrandedEmail,
} from "@openhelpdesk/mail";
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
    // A forgotten password used to be a dead end: the login link went nowhere
    // and this callback did not exist, so Better Auth's reset endpoints stayed
    // inert. Configuring it turns on /request-password-reset and /reset-password.
    resetPasswordTokenExpiresIn: 3600,
    // A reset is the recovery move after a possible compromise: cut every other
    // session so a lurking one cannot outlive the new password.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }, request) => {
      // The link must land on the workspace that asked, not on the apex.
      // Better Auth builds its own url from baseURL (the apex, where www serves
      // auth) — we ignore it and point at the tenant subdomain the request came
      // in on, so the reset page renders in the right workspace. The token is
      // the same value /reset-password consumes, so no apex round-trip is needed.
      const host = request?.headers.get("host") ?? baseDomain;
      const proto = host.startsWith("localhost") ? "http" : "https";
      const url = `${proto}://${host}/reset-password?token=${token}`;
      await sendInstanceEmail({
        to: user.email,
        // English only, like the verification email: a package has no access to
        // the tenant's i18n dictionaries (apps/web/src/i18n).
        subject: "Reset your password",
        text:
          `Someone asked to reset the password for your Open HelpDesk account.\n` +
          `Set a new one here (the link expires in one hour):\n${url}\n\n` +
          `If you did not ask for this, ignore this email — your password stays unchanged.`,
      });
    },
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
          ? `Confirm within ${verificationDeadlineDays} days, or access will be suspended until you do.`
          : "";

      /*
       * Where the link LANDS, once the address is confirmed.
       *
       * Better Auth sends the visitor to its own default afterwards, which is
       * the apex — the marketing site. People clicked, saw the home page, and
       * concluded nothing had happened. Unlike the password reset, the host
       * cannot tell us the workspace: signing up happens on the apex, and the
       * workspace is created moments later, so at this point there may not be
       * one yet. The sign-in page is the right destination — it looks the
       * account up and sends it to its own workspace.
       */
      const withCallback = (() => {
        try {
          const link = new URL(url);
          link.searchParams.set("callbackURL", `${link.origin}/connexion`);
          return link.toString();
        } catch {
          return url;
        }
      })();

      const mail: BrandedEmail = {
        title: "Confirm your email address",
        intro: [
          "One click and your Open HelpDesk account is confirmed. It tells us this mailbox is really yours — the address your customers will see replies come from.",
          ...(deadline ? [deadline] : []),
        ],
        button: { label: "Confirm my address", url: withCallback },
        footnote:
          "If you did not create an Open HelpDesk account, ignore this email — nothing will happen.",
        signature: "Open HelpDesk",
      };

      await sendInstanceEmail({
        to: user.email,
        // Sent from a package: no access to the i18n dictionaries (apps/web/src/i18n),
        // and the account has no tenant yet at this point — hence English only.
        subject: "Confirm your email address",
        text: brandedText(mail),
        html: brandedHtml(mail),
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
