import {
  contacts,
  db,
  organizations,
  teams,
  tickets,
  ticketFields,
  ticketMessages,
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

import type { MessageKey } from "@/i18n/dictionaries/fr";
/** Vues par défaut de l'inbox (AG-03) — pastille 6×6 colorée par token de statut. */
/** Vues livrées avec le produit. `key` est stable (URL, filtres) ; le libellé
 *  est de l'interface, il suit donc la langue du tenant. */
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

async function escaladeTeamId(tenantId: string): Promise<string | null> {
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.tenantId, tenantId), eq(teams.name, "Escalade")));
  return team?.id ?? null;
}

function viewWhere(
  tenantId: string,
  view: ViewKey,
  agentId: string,
  escaladeId: string | null,
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
      // Échéance (1ʳᵉ réponse ou résolution) dépassée ou sous 30 min.
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
      return escaladeId
        ? and(base, openOnly, eq(tickets.teamId, escaladeId))
        : and(base, openOnly, sql`false`);
  }
}

/* ---------- Vues d'équipe (table views) ---------- */

export type TeamView = { id: string; name: string; count: number };

type ViewCondition = { field?: string; op?: string; value?: unknown };

/** Évaluation minimale des conditions d'une vue partagée (statut/priorité/assigné/équipe/tag). */
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
        if (typeof value === "string") {
          parts.push(eq(tickets.priority, value as "low" | "normal" | "high" | "urgent"));
        }
        break;
      case "assignee_id":
      case "assignee":
        if (typeof value === "string") parts.push(eq(tickets.assigneeId, value));
        break;
      case "team_id":
      case "team":
        if (typeof value === "string") parts.push(eq(tickets.teamId, value));
        break;
      case "tag":
      case "tags":
        if (typeof value === "string") {
          parts.push(sql`${value} = any(${tickets.tags})`);
        }
        break;
    }
  }
  if (!hasStatus) parts.push(inArray(tickets.status, [...OPEN_STATUSES]));
  return and(...parts);
}

export async function listTeamViews(tenantId: string): Promise<TeamView[]> {
  const rows = await db
    .select()
    .from(views)
    .where(and(eq(views.tenantId, tenantId), inArray(views.shared, ["team", "everyone"])))
    .orderBy(asc(views.position), asc(views.name));
  return Promise.all(
    rows.map(async (v) => {
      const [row] = await db
        .select({ n: count() })
        .from(tickets)
        .where(teamViewWhere(tenantId, (v.conditions as ViewCondition[]) ?? []));
      return { id: v.id, name: v.name, count: row?.n ?? 0 };
    }),
  );
}

export async function viewCounts(tenantId: string, agentId: string) {
  const escaladeId = await escaladeTeamId(tenantId);
  const rows = await Promise.all(
    DEFAULT_VIEWS.map(async (v) => {
      const [row] = await db
        .select({ n: count() })
        .from(tickets)
        .where(viewWhere(tenantId, v.key, agentId, escaladeId));
      return [v.key, row?.n ?? 0] as const;
    }),
  );
  return Object.fromEntries(rows) as Record<ViewKey, number>;
}

/* ---------- Liste des tickets (filtres + tri + pagination) ---------- */

export type InboxFilters = {
  status?: string;
  priority?: string;
  /** uuid d'agent, ou "none" pour « non assigné ». */
  assignee?: string;
  sort?: "priority" | "recent";
  /** 1-based. */
  page?: number;
};

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
    const [teamView] = await db
      .select()
      .from(views)
      .where(and(eq(views.tenantId, tenantId), eq(views.id, view.teamViewId)));
    where = teamViewWhere(tenantId, ((teamView?.conditions ?? []) as ViewCondition[]) ?? []);
  } else {
    where = viewWhere(tenantId, view, agentId, await escaladeTeamId(tenantId));
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
  return and(...parts);
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
  const orderBy =
    filters.sort === "recent"
      ? [desc(tickets.updatedAt)]
      : [PRIORITY_ORDER, desc(tickets.updatedAt)];

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

  // Extrait du dernier message par ticket (une requête, dépliée en JS).
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

/** Numéros ordonnés de la vue — navigation ←/→ de AG-04 (« ticket X sur N »). */
export async function viewTicketNumbers(
  tenantId: string,
  view: ViewKey,
  agentId: string,
): Promise<number[]> {
  const where = viewWhere(tenantId, view, agentId, await escaladeTeamId(tenantId));
  const rows = await db
    .select({ number: tickets.number })
    .from(tickets)
    .where(where)
    .orderBy(PRIORITY_ORDER, desc(tickets.updatedAt))
    .limit(200);
  return rows.map((r) => r.number);
}

export { nextTicketNumber } from "@openhelpdesk/db";

/** Macros disponibles dans l'éditeur de AG-04 (format aplati pour le client). */
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
      /** D'autres actions (priorité, équipe, tags) sont appliquées côté serveur à l'envoi. */
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

  // Ticket cible si celui-ci a été fusionné (bannière lecture seule).
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
