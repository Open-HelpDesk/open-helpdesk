/**
 * Notification feeds — the agent's (V2 topbar, MA-06) and the customer's (MC-04).
 *
 * Derived, not stored. Every line of these feeds is something the database
 * already records — an SLA that was breached, a note a colleague left, a
 * customer who answered, a request that got resolved — so a `notifications`
 * table would have been a second copy of those facts, free to drift from them
 * and needing a writer at every call site that could ever produce one. Reading
 * them back costs a handful of indexed queries.
 *
 * The consequence is that "read" cannot be per-item: there is no row to mark. It
 * is a waterline instead — `users.notifications_read_at`,
 * `contacts.notifications_read_at` — and anything older than it counts as read.
 * That is the honest meaning of the "mark all read" button both designs draw,
 * and the only one this shape supports.
 *
 * The events come out as data (`*NotificationEvents`); the web shell then turns
 * them into sentences in the workspace's language. The mobile app takes the same
 * events and writes its own, because a phone localises on the phone — which is
 * why the split exists rather than one function returning ready-made strings.
 */
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { contacts, db, ticketMessages, tickets, users } from "@openhelpdesk/db";
import type { ShellNotification } from "@/components/app-shell";
import type { getT } from "@/i18n/server";

const OPEN_STATUSES = ["new", "open", "waiting", "on_hold"] as const;
const MAX = 8;

type Translate = Awaited<ReturnType<typeof getT>>;

/**
 * What can appear in an agent's feed.
 *
 * There is deliberately no "assigned to you": an assignment leaves no date
 * behind (`tickets` records the assignee, not when they got it), so a derived
 * feed has nothing to sort or to call new. Assignment is a push notification —
 * sent at the moment it happens — not a feed line.
 */
export type AgentNotificationKind =
  | "sla_breached"
  | "sla_warning"
  | "customer_reply"
  | "internal_note";

export type ContactNotificationKind = "agent_reply" | "resolved";

export type NotificationEvent<K extends string> = {
  /** Stable for as long as the underlying fact is: a client can key a list on it. */
  id: string;
  kind: K;
  ticketNumber: number;
  ticketSubject: string;
  /** Who did it — a customer, a colleague. Null when nobody did (SLA, resolution). */
  actorName: string | null;
  at: Date;
  read: boolean;
};

/**
 * One line per ticket and per kind, most recent first.
 *
 * Three "Julien replied on #4821" in a row is one piece of news told three
 * times, and it pushes the other tickets out of a panel that only holds a
 * handful.
 */
function condense<K extends string>(
  events: NotificationEvent<K>[],
  group: (kind: K) => string,
): NotificationEvent<K>[] {
  const sorted = [...events].sort((a, b) => b.at.getTime() - a.at.getTime());
  const kept = new Map<string, NotificationEvent<K>>();
  for (const event of sorted) {
    const key = `${group(event.kind)}:${event.ticketNumber}`;
    if (!kept.has(key)) kept.set(key, event);
  }
  return [...kept.values()].slice(0, MAX);
}

/** Everything on the agent's plate that happened without them (MA-06). */
export async function agentNotificationEvents(
  tenantId: string,
  agentId: string,
  readAt: Date | null,
): Promise<NotificationEvent<AgentNotificationKind>[]> {
  const mine = and(
    eq(tickets.tenantId, tenantId),
    eq(tickets.assigneeId, agentId),
    inArray(tickets.status, [...OPEN_STATUSES]),
  );

  const [slaRows, replyRows, noteRows] = await Promise.all([
    // Breached first, then merely warned: an overdue target is not the same news
    // as one that is getting close.
    db
      .select({
        number: tickets.number,
        subject: tickets.subject,
        breached: tickets.slaBreachedAt,
        warned: tickets.slaWarnedAt,
      })
      .from(tickets)
      .where(and(mine, sql`(${tickets.slaBreachedAt} is not null or ${tickets.slaWarnedAt} is not null)`))
      .orderBy(desc(sql`coalesce(${tickets.slaBreachedAt}, ${tickets.slaWarnedAt})`))
      .limit(MAX),

    db
      .select({
        id: ticketMessages.id,
        at: ticketMessages.createdAt,
        number: tickets.number,
        subject: tickets.subject,
        who: contacts.name,
        email: contacts.email,
      })
      .from(ticketMessages)
      .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
      .leftJoin(contacts, eq(contacts.id, ticketMessages.authorId))
      .where(and(mine, eq(ticketMessages.kind, "public_reply"), eq(ticketMessages.authorType, "contact")))
      .orderBy(desc(ticketMessages.createdAt))
      .limit(MAX),

    // A colleague's internal note on one of my tickets. Not a "mention": the
    // product has no mention syntax, and guessing one from a name inside a body
    // would announce notes that never addressed anyone.
    db
      .select({
        id: ticketMessages.id,
        at: ticketMessages.createdAt,
        number: tickets.number,
        subject: tickets.subject,
        who: users.name,
      })
      .from(ticketMessages)
      .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
      .leftJoin(users, eq(users.id, ticketMessages.authorId))
      .where(
        and(
          mine,
          eq(ticketMessages.kind, "internal_note"),
          isNotNull(ticketMessages.authorId),
          ne(ticketMessages.authorId, agentId),
        ),
      )
      .orderBy(desc(ticketMessages.createdAt))
      .limit(MAX),
  ]);

  const events: NotificationEvent<AgentNotificationKind>[] = [];
  const isRead = (at: Date) => (readAt ? at <= readAt : false);

  for (const r of slaRows) {
    const at = r.breached ?? r.warned;
    if (!at) continue;
    events.push({
      id: `sla-${r.number}`,
      kind: r.breached ? "sla_breached" : "sla_warning",
      ticketNumber: r.number,
      ticketSubject: r.subject,
      actorName: null,
      at,
      read: isRead(at),
    });
  }
  for (const r of replyRows) {
    events.push({
      id: `reply-${r.id}`,
      kind: "customer_reply",
      ticketNumber: r.number,
      ticketSubject: r.subject,
      actorName: r.who ?? r.email ?? null,
      at: r.at,
      read: isRead(r.at),
    });
  }
  for (const r of noteRows) {
    events.push({
      id: `note-${r.id}`,
      kind: "internal_note",
      ticketNumber: r.number,
      ticketSubject: r.subject,
      actorName: r.who ?? null,
      at: r.at,
      read: isRead(r.at),
    });
  }

  // The two SLA kinds share a group: a ticket that is late is one piece of news,
  // whether the target is close or already missed.
  return condense(events, (kind) => (kind.startsWith("sla") ? "sla" : kind));
}

