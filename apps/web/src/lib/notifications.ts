/**
 * The agent's notification feed (V2 topbar).
 *
 * Derived, not stored. Every line of this feed is something the database already
 * records — an SLA that was breached, a note a colleague left, a customer who
 * answered — so a `notifications` table would have been a second copy of those
 * facts, free to drift from them and needing a writer at every call site that
 * could ever produce one. Reading them back costs four indexed queries.
 *
 * The consequence is that "read" cannot be per-item: there is no row to mark. It
 * is a waterline instead — `users.notifications_read_at` — and anything older
 * than it counts as read. That is the honest meaning of the "mark all read"
 * button the design draws, and the only one this shape supports.
 */
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { contacts, db, ticketMessages, tickets, users } from "@openhelpdesk/db";
import type { ShellNotification } from "@/components/app-shell";
import type { getT } from "@/i18n/server";

const OPEN_STATUSES = ["new", "open", "waiting", "on_hold"] as const;
const MAX = 8;

type Translate = Awaited<ReturnType<typeof getT>>;

export async function agentNotifications(
  tenantId: string,
  agentId: string,
  readAt: Date | null,
  t: Translate,
): Promise<{ items: ShellNotification[]; unread: number }> {
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

  const items: (ShellNotification & { when: Date })[] = [];

  for (const r of slaRows) {
    const when = r.breached ?? r.warned;
    if (!when) continue;
    items.push({
      id: `sla-${r.number}`,
      when,
      at: t.fmt.relative(when),
      href: `/app/tickets/${r.number}`,
      tone: r.breached ? "dang" : "wait",
      text: t(r.breached ? "app.shell.notifSlaBreached" : "app.shell.notifSlaWarning", {
        number: String(r.number),
        subject: r.subject,
      }),
    });
  }

  for (const r of replyRows) {
    items.push({
      id: `reply-${r.id}`,
      when: r.at,
      at: t.fmt.relative(r.at),
      href: `/app/tickets/${r.number}`,
      tone: "mute",
      text: t("app.shell.notifCustomerReplied", {
        who: r.who ?? r.email ?? t("app.ticket.authorContact"),
        number: String(r.number),
      }),
    });
  }

  for (const r of noteRows) {
    items.push({
      id: `note-${r.id}`,
      when: r.at,
      at: t.fmt.relative(r.at),
      href: `/app/tickets/${r.number}`,
      tone: "open",
      text: t("app.shell.notifInternalNote", {
        who: r.who ?? t("app.ticket.authorAgent"),
        number: String(r.number),
      }),
    });
  }

  items.sort((a, b) => b.when.getTime() - a.when.getTime());

  // One line per ticket and per kind. Three "Julien replied on #4821" in a row is
  // one piece of news told three times, and it pushes the other tickets out of a
  // panel that only holds a handful.
  const kept = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    const kind = item.id.split("-")[0];
    const key = `${kind}:${item.href}`;
    if (!kept.has(key)) kept.set(key, item);
  }
  const top = [...kept.values()].slice(0, MAX);
  const unread = readAt ? top.filter((i) => i.when > readAt).length : top.length;

  return {
    items: top.map(({ when: _when, ...rest }) => rest),
    unread,
  };
}
