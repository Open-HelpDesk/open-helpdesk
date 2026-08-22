/**
 * Brevo inbound webhook ("Inbound parsing", ST-03).
 * URL to configure at Brevo: https://{slug}.{domain}/api/ingress/brevo?secret=…
 * Brevo does not sign its inbound webhooks: the secret in the URL is authoritative.
 * Always 200 on an understood payload: a 5xx would be replayed in a loop.
 */
import { ingressAuthorized } from "@/lib/ingress-auth";
import { NextResponse, type NextRequest } from "next/server";
import { ingestEmail, parseBrevoInbound } from "@openhelpdesk/mail";
import { onContactMessage, onTicketCreated } from "@openhelpdesk/rules";

export async function POST(request: NextRequest) {
  if (!ingressAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const emails = parseBrevoInbound(body);
  const outcomes: string[] = [];
  for (const email of emails) {
    const result = await ingestEmail(email);
    if (result.outcome === "created") await onTicketCreated(result.tenantId, result.ticketId);
    if (result.outcome === "appended") await onContactMessage(result.tenantId, result.ticketId);
    outcomes.push(result.outcome);
  }
  return NextResponse.json({ received: emails.length, outcomes });
}
