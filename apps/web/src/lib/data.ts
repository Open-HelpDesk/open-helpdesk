import {
  contactNotes,
  contacts,
  db,
  organizations,
  teams,
  tickets,
  ticketFields,
  ticketLinks,
  ticketMessages,
  ticketTasks,
  users,
  views,
} from "@openhelpdesk/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { MessageKey } from "@/i18n/dictionaries/en";
// A real import, not only the re-export further down: `export { X } from …`
// creates no local binding, and reading X here would be a runtime
// "INBOX_SORTS is not defined" that the typecheck never sees.
import { INBOX_SORTS } from "./format";
/** Default inbox views (AG-03) — 6×6 dot colored by status token. */
/** Views shipped with the product. `key` is stable (URL, filters); the label
 *  belongs to the interface, hence it follows the tenant's language. */
export const DEFAULT_VIEWS = [
  { key: "mine", labelKey: "app.views.mine", dot: "open" },
  { key: "unassigned", labelKey: "app.views.unassigned", dot: "new" },
  { key: "breaching", labelKey: "app.views.breaching", dot: "wait" },
  { key: "resolved", labelKey: "app.views.resolved", dot: "ok" },
  { key: "urgent", labelKey: "app.views.urgent", dot: "dang" },
  { key: "escalation", labelKey: "app.views.escalation", dot: "pause" },
] as const satisfies readonly { key: string; labelKey: MessageKey; dot: string }[];
export type ViewKey = (typeof DEFAULT_VIEWS)[number]["key"];

const OPEN_STATUSES = ["new", "open", "waiting", "on_hold"] as const;

async function escalationTeamId(tenantId: string): Promise<string | null> {
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.tenantId, tenantId), eq(teams.name, "Escalation")));
  return team?.id ?? null;
}

function viewWhere(
  tenantId: string,
  view: ViewKey,
  agentId: string,
  escalationId: string | null,
) {
  const base = and(
    eq(tickets.tenantId, tenantId),
    isNull(tickets.deletedAt),
    isNull(tickets.mergedIntoId),
  );
  const openOnly = inArray(tickets.status, [...OPEN_STATUSES]);
  switch (view) {
    case "mine":
      return and(base, openOnly, eq(tickets.assigneeId, agentId));
    case "unassigned":
      return and(base, openOnly, isNull(tickets.assigneeId));
    case "breaching": {
      // Due date (1st reply or resolution) passed, or less than 30 min away.
      const soon = sql`now() + interval '30 minutes'`;
      return and(
        base,
        openOnly,
        sql`(
          (${tickets.firstRepliedAt} is null and ${tickets.firstReplyDueAt} is not null and ${tickets.firstReplyDueAt} < ${soon})
          or (${tickets.resolveDueAt} is not null and ${tickets.resolveDueAt} < ${soon})
        )`,
      );
    }
    case "resolved":
      return and(
        base,
        eq(tickets.status, "resolved"),
        gt(tickets.resolvedAt, sql`now() - interval '7 days'`),
      );
    case "urgent":
      return and(
        base,
        openOnly,
        eq(tickets.priority, "urgent"),
        gt(tickets.createdAt, sql`now() - interval '7 days'`),
      );
    case "escalation":
      return escalationId
        ? and(base, openOnly, eq(tickets.teamId, escalationId))
        : and(base, openOnly, sql`false`);
  }
}

/* ---------- Team views (views table) ---------- */

export type TeamView = {
  id: string;
  name: string;
  count: number;
  /** null = the view carries no default sort. */
  sort: InboxSort | null;
  shared: "private" | "team" | "everyone";
  ownerId: string | null;
};

/**
 * Who may delete a saved view: its author, or a manager for a shared one.
 * Lives here so the inbox (which decides whether to draw the button) and the
 * server action (which decides whether to obey it) cannot drift apart.
 */
export function canDeleteView(
  view: { ownerId: string | null; shared: string },
  agent: { id: string; role: string },
): boolean {
  if (view.ownerId === agent.id) return true;
  return (agent.role === "owner" || agent.role === "admin") && view.shared !== "private";
}

export type ViewCondition = { field?: string; op?: string; value?: unknown };

/**
 * Evaluation of a saved view's conditions — the contract the view builder
 * (/app/tickets/views/new) writes against.
 *
 * Status, priority and tag accept a list as well as a single value: the builder
 * offers "is among", and a view that says "Urgent or High" has to filter on both
 * rather than silently keeping the first.
 *
 * Any field NOT handled here is ignored, which is why the builder only ever
 * offers these five: a condition the reader drops produces a view that does not
 * hold what its own definition says it holds.
 */
