/**
 * Résolution de la configuration d'envoi (ST-03) : réglages du tenant, sinon repli sur
 * la configuration d'instance (variables d'environnement), sinon transport console.
 *
 * Le repli d'instance sert deux cas : l'auto-hébergement mono-tenant (une seule config
 * pour tout le monde) et le cloud, où Open HelpDesk envoie par défaut depuis son propre
 * domaine tant que le client n'a pas branché le sien.
 */
import { db, emailSettings, mailboxes, tenants } from "@openhelpdesk/db";
import { decryptSecrets } from "@openhelpdesk/crypto";
import { eq } from "drizzle-orm";
import {
  brevoTransport,
  consoleTransport,
  mailjetTransport,
  resendTransport,
  smtpTransport,
  type MailProvider,
} from "./providers";
import type { MailTransport } from "./types";

export type ResolvedMailConfig = {
  provider: MailProvider;
  transport: MailTransport;
  from: string;
  replyTo?: string;
  /** D'où vient la configuration — affiché dans l'écran de réglages. */
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

/** Transport d'un jeu de réglages (secrets déchiffrés à la demande). */
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

/**
 * Envoi transactionnel PRÉ-tenant (vérification d'email au signup, invitation
 * avant première connexion…) : transport d'instance, repli console en dev.
 */
export async function sendInstanceEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const instance = instanceConfig();
  const transport = instance?.transport ?? consoleTransport;
  const domain = (process.env.BASE_DOMAIN ?? "open-helpdesk.local").split(":")[0];
  const from = process.env.MAIL_FROM ?? `no-reply@${domain}`;
  try {
    await transport.send({ from, to: input.to, subject: input.subject, text: input.text });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Configuration d'instance (auto-hébergement / cloud) depuis l'environnement. */
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

/** Adresse d'expédition : réglages du tenant, sinon boîte de réception, sinon instance. */
async function resolveFrom(
  tenantId: string,
  row: EmailSettingsRow | null,
): Promise<{ from: string; replyTo?: string }> {
  if (row?.fromAddress) {
    return {
      from: row.fromName ? `${row.fromName} <${row.fromAddress}>` : row.fromAddress,
      replyTo: row.replyTo ?? undefined,
    };
  }
  const [mailbox] = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.tenantId, tenantId))
    .limit(1);
  if (mailbox?.address) {
    return {
      from: mailbox.senderName ? `${mailbox.senderName} <${mailbox.address}>` : mailbox.address,
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

export async function resolveMailConfig(tenantId: string): Promise<ResolvedMailConfig> {
  const row = await getEmailSettings(tenantId);
  const { from, replyTo } = await resolveFrom(tenantId, row);

  if (row && row.provider !== "console") {
    return { provider: row.provider, transport: transportFor(row), from, replyTo, source: "tenant" };
  }
  const instance = instanceConfig();
  if (instance) {
    return { ...instance, from, replyTo, source: "instance" };
  }
  return { provider: "console", transport: consoleTransport, from, replyTo, source: "default" };
}
