/**
 * The customer half of the REST API (MC-xx) — authentication and shapes.
 *
 * Deliberately a namespace of its own (`/api/v1/portal/…`) rather than the same
 * routes with a different credential. The agent endpoints answer "everything
 * this workspace holds"; these answer "the requests this person is party to",
 * and the two differ in every direction that matters — internal notes, other
 * people's tickets, assignees, the workspace's configuration. Sharing a route
 * between them would mean one filter, in one place, standing between a customer
 * and the whole helpdesk. A separate namespace makes the narrow answer the
 * default and the broad one unreachable.
 *
 * The credentials cannot be confused either: a portal token is `ohd_ptl_…` and
 * is resolved here, an agent token is `ohd_app_…` and is resolved in lib/api.ts.
 * Each resolver refuses the other's token by name, so a client that mixes them
 * up gets told what it did.
 */
import { and, eq, isNull } from "drizzle-orm";
import { contacts, db, deviceSessions, tenants, ticketMessages, tickets } from "@openhelpdesk/db";
import { apiError, rateLimit, rateLimitedResponse } from "@/lib/api";
import {
  DEVICE_SESSION_TTL_MS,
  DEVICE_TOKEN_RE,
  PORTAL_TOKEN_RE,
  hashSecret,
  sessionContact,
} from "@/lib/device-auth";
import { readPortalSettings } from "@/lib/portal-config";

export type PortalAuth = {
  tenant: typeof tenants.$inferSelect;
  contact: typeof contacts.$inferSelect;
  /** This device's session — the rate-limit bucket, and what logout revokes. */
  sessionId: string;
};

/**
 * Resolve the customer behind `Authorization: Bearer ohd_ptl_…`.
 *
 * Four things are checked on every call rather than at sign-in, because all
 * four can change while a phone sits in a pocket: the session was revoked or
 * expired, the workspace stopped serving a portal, the contact was blocked.
 * Blocking someone whose app keeps working is not blocking them.
 */
export async function withPortalApi(
  request: Request,
  handler: (auth: PortalAuth) => Promise<Response>,
): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(\S+)$/)?.[1] ?? "";
  if (DEVICE_TOKEN_RE.test(token) || /^ohd_live_/.test(token)) {
    return apiError(
      403,
      "agent_credential",
      "This is an agent credential. The customer endpoints need a session from POST /api/v1/portal/auth/exchange.",
    );
  }
  if (!PORTAL_TOKEN_RE.test(token)) {
    return apiError(401, "unauthorized", "Provide a customer session as a Bearer token.");
  }

  const resolved = await resolvePortalToken(token);
  if (resolved instanceof Response) return resolved;

  const retryAfter = rateLimit(resolved.sessionId);
  if (retryAfter !== null) return rateLimitedResponse(retryAfter);

  try {
    return await handler(resolved);
  } catch (err) {
    console.error("[portal-api] handler error:", err);
    return apiError(500, "internal_error", "Something went wrong handling the request.");
  }
}

/**
 * The customer behind a Bearer token, for a route that ALSO serves cookies.
 *
 * The attachment download is shared with the web portal, so it cannot be
 * wrapped: it tries an agent, then a portal cookie, then this. Silent (null
 * rather than a Response) because the caller owns the refusal it sends.
 */
export async function portalBearerSession(request: Request): Promise<PortalAuth | null> {
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/)?.[1] ?? "";
  if (!PORTAL_TOKEN_RE.test(token)) return null;
  const resolved = await resolvePortalToken(token);
  return resolved instanceof Response ? null : resolved;
}