function teamViewWhere(tenantId: string, conditions: ViewCondition[]) {
  const base = and(
    eq(tickets.tenantId, tenantId),
    isNull(tickets.deletedAt),
    isNull(tickets.mergedIntoId),
  );
  const parts: (SQL | undefined)[] = [base];
  let hasStatus = false;
  for (const c of conditions) {
    const value = c.value;
    switch (c.field) {
      case "status":
        hasStatus = true;
        if (Array.isArray(value)) {
          parts.push(inArray(tickets.status, value as (typeof OPEN_STATUSES)[number][]));
        } else if (typeof value === "string") {
          parts.push(eq(tickets.status, value as (typeof OPEN_STATUSES)[number]));
        }
        break;
      case "priority":
        if (Array.isArray(value) && value.length > 0) {
          parts.push(inArray(tickets.priority, value as ("low" | "normal" | "high" | "urgent")[]));
        } else if (typeof value === "string") {
          parts.push(eq(tickets.priority, value as "low" | "normal" | "high" | "urgent"));
        }
        break;
      case "assignee_id":
      case "assignee":
        // "none" is a real answer to "who owns this", and the one an "Unassigned"
        // view is made of — without it the field could only ever name a person.
        if (value === "none") parts.push(isNull(tickets.assigneeId));
        else if (typeof value === "string") parts.push(eq(tickets.assigneeId, value));
        break;
      case "team_id":
      case "team":
        if (value === "none") parts.push(isNull(tickets.teamId));
        else if (typeof value === "string") parts.push(eq(tickets.teamId, value));
        break;
      case "tag":
      case "tags":
        if (Array.isArray(value) && value.length > 0) {
          // Overlap: the ticket carries at least one of the listed tags.
          parts.push(sql`${tickets.tags} && ${value as string[]}`);
        } else if (typeof value === "string") {
          parts.push(sql`${value} = any(${tickets.tags})`);
        }
        break;
    }
  }
  if (!hasStatus) parts.push(inArray(tickets.status, [...OPEN_STATUSES]));
  return and(...parts);
}

/**
 * The saved views an agent may open: everything shared with the workspace or a
 * team, plus their own private ones.
 *
 * Private views used to be invisible — created by nothing, since the builder did
 * not exist, and listed by nobody. Offering "Personal" in the builder without
 * this would have made the option a dead end.
 */
export async function listSavedViews(tenantId: string, agentId: string): Promise<TeamView[]> {
  const rows = await db
    .select()
    .from(views)
    .where(
      and(
        eq(views.tenantId, tenantId),
        or(
          inArray(views.shared, ["team", "everyone"]),
          and(eq(views.shared, "private"), eq(views.ownerId, agentId)),
        ),
      ),
    )
    .orderBy(asc(views.position), asc(views.name));
  return Promise.all(
    rows.map(async (v) => {
      const [row] = await db
        .select({ n: count() })
        .from(tickets)
        .where(teamViewWhere(tenantId, (v.conditions as ViewCondition[]) ?? []));
      const sort = (v.sort as { key?: string } | null)?.key;
      return {
        id: v.id,
        name: v.name,
        count: row?.n ?? 0,
        sort: (INBOX_SORTS as readonly string[]).includes(sort ?? "")
          ? (sort as InboxSort)
          : null,
        shared: v.shared,
        ownerId: v.ownerId,
      };
    }),
  );
}

/* ---------- Writing a view (newview) ---------- */

const VIEW_FIELDS = ["status", "priority", "assignee", "team", "tag"] as const;
const VIEW_STATUSES = ["new", "open", "waiting", "on_hold", "resolved", "closed"];
const VIEW_PRIORITIES = ["low", "normal", "high", "urgent"];
const VIEW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keeps the conditions `teamViewWhere` can actually evaluate and drops the rest —
 * the write side of the same contract, which is why it lives next to it rather
 * than in the server action: a field kept here and ignored there would save a
 * view that does not hold what its definition says.
 *
 * (It also cannot live in the action file: every export of a "use server" module
 * has to be an async function.)
 */
