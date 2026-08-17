/**
 * Transports d'envoi — un par fournisseur (ST-03).
 *
 * Le SMTP couvre l'auto-hébergement ET la plupart des acteurs du marché via leur relais
 * (Brevo, Mailjet, Mailgun, SES, Postmark, Scaleway…). Les transports d'API natives
 * apportent en plus les identifiants de message des fournisseurs et de meilleurs messages
 * d'erreur.
 */
import type { MailTransport, OutgoingEmail } from "./types";

export type { MailProvider } from "./provider-meta";
export { PROVIDER_META, SMTP_PRESETS } from "./provider-meta";
import type { MailProvider } from "./provider-meta";

export type SmtpConfig = {
  host: string;
  port: number;
  /** true = TLS implicite (465) ; false = STARTTLS (587/25). */
  secure: boolean;
  user?: string;
  password?: string;
};

/* ---------- Console ---------- */

export const consoleTransport: MailTransport = {
  async send(mail) {
    const messageId = `<dev-${Date.now()}-${Math.random().toString(36).slice(2)}@open-helpdesk.local>`;
    console.log(
      `[mail:console] à: ${mail.to} | de: ${mail.from} | sujet: ${mail.subject} | id: ${messageId}\n${mail.text.slice(0, 800)}`,
    );
    return { messageId };
  },
  async verify() {
    return { ok: true, detail: "Transport de développement : aucun envoi réel." };
  },
};

/* ---------- SMTP (nodemailer) ---------- */

export function smtpTransport(config: SmtpConfig): MailTransport {
  // Import paresseux : le worker et le web n'ont pas besoin de nodemailer sur les
  // chemins qui n'envoient pas d'email.
  async function createTransporter() {
    const nodemailer = await import("nodemailer");
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  return {
    async send(mail: OutgoingEmail) {
      const transporter = await createTransporter();
      const info = await transporter.sendMail({
        from: mail.from,
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
        headers: mail.headers,
      });
      return { messageId: info.messageId };
    },
    async verify() {
      try {
        const transporter = await createTransporter();
        await transporter.verify();
        return {
          ok: true,
          detail: `Connexion établie sur ${config.host}:${config.port} (${config.secure ? "TLS" : "STARTTLS"}).`,
        };
      } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/* ---------- Resend ---------- */

export function resendTransport(apiKey: string): MailTransport {
  return {
    async send(mail: OutgoingEmail) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: mail.from,
          to: [mail.to],
          reply_to: mail.replyTo,
          subject: mail.subject,
          text: mail.text,
          headers: mail.headers,
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status} : ${await res.text()}`);
      const data = (await res.json()) as { id?: string };
      return { messageId: data.id };
    },
    async verify() {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { ok: true, detail: "Clé d'API Resend valide." };
      if (res.status === 401) return { ok: false, detail: "Clé d'API refusée par Resend (401)." };
      return { ok: false, detail: `Resend a répondu ${res.status}.` };
    },
  };
}

/* ---------- Brevo (ex-Sendinblue), API v3 ---------- */

function splitAddress(value: string): { email: string; name?: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { email: match[2]!.trim(), name: match[1]!.replace(/^"|"$/g, "").trim() || undefined };
  return { email: value.trim() };
}

export function brevoTransport(apiKey: string): MailTransport {
  return {
    async send(mail: OutgoingEmail) {
      const from = splitAddress(mail.from);
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { email: from.email, name: from.name },
          to: [{ email: mail.to }],
          replyTo: mail.replyTo ? { email: splitAddress(mail.replyTo).email } : undefined,
          subject: mail.subject,
          textContent: mail.text,
          headers: mail.headers,
        }),
      });
      if (!res.ok) throw new Error(`Brevo ${res.status} : ${await res.text()}`);
      const data = (await res.json()) as { messageId?: string };
      return { messageId: data.messageId };
    },
    async verify() {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": apiKey, Accept: "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as { email?: string; companyName?: string };
        return {
          ok: true,
          detail: `Compte Brevo reconnu${data.email ? ` (${data.email})` : ""}.`,
        };
      }
      if (res.status === 401) return { ok: false, detail: "Clé d'API refusée par Brevo (401)." };
      return { ok: false, detail: `Brevo a répondu ${res.status}.` };
    },
  };
}

/* ---------- Mailjet, API v3.1 ---------- */

export function mailjetTransport(apiKey: string, apiSecret: string): MailTransport {
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return {
    async send(mail: OutgoingEmail) {
      const from = splitAddress(mail.from);
      const res = await fetch("https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          Messages: [
            {
              From: { Email: from.email, Name: from.name },
              To: [{ Email: mail.to }],
              ReplyTo: mail.replyTo ? { Email: splitAddress(mail.replyTo).email } : undefined,
              Subject: mail.subject,
              TextPart: mail.text,
              Headers: mail.headers,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Mailjet ${res.status} : ${await res.text()}`);
      const data = (await res.json()) as {
        Messages?: { Status?: string; To?: { MessageID?: string; MessageUUID?: string }[] }[];
      };
      const first = data.Messages?.[0];
      if (first?.Status && first.Status !== "success") {
        throw new Error(`Mailjet a refusé l'envoi : ${JSON.stringify(first)}`);
      }
      return { messageId: first?.To?.[0]?.MessageUUID ?? first?.To?.[0]?.MessageID };
    },
    async verify() {
      const res = await fetch("https://api.mailjet.com/v3/REST/sender?Limit=1", {
        headers: { Authorization: `Basic ${basic}` },
      });
      if (res.ok) return { ok: true, detail: "Clés Mailjet valides." };
      if (res.status === 401) return { ok: false, detail: "Clés refusées par Mailjet (401)." };
      return { ok: false, detail: `Mailjet a répondu ${res.status}.` };
    },
  };
}
