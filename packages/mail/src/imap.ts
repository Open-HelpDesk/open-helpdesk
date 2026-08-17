/**
 * Réception IMAP (ST-03, adresses « kind: imap ») — le poller relève les messages non
 * lus de chaque boîte connectée, les normalise en InboundEmail et les ingère.
 *
 * L'orchestration métier (triggers, SLA) reste chez l'appelant : ce module ne peut pas
 * importer @openhelpdesk/rules (qui importe déjà ce paquet). Le worker rappelle
 * onTicketCreated / onContactMessage à partir des résultats retournés.
 *
 * imapflow et mailparser sont importés paresseusement : l'app web n'embarque jamais
 * ces dépendances sur ses chemins de rendu.
 */
import { db, mailboxes } from "@openhelpdesk/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { decryptSecrets } from "@openhelpdesk/crypto";
import { ingestEmail } from "./ingest";
import type { InboundEmail, IngestResult } from "./types";

export type MailboxRow = typeof mailboxes.$inferSelect;

export type ImapPollResult = {
  mailboxId: string;
  address: string;
  fetched: number;
  results: IngestResult[];
  error?: string;
};

type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

function imapConfigOf(row: MailboxRow): ImapConfig | null {
  if (row.kind !== "imap" || !row.imapHost || !row.imapUser) return null;
  const secrets = decryptSecrets(row.encryptedSecrets);
  if (!secrets.password) return null;
  return {
    host: row.imapHost,
    port: row.imapPort ?? (row.imapSecure ? 993 : 143),
    secure: row.imapSecure,
    user: row.imapUser,
    password: secrets.password,
  };
}

async function connect(config: ImapConfig) {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false,
    socketTimeout: 30_000,
  });
  await client.connect();
  return client;
}

/** Test de connexion (bouton « Tester » de ST-03) : ouvre INBOX et compte les messages. */
export async function verifyImapMailbox(
  row: MailboxRow,
): Promise<{ ok: boolean; detail: string }> {
  const config = imapConfigOf(row);
  if (!config) {
    return {
      ok: false,
      detail: "Connexion incomplète : hôte, identifiant et mot de passe sont requis.",
    };
  }
  try {
    const client = await connect(config);
    const mailbox = await client.mailboxOpen("INBOX");
    await client.logout();
    return {
      ok: true,
      detail: `Connexion établie sur ${config.host}:${config.port} — ${mailbox.exists} message(s) dans INBOX.`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** MIME brut → InboundEmail normalisé. Le routage force l'adresse de la boîte. */
async function parseSource(source: Buffer, mailboxAddress: string): Promise<InboundEmail | null> {
  const { simpleParser } = await import("mailparser");
  const parsed = await simpleParser(source);
  const fromAddress = parsed.from?.value?.[0]?.address;
  if (!fromAddress) return null;
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : [];
  return {
    // L'email a atterri dans CETTE boîte : c'est elle qui route, pas l'en-tête To
    // (listes de diffusion, Cci et alias réécrivent souvent le To).
    to: [mailboxAddress],
    from: { address: fromAddress, name: parsed.from?.value?.[0]?.name || undefined },
    subject: parsed.subject ?? "",
    text: parsed.text ?? undefined,
    html: typeof parsed.html === "string" ? parsed.html : undefined,
    messageId: parsed.messageId ?? undefined,
    inReplyTo: parsed.inReplyTo ?? undefined,
    references,
  };
}

/** Relève une boîte : messages non lus → ingestion → marqués lus. */
export async function pollImapMailbox(row: MailboxRow): Promise<ImapPollResult> {
  const base: ImapPollResult = { mailboxId: row.id, address: row.address, fetched: 0, results: [] };
  const config = imapConfigOf(row);
  if (!config) {
    return { ...base, error: "Connexion incomplète (hôte, identifiant ou mot de passe manquant)." };
  }

  try {
    const client = await connect(config);
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Collecte d'abord (pas d'autre commande pendant l'itération du fetch).
      const messages: { uid: number; source: Buffer }[] = [];
      for await (const message of client.fetch({ seen: false }, { source: true, uid: true })) {
        if (message.source) messages.push({ uid: message.uid, source: message.source });
      }
      base.fetched = messages.length;

      for (const message of messages) {
        const inbound = await parseSource(message.source, row.address);
        if (inbound) {
          base.results.push(await ingestEmail(inbound));
        }
        // Marqué lu même si inexploitable : on ne retraite pas indéfiniment un message vide.
        await client.messageFlagsAdd({ uid: String(message.uid) }, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();

    await db
      .update(mailboxes)
      .set({ verified: true, lastSyncAt: new Date(), syncError: null })
      .where(eq(mailboxes.id, row.id));
    return base;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db
      .update(mailboxes)
      .set({ lastSyncAt: new Date(), syncError: detail.slice(0, 500) })
      .where(eq(mailboxes.id, row.id));
    return { ...base, error: detail };
  }
}

/** Toutes les boîtes IMAP configurées de l'instance (appelé par le worker). */
export async function pollAllImapMailboxes(): Promise<ImapPollResult[]> {
  const rows = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.kind, "imap"), isNotNull(mailboxes.imapHost)));
  const results: ImapPollResult[] = [];
  for (const row of rows) {
    results.push(await pollImapMailbox(row));
  }
  return results;
}