export function sanitizeViewConditions(raw: unknown): ViewCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: ViewCondition[] = [];
  for (const item of raw.slice(0, 12)) {
    if (typeof item !== "object" || item === null) continue;
    const { field, value } = item as { field?: unknown; value?: unknown };
    if (typeof field !== "string" || !(VIEW_FIELDS as readonly string[]).includes(field)) continue;
    if (field === "status" || field === "priority") {
      const allowed = field === "status" ? VIEW_STATUSES : VIEW_PRIORITIES;
      const list = Array.isArray(value) ? value.filter((v) => allowed.includes(String(v))) : [];
      // An empty list is not "match nothing", it is "the user picked no value":
      // such a condition is dropped rather than saved as a filter that can never
      // be true.
      if (list.length > 0) out.push({ field, value: list.map(String) });
    } else if (field === "tag") {
      const list = Array.isArray(value)
        ? value.filter((v) => typeof v === "string" && v.length > 0 && v.length <= 64)
        : [];
      if (list.length > 0) out.push({ field, value: list.map(String) });
    } else {
      const v = String(value ?? "");
      if (v === "none" || VIEW_UUID.test(v)) out.push({ field, value: v });
    }
  }
  return out;
}

/** Counts the tickets a set of conditions would match — the builder's preview. */
export async function countViewMatches(
  tenantId: string,
  conditions: ViewCondition[],
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tickets)
    .where(teamViewWhere(tenantId, conditions));
  return row?.n ?? 0;
}

export async function viewCounts(tenantId: string, agentId: string) {
  const escalationId = await escalationTeamId(tenantId);
  const rows = await Promise.all(
    DEFAULT_VIEWS.map(async (v) => {
      const [row] = await db
        .select({ n: count() })
        .from(tickets)
        .where(viewWhere(tenantId, v.key, agentId, escalationId));
      return [v.key, row?.n ?? 0] as const;
    }),
  );
  return Object.fromEntries(rows) as Record<ViewKey, number>;
}

/* ---------- Ticket list (filters + sort + pagination) ---------- */

export type InboxFilters = {
  status?: string;
  priority?: string;
  /** Agent uuid, or "none" for "unassigned". */
  assignee?: string;
  /**
   * V2 filter menu — multi-select with counts, three groups.
   *
   * Status and assignee are not among them and are not missing: the V2 views
   * ("Unassigned", "Waiting on customer", "Solved this week") already express
   * them, and a filter that repeats a view is a second way to reach the same
   * list that then has to agree with it.
   */
  priorities?: string[];
  channels?: string[];
  /** Organisation uuids. */
  orgs?: string[];
  sort?: InboxSort;
  /** 1-based. */
  page?: number;
};

import type { InboxSort } from "./format";
export { INBOX_SORTS, type InboxSort } from "./format";

export const INBOX_PAGE_SIZE = 50;

const PRIORITY_ORDER = sql`case ${tickets.priority}
  when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`;

async function inboxWhere(
  tenantId: string,
  view: ViewKey | { teamViewId: string },
  agentId: string,
  filters: InboxFilters,
) {
  let where: SQL | undefined;
  if (typeof view === "object") {
    // A private view is the agent's own: loading one by id alone would have made
    // "Personal" a link anyone in the workspace could open.
    const [teamView] = await db
      .select()
      .from(views)
      .where(
        and(
          eq(views.tenantId, tenantId),
          eq(views.id, view.teamViewId),
          or(
            inArray(views.shared, ["team", "everyone"]),
            and(eq(views.shared, "private"), eq(views.ownerId, agentId)),
          ),
        ),
      );
    where = teamViewWhere(tenantId, ((teamView?.conditions ?? []) as ViewCondition[]) ?? []);
  } else {
    where = viewWhere(tenantId, view, agentId, await escalationTeamId(tenantId));
  }

  const parts: (SQL | undefined)[] = [where];
  if (
    filters.status &&
    ["new", "open", "waiting", "on_hold", "resolved", "closed"].includes(filters.status)
  ) {
    parts.push(eq(tickets.status, filters.status as (typeof OPEN_STATUSES)[number]));
  }
  if (filters.priority && ["low", "normal", "high", "urgent"].includes(filters.priority)) {
    parts.push(eq(tickets.priority, filters.priority as "low" | "normal" | "high" | "urgent"));
  }
  if (filters.assignee === "none") {
    parts.push(isNull(tickets.assigneeId));
  } else if (filters.assignee) {
    parts.push(eq(tickets.assigneeId, filters.assignee));
  }
  // V2 multi-select groups. An empty selection means "no constraint", never
  // "nothing matches" — a menu with every box clear has to show the whole view.
  const priorities = (filters.priorities ?? []).filter((p) =>
    ["low", "normal", "high", "urgent"].includes(p),
  ) as ("low" | "normal" | "high" | "urgent")[];
  if (priorities.length) parts.push(inArray(tickets.priority, priorities));

  const channels = (filters.channels ?? []).filter((c) =>
    ["email", "portal", "widget", "api"].includes(c),
  ) as ("email" | "portal" | "widget" | "api")[];
  if (channels.length) parts.push(inArray(tickets.channel, channels));

  const orgs = (filters.orgs ?? []).filter((o) => UUID.test(o));
  if (orgs.length) parts.push(inArray(tickets.organizationId, orgs));

  return and(...parts);
}

