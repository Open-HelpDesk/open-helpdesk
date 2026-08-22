/**
 * Inbound email → ticket pipeline (key journey #2).
 *
 * 1. Resolution of the recipient mailbox → tenant (app.mailboxes).
 * 2. Loop guard and blocked senders.
 * 3. Contact found or created, attached to the organization by domain.
 * 4. Threading: In-Reply-To/References ↔ email_meta, else the [#N] number in the subject.
 * 5. Append to the thread (resolved → reopened; closed → follow-up ticket) or creation.
 */
import {
  contactOrganizations,
  contacts,
  db,
  mailboxes,
  nextTicketNumber,
  organizations,
  rejectedEmails,
  ticketMessages,
  tickets,
} from "@openhelpdesk/db";
import { and, arrayContains, desc, eq, inArray, sql } from "drizzle-orm";
import type { InboundEmail, IngestResult } from "./types";

const REOPEN_FROM = new Set(["waiting", "on_hold", "resolved"]);

/** Technical senders: a ticket would serve no purpose, nobody reads them. */
const SYSTEM_SENDERS = /^(mailer-daemon|postmaster|bounces?|bounce-|nobody)[@+-]/i;

/**
 * Discards messages emitted by a machine: delivery failure reports and automatic
 * out-of-office replies. Without this guard rail, our acknowledgement of receipt
 * and the correspondent's auto-responder answer each other in a loop.
 */
function automaticKind(mail: InboundEmail): "bounce" | "auto_reply" | null {
  const h = mail.headers ?? {};
  const contentType = h["content-type"] ?? "";
  if (
    SYSTEM_SENDERS.test(mail.from.address) ||
    /report-type=["']?delivery-status/i.test(contentType) ||
    h["x-failed-recipients"]
  ) {
    return "bounce";
  }
  // RFC 3834: anything but "no" designates an automatically generated message.
  const autoSubmitted = (h["auto-submitted"] ?? "").trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") {
    return autoSubmitted.startsWith("auto-replied") ? "auto_reply" : "bounce";
  }
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-vacation-response"]) return "auto_reply";
  if ((h["precedence"] ?? "").trim().toLowerCase() === "auto_reply") return "auto_reply";
  return null;
}

/**
 * Antispam verdict of the provider (SpamAssassin and compatible). We do not compute
 * a score ourselves: we trust the header set upstream.
 */
function spamVerdict(mail: InboundEmail): { score: string } | null {
  const h = mail.headers ?? {};
  const flagged = /^yes/i.test(h["x-spam-flag"] ?? "") || /^yes/i.test(h["x-spam"] ?? "");
  const raw = h["x-spam-score"] ?? h["x-spam-status"] ?? h["x-rspamd-score"] ?? "";
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  const score = match ? Number(match[0].replace(",", ".")) : null;

  if (score !== null && (flagged || score >= 5)) {
    // Decimal point and English wording: this verdict is stored in the ST-03 rejected
    // log and displayed as stored. A package reaches neither the tenant's language nor
    // the i18n dictionaries (apps/web/src/i18n), so a localized form would lie.
    return { score: `score ${score.toFixed(1)}` };
  }
  return flagged ? { score: "flagged by the provider" } : null;
}

/** Records a rejection in the ST-03 log (never blocking for ingestion). */
async function logRejection(
  tenantId: string,
  fromAddress: string,
  subject: string,
  reason: "loop" | "blocked_sender" | "empty" | "spam" | "bounce" | "auto_reply",
  detail?: string,
): Promise<void> {
  try {
    await db.insert(rejectedEmails).values({
      tenantId,
      // English placeholder: written once, displayed as stored — a package has no
      // access to the i18n dictionaries (apps/web/src/i18n).
      fromAddress: fromAddress || "(unknown sender)",
      subject: subject.slice(0, 300) || null,
      reason,
      detail: detail?.slice(0, 120) ?? null,
    });
  } catch (err) {
    console.error("[mail] could not log the rejection:", err);
  }
}