/** The same feed, as sentences for the web topbar. */
export async function agentNotifications(
  tenantId: string,
  agentId: string,
  readAt: Date | null,
  t: Translate,
): Promise<{ items: ShellNotification[]; unread: number }> {
  const events = await agentNotificationEvents(tenantId, agentId, readAt);
  const items = events.map((event): ShellNotification => {
    const href = `/app/tickets/${event.ticketNumber}`;
    const at = t.fmt.relative(event.at);
    const number = String(event.ticketNumber);
    switch (event.kind) {
      case "sla_breached":
      case "sla_warning":
        return {
          id: event.id,
          at,
          href,
          tone: event.kind === "sla_breached" ? "dang" : "wait",
          text: t(
            event.kind === "sla_breached"
              ? "app.shell.notifSlaBreached"
              : "app.shell.notifSlaWarning",
            { number, subject: event.ticketSubject },
          ),
        };
      case "customer_reply":
        return {
          id: event.id,
          at,
          href,
          tone: "mute",
          text: t("app.shell.notifCustomerReplied", {
            who: event.actorName ?? t("app.ticket.authorContact"),
            number,
          }),
        };
      case "internal_note":
        return {
          id: event.id,
          at,
          href,
          tone: "open",
          text: t("app.shell.notifInternalNote", {
            who: event.actorName ?? t("app.ticket.authorAgent"),
            number,
          }),
        };
    }
  });
  return { items, unread: events.filter((e) => !e.read).length };
}

/**
 * What a customer wants to hear about (MC-04): somebody answered, and the
 * request they were waiting on was resolved.
 *
 * Their own messages are not news to them, and neither is anything on a
 * colleague's request — a shared organization lets someone READ their company's
 * requests, which is not the same as being notified about them.
 */
export async function contactNotificationEvents(
  tenantId: string,
  contactId: string,
  readAt: Date | null,
): Promise<NotificationEvent<ContactNotificationKind>[]> {
  const theirs = and(eq(tickets.tenantId, tenantId), eq(tickets.requesterId, contactId));

  const [replyRows, resolvedRows] = await Promise.all([
    db
      .select({
        id: ticketMessages.id,
        at: ticketMessages.createdAt,
        number: tickets.number,
        subject: tickets.subject,
        who: users.name,
      })
      .from(ticketMessages)
      .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
      .leftJoin(users, eq(users.id, ticketMessages.authorId))
      .where(
        and(
          theirs,
          eq(ticketMessages.kind, "public_reply"),
          eq(ticketMessages.authorType, "agent"),
        ),
      )
      .orderBy(desc(ticketMessages.createdAt))
      .limit(MAX),

    db
      .select({
        number: tickets.number,
        subject: tickets.subject,
        at: tickets.resolvedAt,
      })
      .from(tickets)
      .where(and(theirs, isNotNull(tickets.resolvedAt)))
      .orderBy(desc(tickets.resolvedAt))
      .limit(MAX),
  ]);

  const events: NotificationEvent<ContactNotificationKind>[] = [];
  const isRead = (at: Date) => (readAt ? at <= readAt : false);

  for (const r of replyRows) {
    events.push({
      id: `reply-${r.id}`,
      kind: "agent_reply",
      ticketNumber: r.number,
      ticketSubject: r.subject,
      actorName: r.who ?? null,
      at: r.at,
      read: isRead(r.at),
    });
  }
  for (const r of resolvedRows) {
    if (!r.at) continue;
    events.push({
      id: `resolved-${r.number}`,
      kind: "resolved",
      ticketNumber: r.number,
      ticketSubject: r.subject,
      actorName: null,
      at: r.at,
      read: isRead(r.at),
    });
  }

  return condense(events, (kind) => kind);
}
