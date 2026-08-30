/**
 * Resolution of the sending configuration (ST-03).
 *
 * Self-hosted: the workspace's own settings win, falling back to the instance
 * environment, then the console transport. Whoever runs the instance owns its
 * deliverability, so letting them choose a provider is the whole point.
 *
 * Cloud: sending is OURS and is not negotiable. The workspace never picks a
 * provider and never picks a From address; both come from the managed setup.
 * Not paternalism — arithmetic:
 *   - a customer-entered provider would bypass the Brevo account whose IP is
 *     allow-listed and whose per-tenant domain we authenticate, so we would lose
 *     the deliverability we are being paid for (and a typo in their credentials
 *     would break their sending while ours sat there working);
 *   - a customer-entered From address on their own domain would be sent through
 *     our Brevo with no SPF include and no DKIM key of ours on that domain →
 *     DMARC failure → spam or outright rejection. Their domain is only ever
 *     authenticated for INBOUND (a forward), never for outbound.
 * A customer bringing their own address therefore forwards it to us and replies
 * leave from the managed address; they may still set the display name and a
 * Reply-To, neither of which any receiver authenticates.
 */
import { db, emailSettings, mailboxes, tenants } from "@openhelpdesk/db";
import { decryptSecrets } from "@openhelpdesk/crypto";
import { isCloud } from "@openhelpdesk/config";
import { asc, eq } from "drizzle-orm";
import {
  brevoTransport,
  consoleTransport,
  mailjetTransport,
  resendTransport,
  smtpTransport,
  type MailProvider,
} from "./providers";
import type { MailKind, MailTransport } from "./types";

export type ResolvedMailConfig = {
  provider: MailProvider;
  transport: MailTransport;
  from: string;
  replyTo?: string;
  /** Where the configuration comes from — displayed on the settings screen. */
  source: "tenant" | "instance" | "default";
};

export type EmailSettingsRow = typeof emailSettings.$inferSelect;

export async function getEmailSettings(tenantId: string): Promise<EmailSettingsRow | null> {
  const [row] = await db
    .select()
    .from(emailSettings)
    .where(eq(emailSettings.tenantId, tenantId));
  return row ?? null;
}

/** Transport of a set of settings (secrets decrypted on demand). */
export function transportFor(row: EmailSettingsRow): MailTransport {
  const secrets = decryptSecrets(row.encryptedSecrets);
  switch (row.provider) {
    case "smtp":
      if (!row.smtpHost) return consoleTransport;
      return smtpTransport({
        host: row.smtpHost,
        port: row.smtpPort ?? 587,
        secure: row.smtpSecure,
        user: row.smtpUser ?? undefined,
        password: secrets.password,
      });
    case "resend":
      return secrets.apiKey ? resendTransport(secrets.apiKey) : consoleTransport;
    case "brevo":
      return secrets.apiKey ? brevoTransport(secrets.apiKey) : consoleTransport;
    case "mailjet":
      return secrets.apiKey && secrets.apiSecret
        ? mailjetTransport(secrets.apiKey, secrets.apiSecret)
        : consoleTransport;
    case "console":
    default:
      return consoleTransport;
  }
}

/** The instance's own sender — the one the provider has been told about. */
export function instanceFrom(): string {
  const domain = (process.env.BASE_DOMAIN ?? "open-helpdesk.local").split(":")[0];
  return process.env.MAIL_FROM ?? `no-reply@${domain}`;
}

/**
 * PRE-tenant transactional send (email verification at signup, invitation
 * before the first sign-in…): instance transport, console fallback in dev.
 */
