/**
 * Webhook de réception Mailjet (« Parse API », ST-03).
 * URL à configurer chez Mailjet : https://{slug}.{domaine}/api/ingress/mailjet?secret=…
 * Mailjet ne signe pas la Parse API : le secret dans l'URL fait autorité.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ingestEmail, parseMailjetInbound } from "@openhelpdesk/mail";
import { onContactMessage, onTicketCreated } from "@openhelpdesk/rules";

export async function POST(request: NextRequest) {
  const secret = process.env.MAIL_INGRESS_SECRET ?? "dev-ingress-secret";
  const provided =
    request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-ingress-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const emails = parseMailjetInbound(body);
  const outcomes: string[] = [];
  for (const email of emails) {
    const result = await ingestEmail(email);
    if (result.outcome === "created") await onTicketCreated(result.tenantId, result.ticketId);
    if (result.outcome === "appended") await onContactMessage(result.tenantId, result.ticketId);
    outcomes.push(result.outcome);
  }
  return NextResponse.json({ received: emails.length, outcomes });
}
