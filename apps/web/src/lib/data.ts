import {
  contacts,
  db,
  organizations,
  tickets,
  ticketMessages,
  users,
} from "@openhelpdesk/db";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";

/** Vues par défaut de l'inbox (AG-03). Les vues personnalisées arrivent ensuite. */
export const DEFAULT_VIEWS = [
  { key: "mine", label: "Mes tickets" },
  { key: "unassigned", label: "Non assignés" },
  { key: "breaching", label: "Bientôt en retard" },
  { key: "open", label: "Tous les ouverts" },
  { key: "resolved", label: "Résolus récemment" },
] as const;
export type ViewKey = (typeof DEFAULT_VIEWS)[number]["key"];

const OPEN_STATUSES = ["new", "open", "waiting", "on_hold"] as const;

function viewWhere(tenantId: string, view: ViewKey, agentId: string) {
  const base = and(eq(tickets.tenantId, tenantId), isNull(tickets.deletedAt), isNull(tickets.mergedIntoId));
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
    case "open":
      return and(base, openOnly);
    case "resolved":
      return and(
        base,
        eq(tickets.status, "resolved"),
        gt(tickets.resolvedAt, sql`now() - interval '7 days'`),
      );
  }
}

export async function viewCounts(tenantId: string, agentId: string) {
  const rows = await Promise.all(
    DEFAULT_VIEWS.map(async (v) => {
      const [row] = await db
        .select({ n: count() })
        .from(tickets)
        .where(viewWhere(tenantId, v.key, agentId));
      return [v.key, row?.n ?? 0] as const;
    }),
  );
  return Object.fromEntries(rows) as Record<ViewKey, number>;
}

export type TicketRow = Awaited<ReturnType<typeof listTickets>>[number];

export async function listTickets(tenantId: string, view: ViewKey, agentId: string) {
  const assignee = users;
  const rows = await db
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
    .where(viewWhere(tenantId, view, agentId))
    .orderBy(desc(tickets.updatedAt))
    .limit(50);

  if (rows.length === 0) return rows.map((r) => ({ ...r, excerpt: null as string | null }));

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
  return rows.map((r) => ({ ...r, excerpt: excerptByTicket.get(r.id) ?? null }));
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

  const agents = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), ne(users.status, "disabled")))
    .orderBy(asc(users.name));

  const [requesterTickets] = await db
    .select({ n: count() })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.requesterId, ticket.requesterId)));

  return {
    ticket,
    requester: requester!,
    organization,
    messages,
    agents,
    requesterTicketCount: requesterTickets?.n ?? 0,
  };
}

/** Numéro séquentiel par tenant — l'index unique (tenant, number) protège les courses. */
export async function nextTicketNumber(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${tickets.number}), 0)` })
    .from(tickets)
    .where(eq(tickets.tenantId, tenantId));
  return (row?.max ?? 0) + 1;
}