/** Guards the organisation ids that arrive from the query string. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Counts behind each box of the V2 filter menu.
 *
 * Scoped to the view and to the OTHER groups, not to the group being counted:
 * with a priority selected, the priority counts must keep showing what the other
 * priorities would bring, or the menu becomes a list of zeros as soon as you use
 * it.
 */
export async function inboxFacets(
  tenantId: string,
  view: ViewKey | { teamViewId: string },
  agentId: string,
  filters: InboxFilters,
) {
  const scoped = (drop: "priorities" | "channels" | "orgs") =>
    inboxWhere(tenantId, view, agentId, { ...filters, [drop]: [] });

  const [byPriority, byChannel, byOrg] = await Promise.all([
    scoped("priorities").then((w) =>
      db
        .select({ key: tickets.priority, n: count() })
        .from(tickets)
        .where(w)
        .groupBy(tickets.priority),
    ),
    scoped("channels").then((w) =>
      db.select({ key: tickets.channel, n: count() }).from(tickets).where(w).groupBy(tickets.channel),
    ),
    scoped("orgs").then((w) =>
      db
        .select({ key: tickets.organizationId, name: organizations.name, n: count() })
        .from(tickets)
        .innerJoin(organizations, eq(organizations.id, tickets.organizationId))
        .where(w)
        .groupBy(tickets.organizationId, organizations.name)
        .orderBy(desc(count()))
        .limit(6),
    ),
  ]);

  return {
    priorities: byPriority.map((r) => ({ key: r.key, count: r.n })),
    channels: byChannel.map((r) => ({ key: r.key ?? "email", count: r.n })),
    orgs: byOrg.map((r) => ({ key: r.key!, name: r.name, count: r.n })),
  };
}

export type TicketRow = Awaited<ReturnType<typeof listTickets>>["rows"][number];

