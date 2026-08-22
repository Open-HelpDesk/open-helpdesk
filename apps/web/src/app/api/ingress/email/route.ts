/**
 * Inbound email webhook — receives a normalized InboundEmail (JSON).
 * Provider-format adapters (Resend, SES) will normalize to this contract.
 * Protected by the x-ingress-secret header (MAIL_INGRESS_SECRET).
 */
import { ingressAuthorized } from "@/lib/ingress-auth";
import { NextResponse, type NextRequest } from "next/server";
import { ingestEmail, type InboundEmail } from "@openhelpdesk/mail";
import { onContactMessage, onTicketCreated } from "@openhelpdesk/rules";

export async function POST(request: NextRequest) {
  if (!ingressAuthorized(request)) {
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

  // Ingestion stays pure; orchestration (triggers then SLA) happens here.
  if (result.outcome === "created") {
    await onTicketCreated(result.tenantId, result.ticketId);
  } else if (result.outcome === "appended") {
    await onContactMessage(result.tenantId, result.ticketId);
  }

  const status = result.outcome === "rejected" ? 202 : 201;
  return NextResponse.json(result, { status });
}
