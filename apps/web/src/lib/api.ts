/**
 * Public REST API (v1) — authentication, scopes, and the shared response shape.
 *
 * This is the surface behind the API keys minted in Settings → API. Until now
 * those keys were issued but no endpoint validated them; this file closes that
 * gap. Auth is by key, not by subdomain: the key resolves its own tenant, so a
 * call works regardless of the host it lands on — but it only ever sees that
 * one workspace.
 */
import { createHash } from "node:crypto";
import { apiKeys, db, tenants } from "@openhelpdesk/db";
import { and, eq, isNull } from "drizzle-orm";

export type ApiAuth = {
  tenant: typeof tenants.$inferSelect;
  scopes: string[];
  keyId: string;
};

/** JSON error, one consistent shape for every failure. */
export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function apiJson(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * Resolve the caller from `Authorization: Bearer ohd_live_…`.
 *
 * The key is hashed and matched against a non-revoked row; the tenant comes
 * from the key. `lastUsedAt` is bumped fire-and-forget — a key's activity is
 * worth recording, but not worth blocking the request on.
 */
async function authenticate(request: Request): Promise<ApiAuth | Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(ohd_live_[a-f0-9]{32})$/);
  if (!match) {
    return apiError(401, "unauthorized", "Provide a valid API key as a Bearer token.");
  }
  const hashed = createHash("sha256").update(match[1]!).digest("hex");
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.hashedKey, hashed), isNull(apiKeys.revokedAt)));
  if (!key) {
    return apiError(401, "unauthorized", "This API key is unknown or has been revoked.");
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, key.tenantId));
  if (!tenant) {
    return apiError(401, "unauthorized", "This API key is not attached to a workspace.");
  }
  // A suspended or deleting workspace serves nothing over the API — same rule
  // the product applies to its own screens.
  if (tenant.status === "suspended" || tenant.status === "deleting") {
    return apiError(403, "workspace_suspended", "This workspace is suspended.");
  }
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return { tenant, scopes: key.scopes, keyId: key.id };
}

/**
 * Per-key rate limit.
 *
 * An in-process sliding window: enough to stop a runaway loop from taking the
 * workspace's database down, and honest about being per-instance rather than
 * cluster-wide. A shared counter would mean Redis on the request path of every
 * call, which is a worse trade for a limit this coarse.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 600;
const hits = new Map<string, number[]>();

function rateLimited(keyId: string): number | null {
  const now = Date.now();
  const recent = (hits.get(keyId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(keyId, recent);
    return Math.ceil((RATE_WINDOW_MS - (now - recent[0]!)) / 1000);
  }
  recent.push(now);
  hits.set(keyId, recent);
  // Cheap sweep so a long-lived process does not accumulate one array per key
  // that stopped calling months ago.
  if (hits.size > 5_000) {
    for (const [id, times] of hits) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(id);
    }
  }
  return null;
}

/**
 * Wraps a handler with auth + scope check, so each route stays about its own
 * resource. `scope` is the permission the route needs: "read" for GETs,
 * "write" for mutations, "ticket:create" for the create-only key. A key that
 * lacks it gets a 403, not a 401 — it is known, just not allowed here.
 */
export async function withApi(
  request: Request,
  scope: string,
  handler: (auth: ApiAuth) => Promise<Response>,
): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (!auth.scopes.includes(scope)) {
    return apiError(403, "forbidden", `This API key is missing the "${scope}" scope.`);
  }
  const retryAfter = rateLimited(auth.keyId);
  if (retryAfter !== null) {
    return Response.json(
      {
        error: {
          code: "rate_limited",
          message: `Too many requests. Retry in ${retryAfter} second(s).`,
        },
      },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }
  try {
    return await handler(auth);
  } catch (err) {
    console.error("[api] handler error:", err);
    return apiError(500, "internal_error", "Something went wrong handling the request.");
  }
}

/* ---------- Pagination ---------- */

export type Page = { limit: number; cursor: string | null };

/**
 * Reads `limit` and `cursor` from the query string.
 *
 * Keyset, not offset: an integration walking 200 000 tickets while agents keep
 * working would see rows shift under it with `offset`, silently skipping some
 * and repeating others. A cursor is stable under concurrent writes.
 */
export function readPage(request: Request, max = 100, fallback = 25): Page {
  const url = new URL(request.url);
  const raw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(max, Math.floor(raw)) : fallback;
  const cursor = url.searchParams.get("cursor");
  return { limit, cursor: cursor && cursor.trim() ? cursor.trim() : null };
}

/**
 * The list envelope every collection returns.
 *
 * `next_cursor` is null on the last page, so a caller loops until it is null
 * rather than counting pages — the only form that stays correct while rows are
 * being written.
 */
export function apiList(data: unknown[], nextCursor: string | null): Response {
  return Response.json({ data, next_cursor: nextCursor });
}

/* ---------- Public serialization ---------- */

type TicketRow = typeof import("@openhelpdesk/db").tickets.$inferSelect;
type ContactRow = typeof import("@openhelpdesk/db").contacts.$inferSelect;

/** The public shape of a ticket — deliberately not the raw row: tenant_id and
 * internal ids stay out, timestamps go out as ISO strings. */
export function serializeTicket(
  t: TicketRow,
  requester?: { id: string; email: string; name: string | null } | null,
): Record<string, unknown> {
  return {
    number: t.number,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    channel: t.channel,
    type: t.type,
    requester: requester ? { id: requester.id, email: requester.email, name: requester.name } : null,
    assignee_id: t.assigneeId,
    organization_id: t.organizationId,
    created_at: t.createdAt?.toISOString() ?? null,
    updated_at: t.updatedAt?.toISOString() ?? null,
  };
}

