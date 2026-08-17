/**
 * Webhook email entrant — reçoit un InboundEmail normalisé (JSON).
 * Les adaptateurs de format fournisseur (Resend, SES) normaliseront vers ce contrat.
 * Protégé par en-tête x-ingress-secret (MAIL_INGRESS_SECRET).
 */
import { NextResponse, type NextRequest } from "next/server";
import { ingestEmail, type InboundEmail } from "@openhelpdesk/mail";
import { onContactMessage, onTicketCreated } from "@openhelpdesk/rules";

export async function POST(request: NextRequest) {
  const secret = process.env.MAIL_INGRESS_SECRET ?? "dev-ingress-secret";
  const provided =
    request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-ingress-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: InboundEmail;
  try {
    payload = (await request.json()) as InboundEmail;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(payload.to) || !payload.from?.address || typeof payload.subject !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 422 });
  }

  const result = await ingestEmail(payload);

  // L'ingestion reste pure ; l'orchestration (triggers puis SLA) se fait ici.
  if (result.outcome === "created") {
    await onTicketCreated(result.tenantId, result.ticketId);
  } else if (result.outcome === "appended") {
    await onContactMessage(result.tenantId, result.ticketId);
  }

  const status = result.outcome === "rejected" ? 202 : 201;
  return NextResponse.json(result, { status });
}
