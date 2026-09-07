/**
 * /api/v1/portal/requests — a customer's own requests (MC-01), and new ones (MC-03).
 *
 * `scope=mine` is the customer's requests; `scope=organization` is their
 * company's, and only when that company has ticket sharing turned on. Both come
 * from the same query the web portal reads (lib/portal-data.ts), so the app and
 * the portal cannot disagree about what someone is allowed to see.
 *
 * No cursor here, unlike the agent collections: the underlying query returns the
 * fifty most recently updated requests, which is the list the screen draws.
 * `next_cursor` is present and always null so a client that pages generically
 * stops after one round rather than looping.
 */
import type { NextRequest } from "next/server";
import { apiError, apiJson, apiList, isMultipart, readJson, readMultipart } from "@/lib/api";
import { listContactRequests } from "@/lib/portal-data";
import {
  refuseWhenSuspended,
  serializePortalRequest,
  serializePortalRequestDetail,
  withPortalApi,
} from "@/lib/portal-api";
import { createPortalRequest } from "@/lib/portal-write";

const PRIORITIES = ["low", "normal", "high"] as const;

export async function GET(request: NextRequest) {
  return withPortalApi(request, async ({ tenant, contact }) => {
    const raw = request.nextUrl.searchParams.get("scope") ?? "mine";
    if (raw !== "mine" && raw !== "organization") {
      return apiError(400, "invalid_scope", 'Scope must be "mine" or "organization".');
    }
    const rows = await listContactRequests(tenant.id, contact.id, raw);
    return apiList(rows.map(serializePortalRequest), null);
  });
}

export async function POST(request: NextRequest) {
  return withPortalApi(request, async ({ tenant, contact }) => {
    const suspended = refuseWhenSuspended(tenant);
    if (suspended) return suspended;

    /*
     * Multipart when the customer attached something — MC-03 draws the control,
     * and a screenshot is often the whole report. JSON otherwise.
     */
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

    const subject = String(body.subject ?? "").trim();
    const text = String(body.body ?? "").trim();
    if (!subject || !text) {
      return apiError(400, "invalid_body", "Provide a subject and a body.");
    }
    /*
     * "Urgency" is the customer's word and it stops at high: a form on which
     * anyone can declare their own request urgent-above-all teaches agents to
     * ignore the field. Mapping to the internal priority is the portal's rule,
     * kept identical here.
     */
    const urgency = body.urgency;
    if (urgency !== undefined && !PRIORITIES.includes(urgency as (typeof PRIORITIES)[number])) {
      return apiError(400, "invalid_urgency", `Urgency must be one of: ${PRIORITIES.join(", ")}.`);
    }

    const { ticket } = await createPortalRequest({
      tenantId: tenant.id,
      contact,
      subject: subject.slice(0, 500),
      body: text,
      priority: (urgency as (typeof PRIORITIES)[number]) ?? "normal",
      // The type is a label agents read, translated by whoever asks. The app
      // sends none: it has no request-type picker in the prototype (MC-03).
      type: null,
      files,
    });
    return apiJson(serializePortalRequestDetail(ticket, []), 201);
  });
}
