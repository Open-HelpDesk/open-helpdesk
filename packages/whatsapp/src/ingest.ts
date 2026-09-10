/**
 * Inbound WhatsApp → ticket.
 *
 * Mirrors the inbound email pipeline (@openhelpdesk/mail) on purpose: resolve
 * the workspace, guard, resolve the contact, thread, append or create. A second
 * shape for the same job would drift, and the drift would land in whichever
 * channel is read less often.
 *
 * Four things are genuinely different from email, and each one is a decision
 * rather than an adaptation:
 *
 *  1. **Deduplication is mandatory, not defensive.** Meta retries a webhook
 *     until it receives a 200. Without a dedupe key, a retry posts the
 *     customer's message into the thread twice — and a retry is the normal
 *     case, not the edge case. Hence `whatsapp_messages.wamid`, unique per
 *     workspace.
 *  2. **There is no subject.** An email carries one; a WhatsApp message does
 *     not. We take the first words and let the assistant's triage set the real
 *     category — a subject invented from nothing is worse than a truncated one.
 *  3. **Messages arrive in bursts.** "hello", "I have a problem", "with my
 *     order" is one request in three messages. Grouping is decided by
 *     `activeTicketId` rather than by a time window: a window would either
 *     split a slow typist or merge two unrelated requests, and neither failure
 *     is recoverable afterwards.
 *  4. **Identity is a phone number.** Matching on `contacts.phone` would be a
 *     guess — formats differ and two contacts can share a number. The mapping
 *     in `whatsapp_conversations` is a fact we wrote, not an inference.
 */
import { and, eq } from "drizzle-orm";
import {
  contacts,
  db,
  nextTicketNumber,
  ticketMessages,
  tickets,
  whatsappConversations,
  whatsappMessages,
} from "@openhelpdesk/db";
import { settingsForPhoneNumberId } from "./settings";
import type {
  ChangeValue,
  IngestOutcome,
  InboundMessage,
  WebhookEnvelope,
} from "./types";

/** Statuses a further message reopens, exactly as inbound email does. */
const REOPEN_FROM = new Set(["waiting", "on_hold", "resolved"]);

/** Kinds we turn into a message. The rest is ignored, and named as ignored. */
const TEXTUAL = new Set(["text", "button", "interactive"]);
const MEDIA = new Set(["image", "document", "audio", "video", "sticker"]);

/**
 * The words a message contributes to the thread.
 *
 * A tap on a button or a list item has no `text.body`: its title is the only
 * thing the customer "said", and dropping it would leave a message that reads
 * as empty when the customer feels they answered.
 */
function textOf(m: InboundMessage): string {
  if (m.text?.body) return m.text.body.trim();
  if (m.button?.text) return m.button.text.trim();
  const reply = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
  if (reply) return reply.trim();
  const caption =
    m.image?.caption ?? m.document?.caption ?? m.video?.caption ?? m.audio?.caption;
  return (caption ?? "").trim();
}

/** The media reference of a message, whatever kind it is. */
function mediaOf(m: InboundMessage): { id: string; mime: string | null; filename: string } | null {
  const pairs: Array<[string, { id?: string; mime_type?: string; filename?: string } | undefined]> =
    [
      ["image", m.image],
      ["document", m.document],
      ["audio", m.audio],
      ["video", m.video],
      ["sticker", m.sticker],
    ];
  for (const [kind, ref] of pairs) {
    if (ref?.id) {
      return {
        id: ref.id,
        mime: ref.mime_type ?? null,
        // Meta only names documents. The others get a name derived from their
        // kind and id, because an attachment called "" is unopenable.
        filename: ref.filename ?? `${kind}-${ref.id}`,
      };
    }
  }
  return null;
}

/** A subject from the first words. Persisted, so it stays in English. */
function subjectFrom(text: string): string {
  const line = text.split("\n")[0]?.trim() ?? "";
  if (!line) return "WhatsApp message";
  return line.length > 78 ? `${line.slice(0, 75)}…` : line;
}

/**
 * Flattens the envelope into the change values we care about.
 *
 * Meta nests messages three levels deep and may batch several entries in one
 * call. Treating the payload as "one message" is the mistake that loses the
 * second message of a burst.
 */
export function changeValues(envelope: WebhookEnvelope): ChangeValue[] {
  const out: ChangeValue[] = [];
  for (const entry of envelope.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.value) out.push(change.value);
    }
  }
  return out;
}

