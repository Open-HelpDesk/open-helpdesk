/**
 * Public REST API (v1) — authentication, scopes, and the shared response shape.
 *
 * This is the surface behind the API keys minted in Settings → API. Until now
 * those keys were issued but no endpoint validated them; this file closes that
 * gap. Auth is by key, not by subdomain: the key resolves its own tenant, so a
 * call works regardless of the host it lands on — but it only ever sees that
 * one workspace.
 *
 * Two credentials open the same doors (see lib/device-auth.ts): a workspace API
 * key, which is an integration, and a device session token, which is an agent on
 * a phone. Everything downstream of `authenticate` treats them alike except
 * where a route needs a person — `/me` and the push registrations — because a
 * key has nobody behind it.
 */
import { createHash } from "node:crypto";
import { apiKeys, db, deviceSessions, tenants, users } from "@openhelpdesk/db";
import { MAX_ATTACHMENT_BYTES } from "@openhelpdesk/storage";
import { and, eq, isNull } from "drizzle-orm";
import {
  DEVICE_SESSION_TTL_MS,
  DEVICE_TOKEN_RE,
  PORTAL_TOKEN_RE,
  hashSecret,
  scopesForRole,
  sessionAgent,
} from "@/lib/device-auth";

export type ApiAuth = {
  tenant: typeof tenants.$inferSelect;
  scopes: string[];
  /** Rate-limit bucket: the API key, or the device session. */
  keyId: string;
  /** The agent signed in on the device — null for a workspace API key. */
  agent: typeof users.$inferSelect | null;
};

/** JSON error, one consistent shape for every failure. */
export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function apiJson(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** A workspace that serves nothing over the API — the rule its screens apply. */
function usable(tenant: typeof tenants.$inferSelect): Response | null {
  if (tenant.status === "suspended" || tenant.status === "deleting") {
    return apiError(403, "workspace_suspended", "This workspace is suspended.");
  }
  return null;
}

/**
 * Resolve the caller from `Authorization: Bearer ohd_live_…` or `ohd_app_…`.
 *
 * The credential is hashed and matched against a non-revoked row; the tenant
 * comes from it, never from the host, so a call works wherever it lands but only
 * ever sees that one workspace. `lastUsedAt` is bumped fire-and-forget —
 * activity is worth recording, not worth blocking the request on.
 */
async function authenticate(request: Request): Promise<ApiAuth | Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(\S+)$/)?.[1] ?? "";
  if (DEVICE_TOKEN_RE.test(token)) return authenticateDevice(token);
  if (PORTAL_TOKEN_RE.test(token)) {
    // A real, possibly valid credential — for the other half of the API. Saying
    // so beats a 401 that reads like a broken sign-in.
    return apiError(
      403,
      "portal_session",
      "This is a customer session. Use the /api/v1/portal endpoints.",
    );
  }
  if (!/^ohd_live_[a-f0-9]{32}$/.test(token)) {
    return apiError(401, "unauthorized", "Provide a valid API key as a Bearer token.");
  }
  const hashed = createHash("sha256").update(token).digest("hex");
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
  const unusable = usable(tenant);
  if (unusable) return unusable;
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return { tenant, scopes: key.scopes, keyId: key.id, agent: null };
}

/**
 * Resolve one phone (MO-xx): the session, its workspace, and its agent.
 *
 * Three things can end a session between two calls, and each has to be checked
 * here rather than at sign-in: it was revoked from another device, it expired,
 * or the agent was disabled in the workspace. The last one is why the agent row
 * is loaded on every call instead of being copied into the session — an
 * offboarded agent whose phone kept working would be the whole point of
 * disabling them, missed.
 *
 * Expiry then slides forward, which is what makes 90 days a safe number.
 */
