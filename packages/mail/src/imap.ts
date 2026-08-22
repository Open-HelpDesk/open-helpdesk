/**
 * IMAP reception (ST-03, "kind: imap" addresses) — the poller picks up the unread
 * messages of every connected mailbox, normalizes them into InboundEmail and ingests them.
 *
 * Business orchestration (triggers, SLA) stays with the caller: this module cannot
 * import @openhelpdesk/rules (which already imports this package). The worker calls
 * onTicketCreated / onContactMessage back from the results returned.
 *
 * imapflow and mailparser are imported lazily: the web app never bundles these
 * dependencies on its rendering paths.
 *
 * The `detail` and `error` strings below reach the user (the "Test" button of a
 * mailbox, the ST-01 diagnostics card, the mailbox sync error). They stay in
 * English: a package has no access to the i18n dictionaries (apps/web/src/i18n).
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

/** Connection test (the "Test" button of ST-03): opens INBOX and counts the messages. */
export async function verifyImapMailbox(
  row: MailboxRow,
): Promise<{ ok: boolean; detail: string }> {
  const config = imapConfigOf(row);
  if (!config) {
    return {
      ok: false,
      detail: "Incomplete connection: host, username and password are all required.",
    };
  }
  try {
    const client = await connect(config);
    const mailbox = await client.mailboxOpen("INBOX");
    await client.logout();
    return {
      ok: true,
      detail: `Connection established on ${config.host}:${config.port} — ${mailbox.exists} message(s) in INBOX.`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Raw MIME → normalized InboundEmail. Routing forces the mailbox address. */
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
  // Lowercased headers for the detection of automatic messages.
  const headers: Record<string, string> = {};
  for (const { key, line } of parsed.headerLines ?? []) {
    const colon = line.indexOf(":");
    if (colon > 0) headers[key.toLowerCase()] = line.slice(colon + 1).trim();
  }

  return {
    // The email landed in THIS mailbox: that is what routes, not the To header
    // (mailing lists, Bcc and aliases often rewrite the To).
    to: [mailboxAddress],
    from: { address: fromAddress, name: parsed.from?.value?.[0]?.name || undefined },
    subject: parsed.subject ?? "",
    text: parsed.text ?? undefined,
    html: typeof parsed.html === "string" ? parsed.html : undefined,
    messageId: parsed.messageId ?? undefined,
    inReplyTo: parsed.inReplyTo ?? undefined,
    references,
    headers,
  };
}

/** Picks up one mailbox: unread messages → ingestion → marked as read. */
export async function pollImapMailbox(row: MailboxRow): Promise<ImapPollResult> {
  const base: ImapPollResult = { mailboxId: row.id, address: row.address, fetched: 0, results: [] };
  const config = imapConfigOf(row);
  if (!config) {
    return { ...base, error: "Incomplete connection (missing host, username or password)." };
  }

  try {
    const client = await connect(config);
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Collect first (no other command while iterating over the fetch).
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
        // Marked as read even when unusable: we do not reprocess an empty message forever.
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

/** Every IMAP mailbox configured on the instance (called by the worker). */
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