export async function ingestEmail(mail: InboundEmail): Promise<IngestResult> {
  const recipientAddresses = mail.to.map((a) => a.toLowerCase().trim());
  const fromAddress = mail.from.address.toLowerCase().trim();
  const bodyText = (mail.text ?? "").trim();

  // 1. Mailbox → tenant (resolved first: the rejections below are logged per tenant)
  const [mailbox] = await db
    .select()
    .from(mailboxes)
    .where(inArray(mailboxes.address, recipientAddresses));
  if (!mailbox) return { outcome: "rejected", reason: "unknown_mailbox" };
  const tenantId = mailbox.tenantId;

  if (!fromAddress || (!bodyText && !mail.html)) {
    await logRejection(tenantId, fromAddress, mail.subject, "empty");
    return { outcome: "rejected", reason: "empty" };
  }

  // 2. Loop guard: the sender is one of the product's mailboxes
  const [loop] = await db.select().from(mailboxes).where(eq(mailboxes.address, fromAddress));
  if (loop) {
    await logRejection(tenantId, fromAddress, mail.subject, "loop");
    return { outcome: "rejected", reason: "loop" };
  }

  // 2b. Automatic messages: delivery failures and out-of-office replies
  const automatic = automaticKind(mail);
  if (automatic) {
    await logRejection(tenantId, fromAddress, mail.subject, automatic);
    return { outcome: "rejected", reason: automatic };
  }

  // 2c. Antispam verdict set upstream by the provider
  const spam = spamVerdict(mail);
  if (spam) {
    await logRejection(tenantId, fromAddress, mail.subject, "spam", spam.score);
    return { outcome: "rejected", reason: "spam" };
  }

  // The first email received proves the routing works (forwarding verified — ST-03).
  if (!mailbox.verified) {
    await db.update(mailboxes).set({ verified: true }).where(eq(mailboxes.id, mailbox.id));
  }

  // 3. Contact (+ organization by domain)
  let [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, fromAddress)));
  if (contact?.blocked) {
    await logRejection(tenantId, fromAddress, mail.subject, "blocked_sender");
    return { outcome: "rejected", reason: "blocked_sender" };
  }

  const domain = fromAddress.split("@")[1] ?? "";
  const [orgByDomain] = domain
    ? await db
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.tenantId, tenantId),
            arrayContains(organizations.emailDomains, [domain]),
          ),
        )
    : [];

  if (!contact) {
    [contact] = await db
      .insert(contacts)
      .values({ tenantId, email: fromAddress, name: mail.from.name ?? null })
      .returning();
    if (contact && orgByDomain) {
      await db.insert(contactOrganizations).values({
        tenantId,
        contactId: contact.id,
        organizationId: orgByDomain.id,
      });
    }
  }

  const emailMeta = {
    messageId: mail.messageId ?? null,
    inReplyTo: mail.inReplyTo ?? null,
    to: recipientAddresses,
  };

  // 4. Threading — a) RFC 5322 headers
  let ticket: typeof tickets.$inferSelect | undefined;
  const refIds = [mail.inReplyTo, ...(mail.references ?? [])].filter(
    (r): r is string => Boolean(r),
  );
  if (refIds.length > 0) {
    const [threadMsg] = await db
      .select({ ticketId: ticketMessages.ticketId })
      .from(ticketMessages)
      .where(
        and(
          eq(ticketMessages.tenantId, tenantId),
          inArray(sql`${ticketMessages.emailMeta}->>'messageId'`, refIds),
        ),
      )
      .orderBy(desc(ticketMessages.createdAt))
      .limit(1);
    if (threadMsg) {
      [ticket] = await db.select().from(tickets).where(eq(tickets.id, threadMsg.ticketId));
    }
  }

  // 4b. Fallback: ticket number in the subject — "[#4821]" or "#4821"
  if (!ticket) {
    const numberMatch = mail.subject.match(/#(\d{1,10})\b/);
    if (numberMatch) {
      [ticket] = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.tenantId, tenantId), eq(tickets.number, Number(numberMatch[1]))));
    }
  }

  // 5a. Append to the existing thread
  if (ticket && !ticket.mergedIntoId && ticket.status !== "closed") {
    await db.insert(ticketMessages).values({
      tenantId,
      ticketId: ticket.id,
      kind: "public_reply",
      authorType: "contact",
      authorId: contact!.id,
      bodyText: bodyText || null,
      bodyHtml: mail.html ?? null,
      source: "email",
      emailMeta,
    });
    const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
    if (REOPEN_FROM.has(ticket.status)) {
      patch.status = "open";
      patch.resolvedAt = null;
    }
    await db.update(tickets).set(patch).where(eq(tickets.id, ticket.id));
    return { outcome: "appended", ticketId: ticket.id, number: ticket.number, tenantId };
  }

  // 5b. Closed ticket → follow-up ticket; otherwise a new ticket
  const number = await nextTicketNumber(tenantId);
  const [created] = await db
    .insert(tickets)
    .values({
      tenantId,
      number,
      // Same rule as above: the fallback subject is persisted, so it stays in
      // English — a package cannot reach the i18n dictionaries.
      subject: mail.subject.trim() || "(no subject)",
      status: "new",
      channel: "email",
      requesterId: contact!.id,
      organizationId: orgByDomain?.id ?? null,
      teamId: mailbox.defaultTeamId ?? null,
    })
    .returning();

  await db.insert(ticketMessages).values({
    tenantId,
    ticketId: created!.id,
    kind: "public_reply",
    authorType: "contact",
    authorId: contact!.id,
    bodyText: bodyText || null,
    bodyHtml: mail.html ?? null,
    source: "email",
    emailMeta,
  });

  return { outcome: "created", ticketId: created!.id, number, tenantId };
}