export async function listTickets(
  tenantId: string,
  view: ViewKey | { teamViewId: string },
  agentId: string,
  filters: InboxFilters = {},
) {
  const where = await inboxWhere(tenantId, view, agentId, filters);
  const page = Math.max(1, filters.page ?? 1);
  /*
   * The five V2 orders. "SLA" is the default and the one the design shows
   * selected: soonest deadline first, and a ticket with no target sorts last
   * rather than first — a null is not urgent.
   */
  const orderBy =
    filters.sort === "recent"
      ? [desc(tickets.createdAt)]
      : filters.sort === "oldest"
        ? [asc(tickets.createdAt)]
        : filters.sort === "priority"
          ? [PRIORITY_ORDER, desc(tickets.updatedAt)]
          : filters.sort === "lastReply"
            ? [desc(tickets.updatedAt)]
            : [
                sql`coalesce(${tickets.resolveDueAt}, ${tickets.firstReplyDueAt}) asc nulls last`,
                desc(tickets.updatedAt),
              ];

  const assignee = users;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: tickets.id,
        number: tickets.number,
        subject: tickets.subject,
        status: tickets.status,
        priority: tickets.priority,
        updatedAt: tickets.updatedAt,
        firstRepliedAt: tickets.firstRepliedAt,
        firstReplyDueAt: tickets.firstReplyDueAt,
        resolveDueAt: tickets.resolveDueAt,
        requesterName: contacts.name,
        requesterEmail: contacts.email,
        organizationName: organizations.name,
        assigneeName: assignee.name,
      })
      .from(tickets)
      .innerJoin(contacts, eq(tickets.requesterId, contacts.id))
      .leftJoin(organizations, eq(tickets.organizationId, organizations.id))
      .leftJoin(assignee, eq(tickets.assigneeId, assignee.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(INBOX_PAGE_SIZE)
      .offset((page - 1) * INBOX_PAGE_SIZE),
    db.select({ n: count() }).from(tickets).where(where),
  ]);

  const total = totalRow?.n ?? 0;
  if (rows.length === 0) {
    return { rows: rows.map((r) => ({ ...r, excerpt: null as string | null })), total };
  }

  // Excerpt of the last message per ticket (one query, unfolded in JS).
  const ids = rows.map((r) => r.id);
  const msgs = await db
    .select({
      ticketId: ticketMessages.ticketId,
      bodyText: ticketMessages.bodyText,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .where(
      and(
        eq(ticketMessages.tenantId, tenantId),
        inArray(ticketMessages.ticketId, ids),
        ne(ticketMessages.kind, "internal_note"),
      ),
    )
    .orderBy(desc(ticketMessages.createdAt));
  const excerptByTicket = new Map<string, string>();
  for (const m of msgs) {
    if (!excerptByTicket.has(m.ticketId) && m.bodyText) {
      excerptByTicket.set(m.ticketId, m.bodyText.slice(0, 140));
    }
  }
  return {
    rows: rows.map((r) => ({ ...r, excerpt: excerptByTicket.get(r.id) ?? null })),
    total,
  };
}

/** Ordered numbers of the view — AG-04 ←/→ navigation ("ticket X of N"). */
export async function viewTicketNumbers(
  tenantId: string,
  view: ViewKey,
  agentId: string,
): Promise<number[]> {
  const where = viewWhere(tenantId, view, agentId, await escalationTeamId(tenantId));
  const rows = await db
    .select({ number: tickets.number })
    .from(tickets)
    .where(where)
    .orderBy(PRIORITY_ORDER, desc(tickets.updatedAt))
    .limit(200);
  return rows.map((r) => r.number);
}

export { nextTicketNumber } from "@openhelpdesk/db";

/** Macros available in the AG-04 editor (flattened format for the client). */
export async function listMacrosForEditor(tenantId: string) {
  const { macros } = await import("@openhelpdesk/db");
  const rows = await db
    .select()
    .from(macros)
    .where(eq(macros.tenantId, tenantId))
    .orderBy(asc(macros.category), asc(macros.name));
  return rows.map((m) => {
    const actions = (m.actions as { type: string; value?: unknown }[]) ?? [];
    const insert = actions.find((a) => a.type === "insert_text" || a.type === "insert_note");
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      insertText: String(insert?.value ?? ""),
      insertKind: insert?.type === "insert_note" ? ("internal_note" as const) : ("public_reply" as const),
      setStatus: String(actions.find((a) => a.type === "set_status")?.value ?? ""),
      /** Other actions (priority, team, tags) are applied server-side on send. */
      hasServerActions: actions.some((a) =>
        ["set_priority", "assign_team", "assign_user", "add_tags"].includes(a.type),
      ),
    };
  });
}

export async function getTicketByNumber(tenantId: string, number: number) {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.number, number)));
  if (!ticket) return null;

  const [requester] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, ticket.requesterId));

  const organization = ticket.organizationId
    ? (
        await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, ticket.organizationId))
      )[0]
    : undefined;

  const messages = await db
    .select()
    .from(ticketMessages)
    .where(and(eq(ticketMessages.tenantId, tenantId), eq(ticketMessages.ticketId, ticket.id)))
    .orderBy(asc(ticketMessages.createdAt));

  const { attachments } = await import("@openhelpdesk/db");
  const attachmentRows =
    messages.length > 0
      ? await db
          .select({
            id: attachments.id,
            messageId: attachments.messageId,
            filename: attachments.filename,
            contentType: attachments.contentType,
            sizeBytes: attachments.sizeBytes,
          })
          .from(attachments)
          .where(
            and(
              eq(attachments.tenantId, tenantId),
              inArray(attachments.messageId, messages.map((m) => m.id)),
            ),
          )
      : [];
  const attachmentsByMessage = new Map<string, typeof attachmentRows>();
  for (const a of attachmentRows) {
    if (!a.messageId) continue;
    attachmentsByMessage.set(a.messageId, [...(attachmentsByMessage.get(a.messageId) ?? []), a]);
  }

  const [agents, teamRows, fieldRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), ne(users.status, "disabled")))
      .orderBy(asc(users.name)),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.tenantId, tenantId))
      .orderBy(asc(teams.name)),
    db
      .select()
      .from(ticketFields)
      .where(eq(ticketFields.tenantId, tenantId))
      .orderBy(asc(ticketFields.position)),
  ]);

  const [[requesterTickets], recentRequesterTickets] = await Promise.all([
    db
      .select({ n: count() })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.requesterId, ticket.requesterId))),
    db
      .select({
        number: tickets.number,
        subject: tickets.subject,
        status: tickets.status,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.tenantId, tenantId),
          eq(tickets.requesterId, ticket.requesterId),
          ne(tickets.id, ticket.id),
        ),
      )
      .orderBy(desc(tickets.updatedAt))
      .limit(3),
  ]);

  // Target ticket if this one was merged (read-only banner).
  const mergedInto = ticket.mergedIntoId
    ? (
        await db
          .select({ number: tickets.number })
          .from(tickets)
          .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticket.mergedIntoId)))
      )[0]
    : undefined;

  return {
    ticket,
    requester: requester!,
    organization,
    messages,
    attachmentsByMessage,
    agents,
    teams: teamRows,
    ticketFields: fieldRows,
    requesterTicketCount: requesterTickets?.n ?? 0,
    recentRequesterTickets,
    mergedIntoNumber: mergedInto?.number ?? null,
  };
}