async function authenticateDevice(token: string): Promise<ApiAuth | Response> {
  const [session] = await db
    .select()
    .from(deviceSessions)
    .where(and(eq(deviceSessions.hashedToken, hashSecret(token)), isNull(deviceSessions.revokedAt)));
  if (!session) {
    return apiError(401, "unauthorized", "This session is unknown or has been signed out.");
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return apiError(401, "session_expired", "This session has expired. Sign in again.");
  }
  // The prefix already separates the two credential families; this is the check
  // that does not depend on a string having been matched correctly.
  if (!session.userId) {
    return apiError(403, "portal_session", "This session belongs to a customer, not an agent.");
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, session.tenantId));
  if (!tenant) {
    return apiError(401, "unauthorized", "This session is not attached to a workspace.");
  }
  const unusable = usable(tenant);
  if (unusable) return unusable;

  const agent = await sessionAgent(session.tenantId, session.userId);
  if (!agent) {
    return apiError(401, "unauthorized", "This session no longer belongs to an active agent.");
  }
  const now = new Date();
  void db
    .update(deviceSessions)
    .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + DEVICE_SESSION_TTL_MS) })
    .where(eq(deviceSessions.id, session.id));
  return { tenant, scopes: scopesForRole(agent.role), keyId: session.id, agent };
}

/**
 * Routes that need a person rather than a credential.
 *
 * `/me` and the push registrations are about an agent: answering them for a
 * workspace API key would mean inventing one, so they refuse instead — with the
 * name of the thing to do about it.
 */
export function requireDeviceAgent(auth: ApiAuth): typeof users.$inferSelect | Response {
  if (!auth.agent) {
    return apiError(
      403,
      "agent_required",
      "This endpoint needs an agent session. Sign in with POST /api/v1/auth/login.",
    );
  }
  return auth.agent;
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

/**
 * Seconds to wait, or null when the call is within its allowance.
 *
 * Exported because sign-in needs a much tighter window than the rest of the API
 * (an unauthenticated endpoint that checks passwords is a guessing target, and
 * it has no key to count against), and one implementation of a sliding window
 * is enough.
 */
export function rateLimit(bucket: string, max = RATE_MAX, windowMs = RATE_WINDOW_MS): number | null {
  const now = Date.now();
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(bucket, recent);
    return Math.ceil((windowMs - (now - recent[0]!)) / 1000);
  }
  recent.push(now);
  hits.set(bucket, recent);
  // Cheap sweep so a long-lived process does not accumulate one array per key
  // that stopped calling months ago.
  if (hits.size > 5_000) {
    for (const [id, times] of hits) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(id);
    }
  }
  return null;
}

/** The 429 both the API-wide limit and the sign-in limit answer with. */
export function rateLimitedResponse(retryAfter: number): Response {
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
    return apiError(
      403,
      "forbidden",
      auth.agent
        ? `The role "${auth.agent.role}" does not carry the "${scope}" permission.`
        : `This API key is missing the "${scope}" scope.`,
    );
  }
  const retryAfter = rateLimit(auth.keyId);
  if (retryAfter !== null) return rateLimitedResponse(retryAfter);
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
    /*
     * The clock, as the inbox draws it.
     *
     * A row that says "Open" without saying "42 minutes left" is missing the
     * half an agent triages on — and it was missing here: the mobile inbox had
     * to invent a countdown from `updated_at` or draw none. The instants go out
     * raw rather than as a remaining duration, because a phone that has been
     * asleep for an hour would otherwise show an hour-old answer as current.
     */
    sla: {
      first_reply_due_at: t.firstReplyDueAt?.toISOString() ?? null,
      next_reply_due_at: t.nextReplyDueAt?.toISOString() ?? null,
      resolve_due_at: t.resolveDueAt?.toISOString() ?? null,
      first_replied_at: t.firstRepliedAt?.toISOString() ?? null,
      warned_at: t.slaWarnedAt?.toISOString() ?? null,
      breached_at: t.slaBreachedAt?.toISOString() ?? null,
    },
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

type PushDeviceRow = Schema["pushDevices"]["$inferSelect"];

/**
 * A push registration, without the token it was created from.
 *
 * The APNs/FCM token stays server-side: it is the address a notification is
 * delivered to, and echoing it back would put a credential in a response that
 * the app already has and nobody else should.
 */