export async function sendInstanceEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const instance = instanceConfig();
  const transport = instance?.transport ?? consoleTransport;
  const from = instanceFrom();
  try {
    await transport.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Instance configuration (self-hosted / control-plane deployment) from the environment. */
function instanceConfig(): { provider: MailProvider; transport: MailTransport } | null {
  if (process.env.RESEND_API_KEY) {
    return { provider: "resend", transport: resendTransport(process.env.RESEND_API_KEY) };
  }
  if (process.env.BREVO_API_KEY) {
    return { provider: "brevo", transport: brevoTransport(process.env.BREVO_API_KEY) };
  }
  if (process.env.MAILJET_API_KEY && process.env.MAILJET_API_SECRET) {
    return {
      provider: "mailjet",
      transport: mailjetTransport(process.env.MAILJET_API_KEY, process.env.MAILJET_API_SECRET),
    };
  }
  if (process.env.SMTP_HOST) {
    return {
      provider: "smtp",
      transport: smtpTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
      }),
    };
  }
  return null;
}

/** Sending address: tenant settings, otherwise the inbound mailbox, otherwise the instance. */
async function resolveFrom(
  tenantId: string,
  row: EmailSettingsRow | null,
): Promise<{ from: string; replyTo?: string }> {
  // Self-hosted only: the operator may send from any address they control.
  if (!isCloud() && row?.fromAddress) {
    return {
      from: row.fromName ? `${row.fromName} <${row.fromAddress}>` : row.fromAddress,
      replyTo: row.replyTo ?? undefined,
    };
  }
  // The managed address first, then the oldest mailbox. Ordered on purpose: a
  // bare limit(1) returned an arbitrary row, so a workspace holding both its
  // provided mailbox and a forwarded one could send from the forwarded domain —
  // unauthenticated for outbound — and the choice could flip between deploys.
  const boxes = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.tenantId, tenantId))
    .orderBy(asc(mailboxes.createdAt));
  const mailbox = boxes.find((b) => b.kind === "provided") ?? boxes[0];
  if (mailbox?.address) {
    // Display name from the settings row if set, otherwise the mailbox's own:
    // a name is free text no receiver authenticates, so it stays the customer's.
    const name = row?.fromName || mailbox.senderName;
    return {
      from: name ? `${name} <${mailbox.address}>` : mailbox.address,
      replyTo: row?.replyTo ?? undefined,
    };
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const fallbackDomain = process.env.BASE_DOMAIN ?? "open-helpdesk.local";
  return {
    from:
      process.env.MAIL_FROM ??
      `support@${tenant?.slug ? `${tenant.slug}.` : ""}${fallbackDomain.split(":")[0]}`,
  };
}

export async function resolveMailConfig(
  tenantId: string,
  /**
   * `admin` — le produit qui écrit aux gens du workspace À PROPOS du workspace
   * (bienvenue, fin d'essai, impayé, suspension). Ces messages partent de
   * l'expéditeur de l'INSTANCE, jamais de l'adresse du workspace.
   *
   * Ce n'est pas un détail de présentation : l'adresse d'un espace fraîchement
   * créé — support@{slug}.{domaine} — n'est authentifiée nulle part au moment
   * où l'email de bienvenue part, et le fournisseur la refuse. Constaté sur la
   * staging, où Brevo rejetait « the sender you used … is not valid » : le
   * journal disait « envoyé », le message ne partait pas, et personne ne
   * recevait ni sa bienvenue ni son avis de suspension. Les réponses aux
   * clients, elles, gardent l'adresse du workspace — c'est la sienne qu'un
   * client doit voir.
   */
  kind?: MailKind,
): Promise<ResolvedMailConfig> {
  const row = await getEmailSettings(tenantId);
  const { from, replyTo } =
    kind === "admin"
      ? { from: instanceFrom(), replyTo: undefined }
      : await resolveFrom(tenantId, row);

  // Cloud: the instance transport, always. A stored tenant provider (from before
  // this rule, or from a forged request) is ignored rather than honoured.
  if (!isCloud() && row && row.provider !== "console") {
    return { provider: row.provider, transport: transportFor(row), from, replyTo, source: "tenant" };
  }
  const instance = instanceConfig();
  if (instance) {
    return { ...instance, from, replyTo, source: "instance" };
  }
  return { provider: "console", transport: consoleTransport, from, replyTo, source: "default" };
}
