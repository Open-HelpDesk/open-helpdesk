/**
 * Enregistrements DNS d'expédition (ST-03) — générés pour le domaine et le fournisseur
 * réellement configurés, et non affichés en dur.
 *
 * Les valeurs exactes de DKIM sont propres à chaque compte fournisseur : on donne
 * l'enregistrement quand il est déterministe, et l'instruction précise quand il faut
 * aller chercher la valeur dans le tableau de bord du fournisseur.
 */
import type { MailProvider } from "./providers";

export type DnsRecord = {
  label: string;
  type: "TXT" | "CNAME" | "MX";
  host: string;
  value: string;
  /** true si la valeur doit être récupérée chez le fournisseur. */
  fromProvider?: boolean;
  hint?: string;
};

const SPF_INCLUDE: Partial<Record<MailProvider, string>> = {
  resend: "include:amazonses.com",
  brevo: "include:spf.brevo.com",
  mailjet: "include:spf.mailjet.com",
};

export function dnsRecordsFor(params: {
  provider: MailProvider;
  /** Domaine de l'adresse d'expédition (partie après @). */
  domain: string;
  smtpHost?: string | null;
}): DnsRecord[] {
  const { provider, domain } = params;
  if (!domain) return [];

  const include =
    SPF_INCLUDE[provider] ??
    (provider === "smtp" && params.smtpHost ? `a:${params.smtpHost}` : "");

  const records: DnsRecord[] = [
    {
      label: "SPF",
      type: "TXT",
      host: "@",
      value: `v=spf1 ${include || "include:votre-fournisseur"} ~all`,
      hint: include
        ? "Fusionnez cette valeur avec votre enregistrement SPF existant s'il y en a un — un seul SPF par domaine."
        : "Remplacez la partie include: par celle indiquée par votre fournisseur.",
      fromProvider: !include,
    },
    {
      label: "DKIM",
      type: provider === "brevo" ? "TXT" : "CNAME",
      host: provider === "brevo" ? `mail._domainkey.${domain}` : `ohd._domainkey.${domain}`,
      value: "",
      fromProvider: true,
      hint:
        provider === "smtp"
          ? "Générée par votre serveur mail (OpenDKIM ou équivalent)."
          : "Valeur fournie par votre compte — section Domaines d'expédition.",
    },
    {
      label: "DMARC",
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      hint: "Commencez en p=none pour observer, puis passez à quarantine une fois SPF et DKIM alignés.",
    },
  ];

  return records;
}

/** Domaine d'une adresse email (« Support <a@b.fr> » → « b.fr »). */
export function domainOf(address: string | null | undefined): string {
  if (!address) return "";
  const match = address.match(/<([^>]+)>/);
  const email = (match?.[1] ?? address).trim();
  return email.split("@")[1]?.toLowerCase() ?? "";
}
