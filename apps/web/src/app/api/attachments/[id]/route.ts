/**
 * Attachment download — access: tenant agent, OR portal contact with access to
 * the message's ticket (requester or shared organization).
 */
import { NextResponse, type NextRequest } from "next/server";
import { attachments, db, tickets, ticketMessages } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { apiAgent } from "@/lib/session";
import { getPortalContact } from "@/lib/portal-auth";
import { getContactRequest } from "@/lib/portal-data";
import { getAttachmentBody } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!attachment) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 1. Tenant agent?
  const agentSession = await apiAgent();
  let allowed = agentSession?.tenant.id === attachment.tenantId;

  // 2. Otherwise, portal contact with access to the message's ticket.
  if (!allowed && attachment.messageId) {
    const portalSession = await getPortalContact();
    if (portalSession && portalSession.tenant.id === attachment.tenantId) {
      const [message] = await db
        .select({ ticketId: ticketMessages.ticketId, kind: ticketMessages.kind })
        .from(ticketMessages)
        .where(eq(ticketMessages.id, attachment.messageId));
      if (message && message.kind === "public_reply") {
        const [ticket] = await db
          .select({ number: tickets.number })
          .from(tickets)
          .where(and(eq(tickets.tenantId, attachment.tenantId), eq(tickets.id, message.ticketId)));
        if (ticket) {
          const access = await getContactRequest(
            attachment.tenantId,
            portalSession.contact.id,
            ticket.number,
          );
          allowed = Boolean(access);
        }
      }
    }
  }

  if (!allowed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await getAttachmentBody(attachment.storageKey);
  if (!body) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(body.transformToWebStream(), {
    headers: {
      "content-type": attachment.contentType,
      "content-disposition": `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
      "content-length": String(attachment.sizeBytes),
    },
  });
}
