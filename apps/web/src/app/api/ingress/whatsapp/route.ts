/**
 * WhatsApp Cloud API webhook — one URL for the whole instance.
 *
 * Meta delivers every event of a business account to a single callback, and the
 * only thing in the payload that says which workspace it belongs to is
 * `metadata.phone_number_id`. The workspace is therefore resolved from that id,
 * exactly as an inbound email is resolved from its recipient mailbox.
 *
 * GET is the subscription handshake; POST is the events.
 *
 * Two properties of this route are not stylistic:
 *
 *  - **the raw body is read before anything else.** The signature covers the
 *    bytes Meta sent. Parsing then re-serialising changes key order and
 *    whitespace, and the signature stops matching for reasons that look like a
 *    wrong secret.
 *  - **it answers 200 even on rejection.** Meta retries until it gets a 2xx,
 *    and retrying a message we deliberately refused would retry it for days.
 *    The outcome is in the body for whoever debugs; the status says "received".
 */
import { NextResponse, type NextRequest } from "next/server";
import { onContactMessage, onTicketCreated } from "@openhelpdesk/rules";
import {
  challengeResponse,
  changeValues,
  fetchMedia,
  flushQueued,
  ingestWebhook,
  resolveConfig,
  settingsForPhoneNumberId,
  verifySignature,
  type WebhookEnvelope,
} from "@openhelpdesk/whatsapp";

/**
 * The handshake.
 *
 * The verify token belongs to a workspace, and the handshake carries no
 * `phone_number_id` — so the URL takes the number id as a query parameter,
 * which is what the operator pastes into Meta's console alongside the token.
 * Without it we would have to try every workspace's token against the
 * challenge, which is an oracle we would rather not offer.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const phoneNumberId = params.get("phone_number_id") ?? "";
  const settings = await settingsForPhoneNumberId(phoneNumberId);
  const config = settings ? resolveConfig(settings) : null;
  if (!config) return new NextResponse("not_configured", { status: 404 });

  const challenge = challengeResponse(params, config.verifyToken);
  if (!challenge) return new NextResponse("forbidden", { status: 403 });
  // Echoed verbatim, as text: Meta compares the body byte for byte.
  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();

  let envelope: WebhookEnvelope;
  try {
    envelope = JSON.parse(raw) as WebhookEnvelope;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  /*
   * The signature is per workspace, so the workspace has to be known before it
   * can be checked — and the only way to know it is to read the payload we have
   * not verified yet. That is not a weakness: the id is used solely to look up
   * a secret, and a wrong or forged id finds no workspace and gets a 404. No
   * write happens before the signature passes.
   */
  const values = changeValues(envelope);
  const phoneNumberId = values.find((v) => v.metadata?.phone_number_id)?.metadata
    ?.phone_number_id;
  if (!phoneNumberId) return NextResponse.json({ outcome: "ignored" }, { status: 200 });

  const settings = await settingsForPhoneNumberId(phoneNumberId);
  const config = settings ? resolveConfig(settings) : null;
  if (!config) return new NextResponse("not_configured", { status: 404 });

  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    // 401 and not 200: a bad signature is not an event we received, and Meta
    // retrying it changes nothing. Retries here would hide a rotated secret.
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const results = await ingestWebhook(envelope, (mediaId, token) => fetchMedia(mediaId, token));

  // Ingestion stays pure; orchestration happens here, like the email route.
  for (const result of results) {
    if (result.outcome === "created") {
      await onTicketCreated(result.tenantId, result.ticketId);
    } else if (result.outcome === "appended") {
      await onContactMessage(result.tenantId, result.ticketId);
    }
  }

  /*
   * The customer just wrote, so the 24-hour window is open again — and this is
   * the only moment it opens. Any reply an agent wrote while it was closed is
   * waiting, and it goes now.
   *
   * Here rather than inside the ingest for the same reason as the two hooks
   * above: ingestion writes what arrived, orchestration decides what that
   * causes. And a flush that throws must not turn a received message into a
   * 4xx — Meta would retry the webhook, and the message would be ingested
   * again (deduplicated, but the retry storm is real).
   */
  const flushed: Array<{ ticketId: string; sent: number; failed: number }> = [];
  for (const result of results) {
    if (result.outcome !== "created" && result.outcome !== "appended") continue;
    try {
      const counts = await flushQueued(result.tenantId, result.ticketId);
      if (counts.sent || counts.failed) flushed.push({ ticketId: result.ticketId, ...counts });
    } catch (err) {
      console.error("[whatsapp] failed to flush the queued replies:", err);
    }
  }

  return NextResponse.json({ results, ...(flushed.length ? { flushed } : {}) }, { status: 200 });
}
