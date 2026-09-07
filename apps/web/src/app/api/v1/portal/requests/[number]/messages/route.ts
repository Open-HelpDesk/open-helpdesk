/**
 * /api/v1/portal/requests/{number}/messages — answer on your own request (MC-02).
 *
 * Only the requester may write, which is the rule the web portal applies: a
 * colleague from a sharing organization can READ the company's requests, and
 * letting them answer in someone else's thread is a different decision that
 * nothing in the product has taken yet.
 *
 * The write itself is the portal's (`replyToPortalRequest`): it reopens what was
 * waiting or resolved and runs the rules engine, so an answer typed on a phone
 * lands exactly like one typed in a browser.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, tickets } from "@openhelpdesk/db";
import { apiError, apiJson, isMultipart, readJson, readMultipart } from "@/lib/api";
import {
  refuseWhenSuspended,
  serializePortalMessage,
  withPortalApi,
} from "@/lib/portal-api";
import { replyToPortalRequest } from "@/lib/portal-write";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  return withPortalApi(request, async ({ tenant, contact }) => {
    const suspended = refuseWhenSuspended(tenant);
    if (suspended) return suspended;

    const { number } = await params;
    const n = Number(number);
    if (!Number.isInteger(n) || n <= 0) {
      return apiError(404, "not_found", "No request with that number.");
    }
    // Multipart when the customer attached something to their answer (MC-02).
    let files: File[] = [];
    let body: Record<string, unknown>;
    if (isMultipart(request)) {
      const form = await readMultipart(request);
      if (form instanceof Response) return form;
      body = form.fields;
      files = form.files;
    } else {
      const json = await readJson(request);
      if (json instanceof Response) return json;
      body = json;
    }
    const text = String(body.body ?? "").trim();
    if (!text) return apiError(400, "invalid_body", "Provide the message body.");

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.number, n)));
    // Same answer for "not yours" as for "no such request", and for a deleted
    // one: a customer cannot learn what else this workspace holds.
    if (!ticket || ticket.deletedAt || ticket.requesterId !== contact.id) {
      return apiError(404, "not_found", "No request with that number.");
    }

    const written = await replyToPortalRequest({
      tenantId: tenant.id,
      contact,
      ticket,
      body: text,
      files,
    });
    if (!written) {
      return apiError(500, "internal_error", "The message could not be written.");
    }
    return apiJson(
      serializePortalMessage(
        written.message,
        contact.name,
        written.attachments.map((a) => ({ id: a.id, filename: a.filename, sizeBytes: a.sizeBytes })),
      ),
      201,
    );
  });
}