export function serializeContact(c: ContactRow): Record<string, unknown> {
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    phone: c.phone,
    locale: c.locale,
    blocked: c.blocked,
    custom_fields: c.customFields,
    created_at: c.createdAt?.toISOString() ?? null,
  };
}

type Schema = typeof import("@openhelpdesk/db");
type OrganizationRow = Schema["organizations"]["$inferSelect"];
type UserRow = Schema["users"]["$inferSelect"];
type TeamRow = Schema["teams"]["$inferSelect"];
type MessageRow = Schema["ticketMessages"]["$inferSelect"];
type MacroRow = Schema["macros"]["$inferSelect"];
type SlaPolicyRow = Schema["slaPolicies"]["$inferSelect"];
type ViewRow = Schema["views"]["$inferSelect"];
type FieldRow = Schema["ticketFields"]["$inferSelect"];
type CategoryRow = Schema["kbCategories"]["$inferSelect"];
type ArticleRow = Schema["kbArticles"]["$inferSelect"];
type CsatRow = Schema["csatResponses"]["$inferSelect"];
type AttachmentRow = Schema["attachments"]["$inferSelect"];

export function serializeOrganization(o: OrganizationRow): Record<string, unknown> {
  return {
    id: o.id,
    name: o.name,
    email_domains: o.emailDomains,
    shared_tickets: o.sharedTickets,
    notes: o.notes,
    custom_fields: o.customFields,
    created_at: o.createdAt?.toISOString() ?? null,
  };
}

/** An agent, as an integration may see them — never their auth details. */
export function serializeAgent(u: UserRow): Record<string, unknown> {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    available: u.available,
    created_at: u.createdAt?.toISOString() ?? null,
  };
}

export function serializeTeam(t: TeamRow): Record<string, unknown> {
  return { id: t.id, name: t.name, created_at: t.createdAt?.toISOString() ?? null };
}

export function serializeMessage(m: MessageRow): Record<string, unknown> {
  return {
    id: m.id,
    kind: m.kind,
    author_type: m.authorType,
    author_id: m.authorId,
    body_text: m.bodyText,
    body_html: m.bodyHtml,
    source: m.source,
    created_at: m.createdAt?.toISOString() ?? null,
  };
}

export function serializeMacro(m: MacroRow): Record<string, unknown> {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    actions: m.actions,
    availability: m.availability,
    team_id: m.teamId,
    created_at: m.createdAt?.toISOString() ?? null,
  };
}

export function serializeSlaPolicy(p: SlaPolicyRow): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    conditions: p.conditions,
    targets: p.targets,
    business_hours_id: p.businessHoursId,
    is_default: p.isDefault,
    active: p.active,
  };
}

export function serializeView(v: ViewRow): Record<string, unknown> {
  return {
    id: v.id,
    name: v.name,
    shared: v.shared,
    team_id: v.teamId,
    conditions: v.conditions,
    columns: v.columns,
    sort: v.sort,
    position: v.position,
  };
}

export function serializeField(f: FieldRow): Record<string, unknown> {
  return {
    id: f.id,
    key: f.key,
    label: f.label,
    type: f.type,
    options: f.options,
    portal_visible: f.portalVisible,
    required: f.required,
    position: f.position,
  };
}

export function serializeCategory(c: CategoryRow): Record<string, unknown> {
  return {
    id: c.id,
    parent_id: c.parentId,
    name: c.name,
    slug: c.slug,
    description: c.description,
    position: c.position,
  };
}

export function serializeArticle(a: ArticleRow): Record<string, unknown> {
  return {
    id: a.id,
    category_id: a.categoryId,
    title: a.title,
    slug: a.slug,
    body_html: a.bodyHtml,
    status: a.status,
    author_id: a.authorId,
    published_at: a.publishedAt?.toISOString() ?? null,
    view_count: a.viewCount,
    votes_up: a.votesUp,
    votes_down: a.votesDown,
    created_at: a.createdAt?.toISOString() ?? null,
    updated_at: a.updatedAt?.toISOString() ?? null,
  };
}

export function serializeCsat(c: CsatRow): Record<string, unknown> {
  return {
    id: c.id,
    ticket_id: c.ticketId,
    agent_id: c.agentId,
    score: c.score,
    comment: c.comment,
    created_at: c.createdAt?.toISOString() ?? null,
  };
}

export function serializeAttachment(a: AttachmentRow): Record<string, unknown> {
  return {
    id: a.id,
    message_id: a.messageId,
    filename: a.filename,
    content_type: a.contentType,
    size_bytes: a.sizeBytes,
    /** Fetched with the same API key; streams the file itself. */
    download_url: `/api/v1/attachments/${a.id}/download`,
    created_at: a.createdAt?.toISOString() ?? null,
  };
}

/** Parse a JSON body, or return a 400 the caller can pass straight back. */
export async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return apiError(400, "invalid_body", "The request body must be a JSON object.");
    }
    return body as Record<string, unknown>;
  } catch {
    return apiError(400, "invalid_body", "The request body is not valid JSON.");
  }
}

/* ---------- Input helpers ---------- */

/**
 * Email domains for an organization: lowercased, deduplicated, and never a
 * whole address by accident — pasting "someone@acme.fr" into the domain list is
 * the commonest way to break automatic attachment.
 */
export function readDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const raw of value) {
    const domain = String(raw).trim().toLowerCase().replace(/^@/, "");
    if (domain && domain.includes(".") && !domain.includes("@")) out.add(domain);
  }
  return [...out].slice(0, 50);
}

/** A slug the help centre can serve, derived from a title when absent. */
export function slugify(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