async function resolvePortalToken(token: string): Promise<PortalAuth | Response> {
  const [session] = await db
    .select()
    .from(deviceSessions)
    .where(and(eq(deviceSessions.hashedToken, hashSecret(token)), isNull(deviceSessions.revokedAt)));
  if (!session || !session.contactId) {
    return apiError(401, "unauthorized", "This session is unknown or has been signed out.");
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return apiError(401, "session_expired", "This session has expired. Sign in again.");
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, session.tenantId));
  if (!tenant) {
    return apiError(401, "unauthorized", "This session is not attached to a workspace.");
  }
  /*
   * A portal that has been switched off answers nothing — the same 404 the web
   * portal serves, so turning it off in the settings turns it off everywhere
   * rather than only where somebody remembered to check.
   *
   * A SUSPENDED workspace is not the same case and is not refused here: the web
   * portal keeps letting customers read their history and only cuts off
   * writing, so the write routes carry that rule (see refuseWhenSuspended).
   */
  if (!readPortalSettings(tenant.portalConfig).portalEnabled) {
    return apiError(404, "portal_disabled", "This workspace does not serve a customer portal.");
  }

  const contact = await sessionContact(session.tenantId, session.contactId);
  if (!contact) {
    return apiError(401, "unauthorized", "This session no longer belongs to an active contact.");
  }

  const now = new Date();
  void db
    .update(deviceSessions)
    .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + DEVICE_SESSION_TTL_MS) })
    .where(eq(deviceSessions.id, session.id));

  return { tenant, contact, sessionId: session.id };
}

/** Writing on a suspended workspace: refused, as on the web portal. */
export function refuseWhenSuspended(tenant: typeof tenants.$inferSelect): Response | null {
  if (tenant.status === "suspended" || tenant.status === "deleting") {
    return apiError(403, "workspace_suspended", "This workspace is not accepting new requests.");
  }
  return null;
}

/* ---------- Shapes ---------- */

/**
 * The customer themselves (MC-05).
 *
 * No internal fields: a contact row also carries what the workspace thinks
 * about this person — custom fields agents fill in, the import it came from —
 * and none of that is theirs to read.
 */
export function serializePortalContact(
  contact: typeof contacts.$inferSelect,
  organization: { id: string; name: string; shared_tickets: boolean } | null,
): Record<string, unknown> {
  return {
    id: contact.id,
    email: contact.email,
    name: contact.name,
    locale: contact.locale,
    organization,
  };
}

export type PortalRequestListRow = {
  number: number;
  subject: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  lastMessage: { authorType: string; authorName: string | null; createdAt: Date } | null;
  messageCount: number;
};

/** One line of "My requests" (MC-01), with what the row shows: who spoke last. */
export function serializePortalRequest(r: PortalRequestListRow): Record<string, unknown> {
  return {
    number: r.number,
    subject: r.subject,
    status: r.status,
    created_at: r.createdAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
    resolved_at: r.resolvedAt?.toISOString() ?? null,
    closed_at: r.closedAt?.toISOString() ?? null,
    message_count: r.messageCount,
    last_message: r.lastMessage
      ? {
          author_type: r.lastMessage.authorType,
          author_name: r.lastMessage.authorName,
          created_at: r.lastMessage.createdAt?.toISOString() ?? null,
        }
      : null,
  };
}

/**
 * One message of a thread (MC-02).
 *
 * `author_name` is the agent's name and nothing else about them: an id would
 * let a customer correlate who handles what across their requests, which is the
 * workspace's business, not theirs. Only public replies ever reach this
 * function — internal notes are excluded by the query, not by this shape.
 */
export function serializePortalMessage(
  m: typeof ticketMessages.$inferSelect,
  authorName: string | null,
  files: { id: string; filename: string; sizeBytes: number }[],
): Record<string, unknown> {
  return {
    id: m.id,
    author_type: m.authorType,
    author_name: authorName,
    body_text: m.bodyText,
    body_html: m.bodyHtml,
    created_at: m.createdAt?.toISOString() ?? null,
    attachments: files.map((f) => ({
      id: f.id,
      filename: f.filename,
      size_bytes: f.sizeBytes,
      /** Fetched with the same session token. */
      download_url: `/api/attachments/${f.id}`,
    })),
  };
}

/** The request itself (MC-02) — the customer's view of a ticket. */
export function serializePortalRequestDetail(
  ticket: typeof tickets.$inferSelect,
  messages: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    number: ticket.number,
    subject: ticket.subject,
    status: ticket.status,
    type: ticket.type,
    created_at: ticket.createdAt?.toISOString() ?? null,
    updated_at: ticket.updatedAt?.toISOString() ?? null,
    resolved_at: ticket.resolvedAt?.toISOString() ?? null,
    closed_at: ticket.closedAt?.toISOString() ?? null,
    messages,
  };
}
