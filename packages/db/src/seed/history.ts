/**
 * Demonstration history — 90 days of activity for the Acme Support workspace.
 *
 * Without it, Reports (AG-09), the heatmap and SLA compliance are empty: the design
 * shows an active workspace, not a brand-new one. The tickets are numbered BELOW
 * #4821 (the reference ticket of the screenshots stays the most recent one).
 *
 * Fully deterministic (congruential generator with a fixed seed): two runs produce
 * exactly the same data set, the condition for the demo to stay frozen.
 */
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../client";
import { contacts, csatResponses, ticketMessages, tickets, users } from "../schema/app";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** First number of the history — #4821 stays the most recent ticket. */
const FIRST_NUMBER = 4300;
const LAST_NUMBER = 4816;

/** Linear congruential generator (Numerical Recipes) — reproducible. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return {
    /** Float in [0, 1). */
    next(): number {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    int(maxExclusive: number): number {
      return Math.floor(this.next() * maxExclusive);
    },
    /** Draws an entry according to integer weights. */
    weighted<T>(entries: [T, number][]): T {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = this.next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
    pick<T>(items: T[]): T {
      return items[this.int(items.length)]!;
    },
  };
}

const SUBJECTS = [
  "Invoice PDF export is unreadable",
  "Cannot reset my password",
  "Adding a user to the account",
  "Duplicate invoice for the month of June",
  "Error 500 when opening the dashboard",
  "Quote request for 20 licences",
  "The date filter returns nothing",
  "Synchronisation has been stopped since yesterday",
  "Question about the retention policy",
  "Change of billing address",
  "CSV import rejected with no error message",
  "No notifications received since the update",
  "Request for API access",
  "Order list is slow",
  "Deleting a collaborator account",
  "問題 with non-ASCII characters in the export",
  "Following up on the previous ticket",
  "Accounting connector is down",
  "Missing documentation on webhooks",
  "Request for a phone call back",
];

const TYPES = ["Question", "Incident", "Task", "Other"];

const COMMENTS_GOOD = [
  "Quick and effective answer, thank you.",
  "Problem solved on the first try.",
  "Very good follow-up, I recommend it.",
  null,
  null,
];
const COMMENTS_BAD = [
  "Took too long to get an answer.",
  "The problem came back two days later.",
  null,
];

/**
 * Creates the history if it is missing. Idempotent: nothing is done if tickets in
 * the history range already exist.
 */