/**
 * The ticket's checklist (AG-04, V2), newest last so the list reads in the order
 * the tasks were written. Open before done: the point of the tab is what is
 * left, and finished items sinking to the bottom is what makes that readable.
 */
export async function listTicketTasks(tenantId: string, ticketId: string) {
  const assignee = alias(users, "task_assignee");
  return db
    .select({
      id: ticketTasks.id,
      label: ticketTasks.label,
      done: ticketTasks.done,
      dueAt: ticketTasks.dueAt,
      assigneeName: assignee.name,
    })
    .from(ticketTasks)
    .leftJoin(assignee, eq(assignee.id, ticketTasks.assigneeId))
    .where(and(eq(ticketTasks.tenantId, tenantId), eq(ticketTasks.ticketId, ticketId)))
    .orderBy(asc(ticketTasks.done), asc(ticketTasks.createdAt));
}

/** Notes pinned to a contact (AG-04, "Notes" panel), newest first. */
export async function listContactNotes(tenantId: string, contactId: string) {
  const author = alias(users, "note_author");
  return db
    .select({
      id: contactNotes.id,
      body: contactNotes.body,
      createdAt: contactNotes.createdAt,
      authorName: author.name,
    })
    .from(contactNotes)
    .leftJoin(author, eq(author.id, contactNotes.authorId))
    .where(and(eq(contactNotes.tenantId, tenantId), eq(contactNotes.contactId, contactId)))
    .orderBy(desc(contactNotes.createdAt));
}

/**
 * Tickets linked to this one (AG-04, "Linked" panel).
 *
 * Read in both directions from a single row: linking A to B has to surface on B,
 * and writing two rows for one human fact is two chances to disagree.
 */
export async function listTicketLinks(tenantId: string, ticketId: string) {
  const other = alias(tickets, "linked_ticket");
  const rows = await db
    .select({
      id: ticketLinks.id,
      relation: ticketLinks.relation,
      number: other.number,
      subject: other.subject,
      status: other.status,
    })
    .from(ticketLinks)
    .innerJoin(
      other,
      or(
        and(eq(ticketLinks.ticketId, ticketId), eq(other.id, ticketLinks.linkedTicketId)),
        and(eq(ticketLinks.linkedTicketId, ticketId), eq(other.id, ticketLinks.ticketId)),
      ),
    )
    .where(
      and(
        eq(ticketLinks.tenantId, tenantId),
        or(eq(ticketLinks.ticketId, ticketId), eq(ticketLinks.linkedTicketId, ticketId)),
      ),
    )
    .orderBy(desc(ticketLinks.createdAt));
  return rows;
}

/**
 * Other open tickets of the same organisation.
 *
 * Derived, never stored: "same organisation" is a fact the data already knows,
 * and a row saying so would need keeping in step with every organisation change.
 */
export async function sameOrgTickets(
  tenantId: string,
  organizationId: string | null,
  excludeTicketId: string,
) {
  if (!organizationId) return [];
  return db
    .select({ number: tickets.number, subject: tickets.subject, status: tickets.status })
    .from(tickets)
    .where(
      and(
        eq(tickets.tenantId, tenantId),
        eq(tickets.organizationId, organizationId),
        ne(tickets.id, excludeTicketId),
        isNull(tickets.deletedAt),
        isNull(tickets.mergedIntoId),
        inArray(tickets.status, [...OPEN_STATUSES]),
      ),
    )
    .orderBy(desc(tickets.updatedAt))
    .limit(4);
}

