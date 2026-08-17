/**
 * Pipeline email entrant → ticket (parcours clé n°2, specs/01 § 8).
 *
 * 1. Résolution de la boîte destinataire → tenant (app.mailboxes).
 * 2. Anti-boucle et expéditeurs bloqués.
 * 3. Contact trouvé ou créé, rattaché à l'organisation par domaine.
 * 4. Threading : In-Reply-To/References ↔ email_meta, sinon numéro [#N] dans le sujet.
 * 5. Ajout au fil (résolu → rouvert ; clos → ticket de suivi) ou création.
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

/** Expéditeurs techniques : un ticket n'y servirait à rien, personne ne les lit. */
const SYSTEM_SENDERS = /^(mailer-daemon|postmaster|bounces?|bounce-|nobody)[@+-]/i;

/**
 * Écarte les messages émis par une machine : rapports de non-délivrance et
 * réponses automatiques d'absence. Sans ce garde-fou, notre accusé de réception
 * et l'auto-répondeur du correspondant se répondent en boucle.
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
  // RFC 3834 : tout sauf « no » désigne un message généré automatiquement.
  const autoSubmitted = (h["auto-submitted"] ?? "").trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") {
    return autoSubmitted.startsWith("auto-replied") ? "auto_reply" : "bounce";
  }
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-vacation-response"]) return "auto_reply";
  if ((h["precedence"] ?? "").trim().toLowerCase() === "auto_reply") return "auto_reply";
  return null;
}

/**
 * Verdict antispam du fournisseur (SpamAssassin et compatibles). Nous ne calculons
 * pas de score nous-mêmes : nous faisons confiance à l'en-tête posé en amont.
 */
function spamVerdict(mail: InboundEmail): { score: string } | null {
  const h = mail.headers ?? {};
  const flagged = /^yes/i.test(h["x-spam-flag"] ?? "") || /^yes/i.test(h["x-spam"] ?? "");
  const raw = h["x-spam-score"] ?? h["x-spam-status"] ?? h["x-rspamd-score"] ?? "";
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  const score = match ? Number(match[0].replace(",", ".")) : null;

  if (score !== null && (flagged || score >= 5)) {
    return { score: `score ${score.toFixed(1).replace(".", ",")}` };
  }
  return flagged ? { score: "signalé par le fournisseur" } : null;
}

/** Trace un rejet dans le journal de ST-03 (jamais bloquant pour l'ingestion). */
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
      fromAddress: fromAddress || "(expéditeur inconnu)",
      subject: subject.slice(0, 300) || null,
      reason,
      detail: detail?.slice(0, 120) ?? null,
    });
  } catch (err) {
    console.error("[mail] journalisation du rejet impossible :", err);
  }
}

export async function ingestEmail(mail: InboundEmail): Promise<IngestResult> {
  const recipientAddresses = mail.to.map((a) => a.toLowerCase().trim());
  const fromAddress = mail.from.address.toLowerCase().trim();
  const bodyText = (mail.text ?? "").trim();

  // 1. Boîte → tenant (résolue d'abord : les rejets suivants sont journalisés par tenant)
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

  // 2. Anti-boucle : l'expéditeur est une boîte du produit
  const [loop] = await db.select().from(mailboxes).where(eq(mailboxes.address, fromAddress));
  if (loop) {
    await logRejection(tenantId, fromAddress, mail.subject, "loop");
    return { outcome: "rejected", reason: "loop" };
  }

  // 2b. Messages automatiques : non-délivrance et réponses d'absence
  const automatic = automaticKind(mail);
  if (automatic) {
    await logRejection(tenantId, fromAddress, mail.subject, automatic);
    return { outcome: "rejected", reason: automatic };
  }

  // 2c. Verdict antispam posé par le fournisseur en amont
  const spam = spamVerdict(mail);
  if (spam) {
    await logRejection(tenantId, fromAddress, mail.subject, "spam", spam.score);
    return { outcome: "rejected", reason: "spam" };
  }

  // Le premier email reçu prouve que le routage fonctionne (transfert vérifié — ST-03).
  if (!mailbox.verified) {
    await db.update(mailboxes).set({ verified: true }).where(eq(mailboxes.id, mailbox.id));
  }

  // 3. Contact (+ organisation par domaine)
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

  // 4. Threading — a) en-têtes RFC 5322
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

  // 4b. Repli : numéro de ticket dans le sujet — « [#4821] » ou « #4821 »
  if (!ticket) {
    const numberMatch = mail.subject.match(/#(\d{1,10})\b/);
    if (numberMatch) {
      [ticket] = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.tenantId, tenantId), eq(tickets.number, Number(numberMatch[1]))));
    }
  }

  // 5a. Ajout au fil existant
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

  // 5b. Ticket clos → ticket de suivi ; sinon nouveau ticket
  const number = await nextTicketNumber(tenantId);
  const [created] = await db
    .insert(tickets)
    .values({
      tenantId,
      number,
      subject: mail.subject.trim() || "(sans objet)",
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