export async function installDemoHistory(tenantId: string): Promise<number> {
  const existing = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        eq(tickets.tenantId, tenantId),
        gte(tickets.number, FIRST_NUMBER),
        lt(tickets.number, LAST_NUMBER),
      ),
    );
  if (existing.length > 20) return 0;

  const agentRows = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  const agentIds = agentRows.filter((a) => a.status === "active" && a.role !== "viewer").map((a) => a.id);

  const contactRows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId));
  const contactIds = contactRows.map((c) => c.id);
  if (agentIds.length === 0 || contactIds.length === 0) return 0;

  // Demonstration agent: the one used to sign in for the review.
  const [demoRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, "claire.bonnet@acme.example")));
  const demoAgentId = demoRow?.id ?? agentIds[0]!;

  const taken = new Set(existing.map(() => 0));
  const used = await db
    .select({ number: tickets.number })
    .from(tickets)
    .where(eq(tickets.tenantId, tenantId));
  for (const row of used) taken.add(row.number);

  const rnd = makeRandom(20260816);
  const now = Date.now();
  const newTickets: (typeof tickets.$inferInsert)[] = [];
  const pending: {
    number: number;
    contactId: string;
    subject: string;
    createdAt: Date;
    resolvedAt: Date | null;
    agentId: string;
  }[] = [];

  for (let number = FIRST_NUMBER; number <= LAST_NUMBER; number++) {
    if (taken.has(number)) continue;

    // The last 22 numbers form the current queue: tickets from the last 3 days, still
    // open, mostly assigned to the demonstration agent — without them the landing
    // screen "My tickets" is empty where the design shows it full.
    const isCurrentQueue = number > LAST_NUMBER - 22;

    // Spread over 90 days: increasing numbers are more recent.
    const progress = (number - FIRST_NUMBER) / (LAST_NUMBER - FIRST_NUMBER);
    const daysAgo = isCurrentQueue
      ? rnd.int(4)
      : Math.max(2, Math.round(90 - progress * 90 + (rnd.next() * 6 - 3)));

    // Business hours: 8:00 → 18:00, a dip at noon, very little on weekends.
    const dayStart = new Date(now - daysAgo * DAY);
    dayStart.setHours(0, 0, 0, 0);
    const weekday = dayStart.getDay();
    if (!isCurrentQueue && (weekday === 0 || weekday === 6) && rnd.next() > 0.12) continue;

    const hour = rnd.weighted<number>([
      [8, 6], [9, 12], [10, 14], [11, 13], [12, 5], [13, 6],
      [14, 13], [15, 12], [16, 10], [17, 8], [18, 3],
    ]);
    const createdAt = new Date(dayStart.getTime() + hour * HOUR + rnd.int(60) * 60 * 1000);
    if (createdAt.getTime() > now) continue;

    // The demonstration agent (the first one registered) carries half of the current queue.
    const agentId = isCurrentQueue && rnd.next() < 0.5 ? demoAgentId : rnd.pick(agentIds);
    const contactId = rnd.pick(contactIds);
    const priority = rnd.weighted([
      ["low", 12],
      ["normal", 58],
      ["high", 22],
      ["urgent", 8],
    ] as [("low" | "normal" | "high" | "urgent"), number][]);
    const channel = rnd.weighted([
      ["email", 55],
      ["portal", 25],
      ["widget", 13],
      ["api", 7],
    ] as [("email" | "portal" | "widget" | "api"), number][]);

    // SLA targets by priority (consistent with the default policy).
    const firstReplyTargetH = priority === "urgent" ? 0.5 : priority === "high" ? 2 : 4;
    const resolveTargetH = priority === "urgent" ? 4 : priority === "high" ? 8 : 48;

    // ~92% of the replies hold the target; the others overshoot it clearly.
    const onTime = rnd.next() < 0.92;
    const firstReplyH = onTime
      ? firstReplyTargetH * (0.15 + rnd.next() * 0.7)
      : firstReplyTargetH * (1.2 + rnd.next() * 2);
    const firstRepliedAt = new Date(createdAt.getTime() + firstReplyH * HOUR);

    // A past ticket is NEVER left open: otherwise its SLA deadline, computed at
    // creation, would be weeks overdue and the whole queue would look like it is on
    // fire. Only the last five days carry tickets in progress.
    let status = isCurrentQueue
      ? rnd.weighted([
          ["open", 42],
          ["waiting", 22],
          ["new", 24],
          ["on_hold", 6],
          ["resolved", 6],
        ] as ["open" | "waiting" | "new" | "on_hold" | "resolved", number][])
      : rnd.weighted(
      daysAgo > 21
        ? ([["closed", 82], ["resolved", 18]] as ["closed" | "resolved", number][])
        : daysAgo > 5
          ? ([["closed", 42], ["resolved", 58]] as ["closed" | "resolved", number][])
          : ([
              ["resolved", 46],
              ["open", 24],
              ["waiting", 16],
              ["on_hold", 4],
              ["new", 10],
            ] as ["resolved" | "open" | "waiting" | "on_hold" | "new", number][]),
    );

    // Guard rail: a still-open ticket whose deadline is far behind does not exist in
    // a healthy queue. A slight overshoot (< 12 h) is tolerated so that the
    // "Breaching soon" view and the red badges have something to show.
    let resolveDueAt = new Date(createdAt.getTime() + resolveTargetH * HOUR);
    const stillOpen = status !== "resolved" && status !== "closed";
    if (stillOpen && resolveDueAt.getTime() < now - 12 * HOUR) {
      // In the current queue the deadline is pushed back (the ticket has just been
      // requalified); elsewhere, a ticket that old would have been handled long ago.
      if (isCurrentQueue) {
        resolveDueAt = new Date(now + (2 + rnd.next() * 30) * HOUR);
      } else {
        status = "resolved";
      }
    }

    const resolvedAt =
      status === "resolved" || status === "closed"
        ? new Date(
            createdAt.getTime() +
              resolveTargetH * HOUR * (onTime ? 0.2 + rnd.next() * 0.7 : 1.1 + rnd.next() * 1.5),
          )
        : null;
    if (resolvedAt && resolvedAt.getTime() > now) continue;
    const closedAt =
      status === "closed" && resolvedAt ? new Date(resolvedAt.getTime() + 4 * DAY) : null;

    const replied = status !== "new";
    const subject = rnd.pick(SUBJECTS);

    newTickets.push({
      tenantId,
      number,
      subject,
      status,
      priority,
      channel,
      type: rnd.pick(TYPES),
      requesterId: contactId,
      assigneeId: status === "new" ? null : agentId,
      createdAt,
      updatedAt: closedAt ?? resolvedAt ?? firstRepliedAt,
      firstRepliedAt: replied ? firstRepliedAt : null,
      firstReplyDueAt: new Date(createdAt.getTime() + firstReplyTargetH * HOUR),
      resolveDueAt,
      resolvedAt,
      closedAt: closedAt && closedAt.getTime() <= now ? closedAt : null,
    });
    pending.push({ number, contactId, subject, createdAt, resolvedAt, agentId });
  }

  if (newTickets.length === 0) return 0;

  // Batched insert (a 500-row INSERT exceeds the parameter limits).
  const inserted: { id: string; number: number }[] = [];
  for (let i = 0; i < newTickets.length; i += 60) {
    const batch = await db
      .insert(tickets)
      .values(newTickets.slice(i, i + 60))
      .onConflictDoNothing()
      .returning({ id: tickets.id, number: tickets.number });
    inserted.push(...batch);
  }
  const idByNumber = new Map(inserted.map((t) => [t.number, t.id]));

  // One opening message per ticket: the detail view must never be empty.
  const messages: (typeof ticketMessages.$inferInsert)[] = [];
  const responses: (typeof csatResponses.$inferInsert)[] = [];
  for (const t of pending) {
    const ticketId = idByNumber.get(t.number);
    if (!ticketId) continue;
    messages.push({
      tenantId,
      ticketId,
      kind: "public_reply",
      authorType: "contact",
      authorId: t.contactId,
      source: "email",
      bodyText: `${t.subject} — could you have a look? Thanks in advance.`,
      createdAt: t.createdAt,
    });

    // CSAT survey on ~38% of the solved tickets, 88% satisfied.
    if (t.resolvedAt && rnd.next() < 0.38) {
      const good = rnd.next() < 0.88;
      const answeredAt = new Date(t.resolvedAt.getTime() + (2 + rnd.next() * 20) * HOUR);
      if (answeredAt.getTime() <= now) {
        responses.push({
          tenantId,
          ticketId,
          agentId: t.agentId,
          score: good ? "good" : "bad",
          comment: good ? rnd.pick(COMMENTS_GOOD) : rnd.pick(COMMENTS_BAD),
          createdAt: answeredAt,
        });
      }
    }
  }

  for (let i = 0; i < messages.length; i += 60) {
    await db.insert(ticketMessages).values(messages.slice(i, i + 60));
  }
  for (let i = 0; i < responses.length; i += 60) {
    await db.insert(csatResponses).values(responses.slice(i, i + 60));
  }

  return inserted.length;
}