/**
 * Ingests one webhook payload, and returns one outcome per message.
 *
 * `fetchMedia` is injected rather than imported: downloading media needs the
 * access token and a network call to Meta, and a pipeline that reaches out on
 * its own cannot be tested without a network. The web route passes the real
 * one.
 */
export async function ingestWebhook(
  envelope: WebhookEnvelope,
  fetchMedia?: (mediaId: string, accessToken: string) => Promise<Uint8Array | null>,
): Promise<IngestOutcome[]> {
  const results: IngestOutcome[] = [];
  for (const value of changeValues(envelope)) {
    const phoneNumberId = value.metadata?.phone_number_id ?? "";
    const messages = value.messages ?? [];

    // A delivery or read receipt. Recorded on the outbound row when it says
    // something went wrong, ignored otherwise — nobody needs a ticket because
    // a message was read.
    if (messages.length === 0) {
      await recordStatuses(phoneNumberId, value);
      results.push({ outcome: "ignored", reason: "status_only" });
      continue;
    }

    for (const message of messages) {
      results.push(await ingestOne(phoneNumberId, value, message, fetchMedia));
    }
  }
  return results;
}

async function recordStatuses(phoneNumberId: string, value: ChangeValue): Promise<void> {
  const failures = (value.statuses ?? []).filter((s) => s.status === "failed");
  if (failures.length === 0) return;
  const settings = await settingsForPhoneNumberId(phoneNumberId);
  if (!settings) return;
  for (const f of failures) {
    if (!f.id) continue;
    const reason = f.errors?.[0];
    await db
      .update(whatsappMessages)
      .set({
        status: "failed",
        error: reason ? `${reason.code ?? ""} ${reason.title ?? reason.message ?? ""}`.trim() : "failed",
      })
      .where(
        and(
          eq(whatsappMessages.tenantId, settings.tenantId),
          eq(whatsappMessages.wamid, f.id),
        ),
      );
  }
}

