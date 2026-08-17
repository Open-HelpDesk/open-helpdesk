/**
 * Métadonnées des fournisseurs d'envoi — données pures, sans aucune dépendance.
 *
 * Module séparé exprès : l'écran de configuration est un composant client, il ne doit
 * pas embarquer les transports (nodemailer, BullMQ, accès base) dans le bundle navigateur.
 */

export type MailProvider = "console" | "smtp" | "resend" | "brevo" | "mailjet";

export const PROVIDER_META: Record<
  MailProvider,
  { label: string; hint: string; secretLabel?: string; docsHost?: string }
> = {
  console: {
    label: "Aucun envoi (développement)",
    hint: "Les emails sont écrits dans les journaux du serveur, rien ne part.",
  },
  smtp: {
    label: "Serveur SMTP",
    hint: "Votre propre serveur, ou le relais SMTP de n'importe quel fournisseur.",
    secretLabel: "Mot de passe SMTP",
  },
  resend: {
    label: "Resend",
    hint: "API HTTP. Clé au format re_… depuis resend.com/api-keys.",
    secretLabel: "Clé d'API",
    docsHost: "resend.com",
  },
  brevo: {
    label: "Brevo",
    hint: "API HTTP v3. Clé xkeysib-… depuis Brevo → SMTP & API.",
    secretLabel: "Clé d'API",
    docsHost: "brevo.com",
  },
  mailjet: {
    label: "Mailjet",
    hint: "API HTTP v3.1. Clé publique et clé privée depuis Mailjet → Clés API.",
    secretLabel: "Clé d'API (publique)",
    docsHost: "mailjet.com",
  },
};

/** Relais SMTP préremplis proposés dans l'écran de configuration. */
export const SMTP_PRESETS: {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
}[] = [
  { id: "custom", label: "Serveur personnalisé", host: "", port: 587, secure: false },
  { id: "brevo", label: "Brevo (relais SMTP)", host: "smtp-relay.brevo.com", port: 587, secure: false },
  { id: "mailjet", label: "Mailjet (relais SMTP)", host: "in-v3.mailjet.com", port: 587, secure: false },
  { id: "mailgun", label: "Mailgun", host: "smtp.mailgun.org", port: 587, secure: false },
  { id: "postmark", label: "Postmark", host: "smtp.postmarkapp.com", port: 587, secure: false },
  {
    id: "ses-eu-west-1",
    label: "Amazon SES (eu-west-1)",
    host: "email-smtp.eu-west-1.amazonaws.com",
    port: 587,
    secure: false,
  },
  { id: "scaleway", label: "Scaleway TEM", host: "smtp.tem.scw.cloud", port: 587, secure: false },
  { id: "gmail", label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 465, secure: true },
  { id: "mailpit", label: "Mailpit (développement local)", host: "localhost", port: 1026, secure: false },
];
