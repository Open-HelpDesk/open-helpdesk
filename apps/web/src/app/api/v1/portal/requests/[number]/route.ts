/**
 * /api/v1/portal/requests/{number} — one request and its conversation (MC-02).
 *
 * Access and content both come from `getContactRequest`, the portal's own
 * reader: the requester or a member of a sharing organization, and PUBLIC
 * replies only. Internal notes are excluded by that query — they are not
 * filtered out of a wider result here, because a filter is something a later
 * change can forget.
 *
 * A request somebody may not see answers 404, not 403: "this is not yours" and
 * "this does not exist" have to be the same answer, or the numbers become a way
 * to count a workspace's tickets.
 */
import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { getContactRequest } from "@/lib/portal-data";
import {
  serializePortalMessage,
  serializePortalRequestDetail,
  withPortalApi,
} from "@/lib/portal-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  return withPortalApi(request, async ({ tenant, contact }) => {
    const { number } = await params;
    const n = Number(number);
    if (!Number.isInteger(n) || n <= 0) {
      return apiError(404, "not_found", "No request with that number.");
    }

    const found = await getContactRequest(tenant.id, contact.id, n);
    if (!found) return apiError(404, "not_found", "No request with that number.");

    const messages = found.messages.map((m) =>
      serializePortalMessage(
        m,
        m.authorType === "agent" && m.authorId
          ? (found.agentsById.get(m.authorId) ?? null)
          : m.authorType === "contact"
            ? (found.requester?.name ?? null)
            : null,
        (found.attachmentsByMessage.get(m.id) ?? []).map((a) => ({
          id: a.id,
          filename: a.filename,
          sizeBytes: a.sizeBytes,
        })),
      ),
    );
    return apiJson(serializePortalRequestDetail(found.ticket, messages));
  });
}