async function ingestOne(
  phoneNumberId: string,
  value: ChangeValue,
  message: InboundMessage,
  fetchMedia?: (mediaId: string, accessToken: string) => Promise<Uint8Array | null>,
): Promise<IngestOutcome> {
  // 1. phone_number_id → workspace. The WhatsApp equivalent of a mailbox.
  const settings = await settingsForPhoneNumberId(phoneNumberId);
  if (!settings) return { outcome: "rejected", reason: "unknown_number" };
  if (!settings.active) return { outcome: "rejected", reason: "inactive" };
  const tenantId = settings.tenantId;

  const type = message.type ?? "text";
  if (!TEXTUAL.has(type) && !MEDIA.has(type)) {
    return { outcome: "ignored", reason: "unsupported_type" };
  }

  const text = textOf(message);
  const media = mediaOf(message);
  if (!text && !media) return { outcome: "ignored", reason: "empty" };

  // 2. Deduplication, BEFORE any write. The insert itself is the guard: the
  //    unique index makes a concurrent retry fail rather than duplicate, which
  //    a "select then insert" would not.
  const claimed = await db
    .insert(whatsappMessages)
    .values({ tenantId, wamid: message.id, direction: "inbound" })
    .onConflictDoNothing()
    .returning({ id: whatsappMessages.id });
  if (claimed.length === 0) return { outcome: "ignored", reason: "duplicate" };

  // 3. Conversation → contact. Created on first contact, with the WhatsApp
  //    profile name when Meta sends it.
  const waId = message.from;
  const profileName =
    value.contacts?.find((c) => c.wa_id === waId)?.profile?.name ?? null;

  let [conversation] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(eq(whatsappConversations.tenantId, tenantId), eq(whatsappConversations.waId, waId)),
    );

  if (!conversation) {
    /*
     * A contact needs an email in this product, and WhatsApp gives none. The
     * address is derived from the number, deterministically, so the same person
     * writing again lands on the same contact even if this conversation row is
     * ever rebuilt. The real number goes in `phone`, which is what an agent
     * calls back.
     */
    const [contact] = await db
      .insert(contacts)
      .values({
        tenantId,
        email: `${waId}@whatsapp.invalid`,
        name: profileName,
        phone: `+${waId}`,
      })
      .returning();
    [conversation] = await db
      .insert(whatsappConversations)
      .values({ tenantId, waId, contactId: contact!.id, profileName })
      .returning();
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, conversation!.contactId)));
  if (contact?.blocked) return { outcome: "rejected", reason: "blocked_sender" };

  // 4. The window opens (or reopens) now. Written before the ticket work so a
  //    failure later still leaves the window correct — an agent seeing "closed"
  //    on an open window would not send.
  await db
    .update(whatsappConversations)
    .set({
      lastInboundAt: new Date(),
      profileName: profileName ?? conversation!.profileName,
      updatedAt: new Date(),
    })
    .where(eq(whatsappConversations.id, conversation!.id));

  const files = media && fetchMedia ? await downloadMedia(media, settings.encryptedSecrets, fetchMedia) : [];

  // 5. Append to the active thread, or open a new one.
  let ticket: typeof tickets.$inferSelect | undefined;
  if (conversation!.activeTicketId) {
    [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, conversation!.activeTicketId)));
  }

  if (ticket && !ticket.mergedIntoId && ticket.status !== "closed") {
    const [appended] = await db
      .insert(ticketMessages)
      .values({
        tenantId,
        ticketId: ticket.id,
        kind: "public_reply",
        authorType: "contact",
        authorId: contact!.id,
        bodyText: text || null,
        source: "whatsapp",
      })
      .returning({ id: ticketMessages.id });
    await attach(tenantId, appended!.id, files);
    await db
      .update(whatsappMessages)
      .set({ ticketId: ticket.id, messageId: appended!.id })
      .where(eq(whatsappMessages.id, claimed[0]!.id));

    const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
    if (REOPEN_FROM.has(ticket.status)) {
      patch.status = "open";
      patch.resolvedAt = null;
    }
    await db.update(tickets).set(patch).where(eq(tickets.id, ticket.id));
    return { outcome: "appended", ticketId: ticket.id, number: ticket.number, tenantId };
  }

  const number = await nextTicketNumber(tenantId);
  const [created] = await db
    .insert(tickets)
    .values({
      tenantId,
      number,
      subject: subjectFrom(text || media?.filename || ""),
      status: "new",
      channel: "whatsapp",
      requesterId: contact!.id,
      teamId: settings.defaultTeamId ?? null,
    })
    .returning();

  const [first] = await db
    .insert(ticketMessages)
    .values({
      tenantId,
      ticketId: created!.id,
      kind: "public_reply",
      authorType: "contact",
      authorId: contact!.id,
      bodyText: text || null,
      source: "whatsapp",
    })
    .returning({ id: ticketMessages.id });
  await attach(tenantId, first!.id, files);

  await db
    .update(whatsappConversations)
    .set({ activeTicketId: created!.id, updatedAt: new Date() })
    .where(eq(whatsappConversations.id, conversation!.id));
  await db
    .update(whatsappMessages)
    .set({ ticketId: created!.id, messageId: first!.id })
    .where(eq(whatsappMessages.id, claimed[0]!.id));

  return { outcome: "created", ticketId: created!.id, number, tenantId };
}

type Downloaded = { filename: string; contentType: string | null; content: Uint8Array };

async function downloadMedia(
  media: { id: string; mime: string | null; filename: string },
  encryptedSecrets: string | null,
  fetchMedia: (mediaId: string, accessToken: string) => Promise<Uint8Array | null>,
): Promise<Downloaded[]> {
  try {
    const { decryptSecrets } = await import("@openhelpdesk/crypto");
    const token = decryptSecrets(encryptedSecrets)["accessToken"] ?? "";
    if (!token) return [];
    const content = await fetchMedia(media.id, token);
    return content ? [{ filename: media.filename, contentType: media.mime, content }] : [];
  } catch (err) {
    // A photo that fails to download must not lose the message it came with.
    console.error("[whatsapp] media download failed:", err);
    return [];
  }
}

async function attach(tenantId: string, messageId: string, files: Downloaded[]): Promise<void> {
  if (files.length === 0) return;
  try {
    // Imported here for the same reason the mail pipeline does it: the storage
    // package pulls in the AWS SDK, and this module is reachable from paths
    // that have no business loading it.
    const { storeAttachments } = await import("@openhelpdesk/storage");
    await storeAttachments(tenantId, messageId, files);
  } catch (err) {
    console.error("[whatsapp] attachment could not be stored:", err);
  }
}