export function serializePushDevice(d: PushDeviceRow): Record<string, unknown> {
  return {
    id: d.id,
    platform: d.platform,
    device_name: d.deviceName,
    app_version: d.appVersion,
    agent_id: d.userId,
    contact_id: d.contactId,
    created_at: d.createdAt?.toISOString() ?? null,
    last_seen_at: d.lastSeenAt?.toISOString() ?? null,
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

/* ---------- Files ---------- */

/**
 * Ten files per request.
 *
 * The compose screens (MA-03, MC-03) attach a screenshot or two; a request
 * carrying fifty is either a mistake or a way to fill a bucket, and the cap is
 * cheaper to explain than to discover.
 */
const MAX_FILES_PER_REQUEST = 10;

/**
 * The whole multipart body, files and fields together.
 *
 * The same number as the per-file ceiling, and not by choice: past it the
 * runtime stops accepting the body at all, so a 10 MB file cannot be sent —
 * its envelope pushes the request over. Announcing the real number is better
 * than announcing 10 MB and failing at 10 MB.
 */
const MAX_MULTIPART_BYTES = MAX_ATTACHMENT_BYTES;

export function isMultipart(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").startsWith("multipart/form-data");
}

/**
 * Read a `multipart/form-data` body: text fields, and the files under `files`.
 *
 * Files are refused loudly here rather than skipped quietly downstream. The
 * storage layer drops what is too large — the right behaviour for inbound email,
 * where the alternative is losing the message too — but an API client that gets
 * 201 and no attachment has no way to learn it needs to compress the screenshot.
 */
export async function readMultipart(
  request: Request,
): Promise<{ fields: Record<string, string>; files: File[] } | Response> {
  /*
   * Checked before parsing, because past the ceiling the runtime refuses the
   * body itself and `formData()` throws a parse error — which reads as "your
   * multipart is malformed" when the truth is "your file is too big". Measured:
   * a 10 MiB body goes through, an 11 MiB one never reaches this code.
   */
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_MULTIPART_BYTES) {
    return apiError(
      413,
      "request_too_large",
      `The whole request — files and fields together — must stay under ${
        MAX_MULTIPART_BYTES / 1024 / 1024
      } MB. Send the files across several messages.`,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(
      400,
      "invalid_body",
      `The request body is not valid multipart/form-data, or exceeds ${
        MAX_MULTIPART_BYTES / 1024 / 1024
      } MB.`,
    );
  }
  const fields: Record<string, string> = {};
  const files: File[] = [];
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
      continue;
    }
    // An empty file part is what an untouched file input sends.
    if (value.size === 0) continue;
    if (value.size > MAX_ATTACHMENT_BYTES) {
      return apiError(
        413,
        "file_too_large",
        `"${value.name}" is ${Math.round(value.size / 1024 / 1024)} MB; the limit is ${
          MAX_ATTACHMENT_BYTES / 1024 / 1024
        } MB per file.`,
      );
    }
    files.push(value);
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return apiError(
      400,
      "too_many_files",
      `At most ${MAX_FILES_PER_REQUEST} files per request.`,
    );
  }
  return { fields, files };
}

/**
 * Store the files of a request against the message just written, and say what
 * happened to each.
 *
 * `skipped` is normally empty — `readMultipart` already refused what is too
 * large — and stays in the answer for the case the storage layer rejects
 * something this side could not see.
 */
export async function attachFilesToMessage(
  tenantId: string,
  messageId: string,
  files: File[],
): Promise<{ attachments: Record<string, unknown>[]; skipped: string[] }> {
  if (files.length === 0) return { attachments: [], skipped: [] };
  const { storeFilesOnMessage } = await import("@/lib/storage");
  const { stored, skipped } = await storeFilesOnMessage(tenantId, messageId, files);
  return {
    attachments: stored.map((a) => ({
      id: a.id,
      filename: a.filename,
      content_type: a.contentType,
      size_bytes: a.sizeBytes,
      download_url: `/api/v1/attachments/${a.id}/download`,
    })),
    skipped: skipped.map((f) => f.filename),
  };
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
