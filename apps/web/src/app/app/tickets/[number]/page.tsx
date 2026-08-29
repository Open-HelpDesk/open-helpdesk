import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, kbArticles } from "@openhelpdesk/db";
import { isManager, requireAgent } from "@/lib/session";
import {
  DEFAULT_VIEWS,
  getTicketByNumber,
  listContactNotes,
  listMacrosForEditor,
  listTicketLinks,
  listTicketTasks,
  sameOrgTickets,
  viewTicketNumbers,
  type ViewKey,
} from "@/lib/data";
import {
  CHANNEL_KEYS,
  PRIORITY_KEYS,
  PRIORITY_TOKEN,
  STATUS_KEYS,
  STATUS_TOKEN,
  duration,
} from "@/lib/format";
import { getT, type Translate } from "@/i18n/server";
import { Avatar, PANEL_CARD, PANEL_GROUP } from "@/components/ticket-bits";
import { BreadcrumbLeaf } from "@/components/app-shell";
import { TicketMoreMenu } from "./header-tools";
import { MessageAttachments, type AttachmentData } from "./attachments";
import { PropsForm } from "./props-panel";
import { TasksPanel, type TaskRow } from "./tasks-panel";
import {
  SidePanels,
  type LinkedTicket,
  type PinnedNote,
  type SlaEvent,
} from "./side-panels";
import { updateTicketProps } from "../actions";
import { resolveTicket } from "./resolve-actions";
import { ReplyEditor } from "./reply-editor";

/**
 * AG-04 — Ticket detail (agent space design): 2-row header with chips and
 * ←/→ navigation, customer/agent/note/events thread, attachments with viewer,
 * tabbed composer with split button, 304 px properties panel.
 */

/**
 * One SLA target of the details card: a name, a verdict badge, the bar of what
 * is left of the clock, and the instants underneath.
 *
 * The bar only appears while there is something to watch. A target that was met
 * is a fact, not a countdown — drawing a full green bar under it would ask the
 * agent to read a gauge whose answer the badge already gives.
 */
function SlaFact({
  label,
  due,
  doneAt,
  createdAt,
  now,
  t,
}: {
  label: string;
  due: Date;
  doneAt: Date | null;
  createdAt: Date;
  now: number;
  t: Translate;
}) {
  const missed = doneAt ? doneAt.getTime() > due.getTime() : due.getTime() < now;
  const met = doneAt !== null && !missed;
  const remaining = due.getTime() - now;
  const urgent = !doneAt && !missed && remaining < 30 * 60_000;

  const tone = missed ? "dang" : met ? "ok" : urgent ? "wait" : "ok";
  const badge = met
    ? t("app.ticket.slaMet", {
        duration: duration(t, Math.max(60_000, doneAt.getTime() - createdAt.getTime())),
      })
    : missed
      ? t("app.ticket.slaMissed", {
          duration: duration(t, (doneAt ? doneAt.getTime() : now) - due.getTime()),
        })
      : t("app.ticket.slaPending", { duration: duration(t, remaining) });

  const span = due.getTime() - createdAt.getTime();
  const elapsed = (doneAt ? doneAt.getTime() : now) - createdAt.getTime();
  const filled = missed ? 100 : Math.min(100, Math.max(2, (elapsed / Math.max(1, span)) * 100));

  return (
    <div className="flex flex-col" style={{ gap: 4 }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
        <span
          className="whitespace-nowrap tabular-nums"
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            background: `var(--${tone}-t)`,
            color: `var(--${tone})`,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {badge}
        </span>
      </div>
      {!met && (
        <div
          className="overflow-hidden"
          style={{ height: 5, borderRadius: 3, background: "var(--sunk)" }}
          aria-hidden
        >
          <div style={{ width: `${filled}%`, height: "100%", background: `var(--${tone})` }} />
        </div>
      )}
      <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
        {doneAt
          ? t("app.ticket.slaTargetDone", {
              when: t.fmt.messageTime(doneAt),
              target: t.fmt.messageTime(due),
            })
          : missed
            ? t("app.ticket.slaTargetMissed", { target: t.fmt.messageTime(due) })
            : t("app.ticket.slaTargetPending", { target: t.fmt.messageTime(due) })}
      </span>
    </div>
  );
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ view?: string; tab?: string; compose?: string }>;
}) {
  const t = await getT();
  const { tenant, agent } = await requireAgent();
  const { number: numberParam } = await params;
  const { view: viewParam, tab: tabParam, compose } = await searchParams;
  const number = Number(numberParam);
  if (!Number.isInteger(number)) notFound();

  const view: ViewKey = (DEFAULT_VIEWS.find((v) => v.key === viewParam)?.key ??
    "mine") as ViewKey;

  const [data, editorMacros, viewNumbers] = await Promise.all([
    getTicketByNumber(tenant.id, number),
    listMacrosForEditor(tenant.id),
    viewTicketNumbers(tenant.id, view, agent.id),
  ]);
  if (!data) notFound();
  const {
    ticket,
    requester,
    organization,
    messages,
    attachmentsByMessage,
    agents,
    teams,
    requesterTicketCount,
    recentRequesterTickets,
    mergedIntoNumber,
  } = data;

  /**
   * V2 — four tabs where there used to be one stream.
   *
   * A fired rule, an SLA warning or a merge was pushed between two customer
   * messages as a centred grey line. On a busy ticket that machine chatter is
   * most of what you scroll past, and none of it is what the customer said. The
   * conversation keeps the messages; the rest gets its own tab.
   */
  const TABS = ["conversation", "tasks", "activity", "resolution"] as const;
  type Tab = (typeof TABS)[number];
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as Tab)
    : "conversation";
  const conversation = messages.filter((m) => m.kind !== "system_event");
  const activity = messages.filter((m) => m.kind === "system_event");
  const tabHref = (next: Tab) =>
    `/app/tickets/${number}?view=${view}${next === "conversation" ? "" : `&tab=${next}`}`;

  const csatEnabled = (tenant.csatConfig as { enabled?: boolean } | null)?.enabled === true;

  const [noteRows, linkRows, orgTickets, publishedArticles] = await Promise.all([
    listContactNotes(tenant.id, requester.id),
    listTicketLinks(tenant.id, ticket.id),
    sameOrgTickets(tenant.id, ticket.organizationId, ticket.id),
    // Only published articles: proposing a draft sends the customer to a page
    // that is not there.
    db
      .select({ id: kbArticles.id, title: kbArticles.title })
      .from(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.status, "published")))
      .orderBy(asc(kbArticles.title))
      .limit(50),
  ]);

  const pinnedNotes: PinnedNote[] = noteRows.map((n) => ({
    id: n.id,
    body: n.body,
    authorName: n.authorName,
    when: t.fmt.relative(n.createdAt),
  }));

  /*
   * Explicit links first, then the tickets that merely share an organisation.
   * A ticket someone deliberately linked outranks one the data happens to
   * relate, and a ticket already linked is not repeated as "same organisation".
   */
  const explicitNumbers = new Set(linkRows.map((l) => l.number));
  const linkedTickets: LinkedTicket[] = [
    ...linkRows.map((l) => ({
      id: l.id,
      number: l.number,
      subject: l.subject,
      status: l.status,
      relation: l.relation as string,
    })),
    ...orgTickets
      .filter((o) => !explicitNumbers.has(o.number))
      .map((o) => ({
        id: null,
        number: o.number,
        subject: o.subject,
        status: o.status,
        relation: null,
      })),
  ];

  /*
   * The SLA timeline, read off the ticket's own timestamps. No new storage: each
   * of these instants is already a column, and the panel is a reading of them.
   */
  const slaEvents: SlaEvent[] = [
    ticket.slaBreachedAt && {
      when: t.fmt.dateLong(ticket.slaBreachedAt),
      label: t("app.ticket.slaEventBreached"),
      tone: "dang" as const,
    },
    ticket.slaWarnedAt && {
      when: t.fmt.dateLong(ticket.slaWarnedAt),
      label: t("app.ticket.slaEventWarned"),
      tone: "mute" as const,
    },
    ticket.firstRepliedAt && {
      when: t.fmt.dateLong(ticket.firstRepliedAt),
      label: t("app.ticket.slaEventFirstReply"),
      tone: "ok" as const,
    },
    ticket.resolvedAt && {
      when: t.fmt.dateLong(ticket.resolvedAt),
      label: t("app.ticket.slaEventResolved"),
      tone: "ok" as const,
    },
    {
      when: t.fmt.dateLong(ticket.createdAt),
      label: t("app.ticket.slaEventCreated"),
      tone: "mute" as const,
    },
  ].filter((e): e is SlaEvent => Boolean(e));
  const taskRows = await listTicketTasks(tenant.id, ticket.id);
  const openTasks = taskRows.filter((task) => !task.done).length;
  const tasks: TaskRow[] = taskRows.map((task) => ({
    id: task.id,
    label: task.label,
    done: task.done,
    dueLabel: task.dueAt ? t.fmt.dateLong(task.dueAt) : null,
    // "Urgent" is about the deadline, not the priority: today or past, and still
    // open. A finished task is never late.
    urgent: !task.done && task.dueAt !== null && task.dueAt.getTime() <= Date.now(),
    assigneeName: task.assigneeName,
  }));

  const requesterName = requester.name ?? requester.email;
  const authorName = (authorId: string | null, authorType: string) => {
    if (authorType === "contact") return requesterName;
    if (authorType === "agent")
      return agents.find((a) => a.id === authorId)?.name ?? t("app.ticket.authorAgent");
    return t("app.ticket.authorSystem");
  };

  // ←/→ navigation inside the current view.
  const idx = viewNumbers.indexOf(number);
  const prevNumber = idx > 0 ? viewNumbers[idx - 1] : null;
  const nextNumber = idx >= 0 && idx < viewNumbers.length - 1 ? viewNumbers[idx + 1] : null;

  // SLA badge of the header.
  const now = Date.now();
  const isOpen = ["new", "open", "waiting", "on_hold"].includes(ticket.status);
  const due =
    !ticket.firstRepliedAt && ticket.firstReplyDueAt
      ? ticket.firstReplyDueAt
      : ticket.resolveDueAt;
  const remaining = due ? due.getTime() - now : null;

  const navBtnStyle = {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "1px solid var(--line)",
    color: "var(--ink-2)",
    fontSize: 13,
  } as const;

  const [mergedBefore, mergedAfter] = t.parts("app.ticket.mergedBanner", "target");

  const channelKey = CHANNEL_KEYS[ticket.channel];
  const statusToken = STATUS_TOKEN[ticket.status] ?? "closed";
  const priorityToken = PRIORITY_TOKEN[ticket.priority] ?? "open";

  const customFields = (ticket.customFields ?? {}) as Record<string, unknown>;
  const fieldEntries = data.ticketFields
    .filter((f) => customFields[f.key] !== undefined && customFields[f.key] !== "")
    .map((f) => ({
      label: f.label,
      value: Array.isArray(customFields[f.key])
        ? (customFields[f.key] as unknown[]).join(", ")
        : String(customFields[f.key]),
    }));

  return (
    /* The header spans the whole screen and the two columns live under it, as
       the design draws it. Confined to the conversation column it was 300 px
       narrower, and the subject was the thing that gave way — truncated so the
       actions could keep their place.
       The thread lies on --canvas and the header floats above it on --panel: on
       a white ground the message cards were a hairline apart from their own
       background, which is why the screen read as a flat list. */
    <div className="flex h-full flex-col" style={{ background: "var(--canvas)" }}>
      {/* V2: the topbar shows where you are — "Tickets / #4821" — and the
          position in the view moved next to the ←/→ buttons, where it belongs. */}
      <BreadcrumbLeaf leaf={`#${ticket.number}`} />

      {/* V2 header — three rows: state and actions, who and when, the tabs.
          The subject moves into the title face and takes the room the chips
          used to hold; merge and copy link fold into the ⋯ menu. */}
      <header
        className="flex shrink-0 flex-col border-b"
        style={{
          padding: "14px 22px 0",
          gap: 12,
          background: "var(--panel)",
          borderColor: "var(--line)",
        }}
      >
        {/* Wraps rather than truncates: the subject is what the ticket IS, and
            "Import CSV rejeté sans mes…" was the one line of the screen an
            agent could not do without. Below ~1100 px the actions take a
            second line and the title keeps its own. */}
        <div className="flex flex-wrap items-center" style={{ gap: 12 }}>
          <Link
            href={`/app/tickets?view=${view}`}
            title={t("app.ticket.backToInbox")}
            className="ohd-hover-edge-ink grid shrink-0 place-items-center"
            style={navBtnStyle}
          >
            ←
          </Link>

          {/* The SLA badge leads, before the subject: on an overdue ticket it is
              the first thing that has to register. */}
          {isOpen && remaining !== null && (
            <span
              className="whitespace-nowrap"
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                background: remaining < 0 ? "var(--dang-t)" : "var(--wait-t)",
                color: remaining < 0 ? "var(--dang)" : "var(--wait)",
              }}
            >
              {remaining < 0
                ? t("app.ticket.slaOverdueBy", { duration: duration(t, -remaining) })
                : t("app.ticket.slaRemaining", { duration: duration(t, remaining) })}
            </span>
          )}

          <h1
            className="min-w-0"
            style={{
              fontFamily: "var(--font-title)",
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: "-.015em",
              textWrap: "pretty",
            }}
          >
            {ticket.subject}
          </h1>

          <div className="ml-auto flex flex-none items-center" style={{ gap: 8 }}>
            {!ticket.mergedIntoId && (
              <>
                <Link
                  href={`/app/tickets/${ticket.number}?view=${view}#composer`}
                  className="flex items-center font-semibold"
                  style={{
                    height: 36,
                    padding: "0 16px",
                    borderRadius: 9,
                    background: "var(--brand)",
                    fontSize: 13.5,
                  }}
                >
                  {t("app.ticket.reply")}
                </Link>
                <Link
                  href={`/app/tickets/${ticket.number}?view=${view}&compose=note#composer`}
                  className="flex items-center"
                  style={{
                    height: 36,
                    padding: "0 14px",
                    border: "1px solid var(--note-b)",
                    background: "var(--note)",
                    borderRadius: 9,
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: "var(--note-ink)",
                  }}
                >
                  {t("app.ticket.internalNote")}
                </Link>
                <Link
                  href={tabHref("resolution")}
                  className="ohd-hover-edge-ink flex items-center"
                  style={{
                    height: 36,
                    padding: "0 14px",
                    border: "1px solid var(--line)",
                    borderRadius: 9,
                    background: "var(--panel)",
                    fontSize: 13.5,
                    fontWeight: 500,
                  }}
                >
                  {t("app.ticket.tabResolution")}
                </Link>
                <TicketMoreMenu ticketId={ticket.id} ticketNumber={ticket.number} />
              </>
            )}

            {/* Position in the view sits with the arrows that move through it. */}
            <div
              className="flex items-center overflow-hidden"
              style={{ border: "1px solid var(--line)", borderRadius: 9 }}
            >
              {prevNumber ? (
                <Link
                  href={`/app/tickets/${prevNumber}?view=${view}`}
                  title={t("app.ticket.previousTicket")}
                  className="ohd-row grid place-items-center"
                  style={{ height: 36, width: 32, color: "var(--ink-2)" }}
                >
                  ‹
                </Link>
              ) : (
                <span
                  className="grid place-items-center"
                  style={{ height: 36, width: 32, color: "var(--ink-3)", opacity: 0.4 }}
                >
                  ‹
                </span>
              )}
              <span
                className="flex items-center tabular-nums"
                style={{
                  height: 36,
                  padding: "0 8px",
                  fontSize: 12,
                  color: "var(--ink-3)",
                  borderLeft: "1px solid var(--line-2)",
                  borderRight: "1px solid var(--line-2)",
                }}
              >
                {idx >= 0 ? `${idx + 1} / ${viewNumbers.length}` : `#${number}`}
              </span>
              {nextNumber ? (
                <Link
                  href={`/app/tickets/${nextNumber}?view=${view}`}
                  title={t("app.ticket.nextTicket")}
                  className="ohd-row grid place-items-center"
                  style={{ height: 36, width: 32, color: "var(--ink-2)" }}
                >
                  ›
                </Link>
              ) : (
                <span
                  className="grid place-items-center"
                  style={{ height: 36, width: 32, color: "var(--ink-3)", opacity: 0.4 }}
                >
                  ›
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Who and when, in one line. Status and priority left the header: the
            properties panel owns them, and they were being stated twice. */}
        <div
          className="flex flex-wrap items-center"
          style={{ gap: 10, fontSize: 13, color: "var(--ink-3)" }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>#{ticket.number}</span>
          <span>·</span>
          <span>
            <strong style={{ color: "var(--ink-2)", fontWeight: 600 }}>{requesterName}</strong>
            {organization ? ` — ${organization.name}` : ""}
          </span>
          <span>·</span>
          <span>
            {t("app.ticket.channelCreated", {
              channel: channelKey ? t(channelKey) : ticket.channel,
              when: t.fmt.relative(ticket.createdAt),
            })}
          </span>
        </div>

        {/* V2 tab bar — the third row of the header block, sitting ON its
            bottom edge (hence the -1 px) instead of a strip of its own. */}
        <nav className="flex items-center" style={{ gap: 2, marginBottom: -1 }}>
          {TABS.map((key) => {
            const on = key === tab;
            const label = t(
              key === "conversation"
                ? "app.ticket.tabConversation"
                : key === "tasks"
                  ? "app.ticket.tabTasks"
                  : key === "activity"
                    ? "app.ticket.chipActivity"
                    : "app.ticket.tabResolution",
            );
            const badge =
              key === "tasks" && openTasks > 0
                ? openTasks
                : key === "activity" && activity.length > 0
                  ? activity.length
                  : null;
            return (
              <Link
                key={key}
                href={tabHref(key)}
                aria-current={on ? "page" : undefined}
                style={{
                  padding: "10px 15px",
                  fontSize: 13.5,
                  fontWeight: on ? 600 : 450,
                  color: on ? "var(--brand)" : "var(--ink-3)",
                  borderBottom: `2px solid ${on ? "var(--brand)" : "transparent"}`,
                }}
              >
                {label}
                {badge !== null && (
                  <span style={{ marginLeft: 6, fontSize: 11.5, color: "var(--ink-3)" }}>
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Merge banner */}
      {ticket.mergedIntoId && (
        <div
          className="flex shrink-0 items-center border-b"
          style={{
            gap: 8,
            padding: "9px 18px",
            fontSize: 13,
            background: "var(--pause-t)",
            borderColor: "var(--line)",
            color: "var(--ink-2)",
          }}
        >
          {mergedBefore}
          {mergedIntoNumber ? (
            <Link href={`/app/tickets/${mergedIntoNumber}`} className="font-semibold underline">
              #{mergedIntoNumber}
            </Link>
          ) : (
            t("app.ticket.mergedUnknownTarget")
          )}
          {mergedAfter}
        </div>
      )}

      {/* Below xl the two columns stack instead of sitting side by side — the
          properties panel used to be absent from the DOM entirely, and the
          agent lost assignee, team, priority, SLA and contact record with no
          fallback at all. Stacked, the row stops being a flex box: the thread
          then takes the height of its own content and the panel follows it,
          instead of both fighting over one screenful. */}
      <div className="flex min-h-0 flex-1 overflow-hidden max-xl:block max-xl:overflow-y-auto">
        {/* The thread and the other three tabs share this scroll. Each sets its
            own measure inside it — 860 for the thread: full width, a reply ran
            past 1000 px and the eye lost the start of the next line. */}
        <div
          className="flex min-w-0 flex-1 flex-col overflow-y-auto max-xl:overflow-y-visible"
          style={{ padding: "20px 22px 28px" }}
        >
          {tab === "tasks" ? (
            <TasksPanel number={ticket.number} tasks={tasks} agents={agents} meId={agent.id} />
          ) : tab === "resolution" ? (
            <div className="flex flex-col" style={{ maxWidth: 720, gap: 14 }}>
              {ticket.resolvedAt ? (
                <div
                  className="flex flex-wrap items-center"
                  style={{
                    gap: 13,
                    padding: "16px 18px",
                    border: "1px solid var(--ok)",
                    background: "var(--ok-t)",
                    borderRadius: 14,
                  }}
                >
                  <span
                    className="grid place-items-center font-bold"
                    style={{
                      width: 26,
                      height: 26,
                      flex: "none",
                      borderRadius: "50%",
                      background: "var(--ok)",
                      color: "var(--on-ok)",
                      fontSize: 13,
                    }}
                  >
                    ✓
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
                    {/* The design names who resolved it. The product does not
                        record that, and inventing a name on a resolution card is
                        worse than leaving it out — so the date stands alone until
                        there is an author to show. */}
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ok)" }}>
                      {t("app.ticket.resolutionResolved", {
                        date: t.fmt.dateLong(ticket.resolvedAt),
                      })}
                    </span>
                    {csatEnabled && (
                      <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                        {t("app.ticket.resolutionCsatNote")}
                      </span>
                    )}
                  </div>
                  <form action={updateTicketProps}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="number" value={ticket.number} />
                    <input type="hidden" name="status" value="open" />
                    <button
                      type="submit"
                      className="ohd-hover-edge-ink flex items-center"
                      style={{
                        height: 34,
                        padding: "0 14px",
                        border: "1px solid var(--line)",
                        borderRadius: 9,
                        background: "var(--panel)",
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      {t("app.ticket.resolutionReopen")}
                    </button>
                  </form>
                </div>
              ) : (
                /* One form: the cause, the article, what the customer is told,
                   the survey switch and the button that commits all of it. Split
                   across several, half of it would be saved and half not. */
                <form action={resolveTicket} className="flex flex-col" style={{ gap: 14 }}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="number" value={ticket.number} />

                  <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <label className="flex flex-col" style={{ gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
                        {t("app.ticket.resolutionCause")}
                      </span>
                      <select
                        name="cause"
                        defaultValue=""
                        style={{
                          height: 40,
                          padding: "0 12px",
                          border: "1px solid var(--line)",
                          borderRadius: 9,
                          background: "var(--panel)",
                          fontSize: 13.5,
                        }}
                      >
                        <option value="">{t("app.ticket.resolutionNone")}</option>
                        <option value="product_bug">{t("app.ticket.causeProductBug")}</option>
                        <option value="configuration">{t("app.ticket.causeConfiguration")}</option>
                        <option value="user_error">{t("app.ticket.causeUserError")}</option>
                        <option value="third_party">{t("app.ticket.causeThirdParty")}</option>
                        <option value="duplicate">{t("app.ticket.causeDuplicate")}</option>
                        <option value="no_fault_found">{t("app.ticket.causeNoFault")}</option>
                      </select>
                    </label>

                    <label className="flex min-w-0 flex-col" style={{ gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
                        {t("app.ticket.resolutionArticle")}
                      </span>
                      <select
                        name="articleId"
                        defaultValue=""
                        style={{
                          height: 40,
                          padding: "0 12px",
                          border: "1px solid var(--line)",
                          borderRadius: 9,
                          background: "var(--panel)",
                          fontSize: 13.5,
                        }}
                      >
                        <option value="">{t("app.ticket.resolutionNone")}</option>
                        {publishedArticles.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="flex flex-col" style={{ gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
                      {t("app.ticket.resolutionSummary")}{" "}
                      <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>
                        {t("app.ticket.resolutionSummaryHint")}
                      </span>
                    </span>
                    <textarea
                      name="summary"
                      rows={4}
                      className="w-full resize-y outline-none"
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: 10,
                        background: "var(--panel)",
                        padding: "12px 13px",
                        fontSize: 13.5,
                        lineHeight: 1.6,
                      }}
                    />
                  </label>

                  {/* Tells the action the question was asked, so an unchecked box
                      means "no" and an absent box means "not asked". */}
                  {csatEnabled && <input type="hidden" name="csatShown" value="1" />}
                  {csatEnabled && (
                    <label className="flex items-center" style={{ gap: 10 }}>
                      <input
                        type="checkbox"
                        name="sendCsat"
                        defaultChecked
                        style={{ width: 18, height: 18, accentColor: "var(--brand)" }}
                      />
                      <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                        {t("app.ticket.resolutionCsatCheck")}
                      </span>
                    </label>
                  )}

                  {openTasks > 0 && (
                    <p
                      style={{
                        padding: "11px 14px",
                        background: "var(--wait-t)",
                        borderRadius: 10,
                        fontSize: 13,
                        color: "var(--wait)",
                      }}
                    >
                      {t("app.ticket.resolutionPending", { count: openTasks })}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="flex items-center self-start font-semibold"
                    style={{
                      height: 40,
                      padding: "0 18px",
                      borderRadius: 9,
                      background: "var(--ok)",
                      color: "var(--on-ok)",
                      fontSize: 13.5,
                    }}
                  >
                    {t("app.ticket.resolutionMark")}
                  </button>
                </form>
              )}
            </div>
          ) : tab === "activity" ? (
            <div className="flex flex-col" style={{ gap: 14 }}>
              {activity.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 460 }}>
                  {t("app.ticket.activityEmpty")}
                </p>
              ) : (
                /* A rail with one dot per entry: a timeline reads as a sequence,
                   which is what these entries are — unlike the centred dividers
                   they used to be, which read as breaks in the conversation.
                   The hour takes its own column and the entry a card: on the
                   grey ground of V2 a bare line of text had nothing to sit on. */
                /* A grid, not a stack of rows: the hour column then takes the
                   width of the longest instant, so the rail stays plumb
                   whatever the language writes into it. */
                <ol
                  className="grid"
                  style={{
                    maxWidth: 760,
                    flexShrink: 0,
                    gridTemplateColumns: "max-content 9px minmax(0,1fr)",
                    columnGap: 12,
                  }}
                >
                  {activity.map((m, i) => (
                    <li key={m.id} className="contents">
                      <span
                        className="whitespace-nowrap text-right tabular-nums"
                        style={{ paddingTop: 10, fontSize: 12, color: "var(--ink-3)" }}
                      >
                        {t.fmt.messageTime(m.createdAt)}
                      </span>
                      <span className="flex flex-col items-center" aria-hidden>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            marginTop: 13,
                            borderRadius: 999,
                            background: "var(--line-2)",
                            border: "1px solid var(--line)",
                          }}
                        />
                        {i < activity.length - 1 && (
                          <span className="w-px flex-1" style={{ background: "var(--line)" }} />
                        )}
                      </span>
                      <span className="min-w-0" style={{ paddingBottom: 10 }}>
                        <span
                          className="block"
                          style={{
                            border: "1px solid var(--line)",
                            borderRadius: 11,
                            background: "var(--panel)",
                            padding: "10px 14px",
                            fontSize: 13,
                            lineHeight: 1.55,
                            color: "var(--ink-2)",
                            textWrap: "pretty",
                          }}
                        >
                          {m.bodyText}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <Link
                href={tabHref("conversation")}
                className="self-start hover:underline"
                style={{ fontSize: 12.5, color: "var(--brand-2)" }}
              >
                ← {t("app.ticket.activityBack")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col" style={{ maxWidth: 860, gap: 12 }}>
            {conversation.map((m, i) => {
              const isNote = m.kind === "internal_note";
              const isAgent = m.authorType === "agent";
              const name = authorName(m.authorId, m.authorType);
              const atts = (attachmentsByMessage.get(m.id) ?? []) as AttachmentData[];
              const line = isNote ? "var(--note-b)" : isAgent ? "var(--brand-b)" : "var(--line)";
              const badge = isNote
                ? t("app.ticket.internalNote")
                : isAgent
                  ? t("app.ticket.authorAgent")
                  : null;
              return (
                <div key={m.id} className="flex" style={{ gap: 12, flexShrink: 0 }}>
                  {/* Avatar column with a rail: V2 threads every message onto one
                      line instead of alternating left and right, so a long
                      exchange reads as a single conversation rather than a chat. */}
                  <div
                    className="flex flex-none flex-col items-center"
                    style={{ width: 32, gap: 6 }}
                  >
                    <Avatar name={name} size={32} fontSize={10.5} />
                    {i < conversation.length - 1 && (
                      <span className="w-px flex-1" style={{ background: "var(--line)" }} />
                    )}
                  </div>

                  <article
                    className="flex min-w-0 flex-1 flex-col"
                    style={{
                      gap: 7,
                      border: `1px solid ${line}`,
                      background: isNote ? "var(--note)" : "var(--panel)",
                      borderRadius: 14,
                      padding: "13px 16px",
                      boxShadow: "0 1px 2px rgba(13,28,23,.03)",
                    }}
                  >
                    <div className="flex items-center" style={{ gap: 9 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</span>
                      {badge && (
                        <span
                          className="uppercase"
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            // --note-b and --note-ink: the design's fixed
                            // #F5E9BE was a pale yellow under a pale yellow ink
                            // once the dark theme was on. The pair is valued per
                            // theme and contrasts in both.
                            background: isNote ? "var(--note-b)" : "var(--brand-t)",
                            color: isNote ? "var(--note-ink)" : "var(--brand)",
                            fontSize: 10.5,
                            fontWeight: 700,
                            letterSpacing: ".04em",
                          }}
                        >
                          {badge}
                        </span>
                      )}
                      <span className="flex-1" />
                      {/* The hour, not "last week": on a ticket whose SLA is
                          counted in hours, when a reply went out is the fact
                          being read — and the relative form threw it away. */}
                      <span
                        className="whitespace-nowrap tabular-nums"
                        style={{ fontSize: 12, color: "var(--ink-3)" }}
                        title={t.fmt.relative(m.createdAt)}
                      >
                        {t.fmt.messageTime(m.createdAt)}
                      </span>
                    </div>

                    <p
                      className="whitespace-pre-wrap"
                      style={{
                        fontSize: 14,
                        lineHeight: 1.65,
                        color: "var(--ink)",
                        textWrap: "pretty",
                        // Emails carry things that do not break at a space —
                        // tracking URLs, references, base64 — and `normal`
                        // wrapping ran them past the bubble, where the overflow
                        // was clipped without a scrollbar to hint at it.
                        overflowWrap: "anywhere",
                      }}
                    >
                      {m.bodyText}
                    </p>

                    <MessageAttachments
                      attachments={atts}
                      senderName={name}
                      borderColor={line}
                    />
                  </article>
                </div>
              );
            })}

            {/* The composer closes the thread instead of being docked under it:
                it is the next card of the same stack. */}
            {!ticket.mergedIntoId && (
              <ReplyEditor
                ticketId={ticket.id}
                ticketNumber={ticket.number}
                contactName={requesterName}
                agentName={agent.name ?? agent.email}
                macros={editorMacros}
                initialKind={compose === "note" ? "internal_note" : "public_reply"}
              />
            )}
            </div>
          )}
        </div>

        {/* V2 — five panels behind five icons. The details panel keeps what
            the single column used to hold; the requester, pinned notes, the
            SLA timeline and linked tickets each get their own. */}
        <SidePanels
          number={ticket.number}
          ticketId={ticket.id}
          requester={{
            id: requester.id,
            name: requesterName,
            email: requester.email,
            phone: requester.phone,
            organizationName: organization?.name ?? null,
            ticketCount: requesterTicketCount,
            recent: recentRequesterTickets.map((r) => ({
              number: r.number,
              subject: r.subject,
              status: r.status,
              when: t.fmt.relative(r.updatedAt),
            })),
          }}
          notes={pinnedNotes}
          linked={linkedTickets}
          slaEvents={slaEvents}
          details={
            <>
            {/* 1. Where the ticket stands: the two pills, then the clocks. */}
            <section className="flex flex-col" style={{ ...PANEL_CARD, padding: "15px 16px", gap: 12 }}>
              <div className="flex flex-wrap items-center" style={{ gap: 9 }}>
                <span
                  className="inline-flex items-center whitespace-nowrap"
                  style={{
                    gap: 6,
                    padding: "4px 11px 4px 9px",
                    borderRadius: 999,
                    background: `var(--${statusToken}-t)`,
                    color: `var(--${statusToken})`,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: `var(--${statusToken})`,
                    }}
                  />
                  {t(STATUS_KEYS[ticket.status] ?? "app.status.open")}
                </span>
                <span
                  className="inline-flex items-center whitespace-nowrap"
                  style={{
                    gap: 6,
                    padding: "4px 11px",
                    borderRadius: 999,
                    background: `var(--${priorityToken}-t)`,
                    color: `var(--${priorityToken})`,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{ width: 6, height: 6, background: `var(--${priorityToken})` }}
                  />
                  {t(PRIORITY_KEYS[ticket.priority] ?? "app.priority.normal")}
                </span>
              </div>

              {(ticket.firstReplyDueAt || ticket.resolveDueAt) && (
                <div
                  className="flex flex-col border-t"
                  style={{ gap: 9, paddingTop: 11, borderColor: "var(--line-2)" }}
                >
                  {ticket.firstReplyDueAt && (
                    <SlaFact
                      label={t("app.ticket.slaFirstReply")}
                      due={ticket.firstReplyDueAt}
                      doneAt={ticket.firstRepliedAt}
                      createdAt={ticket.createdAt}
                      now={now}
                      t={t}
                    />
                  )}
                  {ticket.resolveDueAt && (
                    <SlaFact
                      label={t("app.ticket.slaResolution")}
                      due={ticket.resolveDueAt}
                      doneAt={ticket.resolvedAt}
                      createdAt={ticket.createdAt}
                      now={now}
                      t={t}
                    />
                  )}
                </div>
              )}
            </section>

            {/* 2. Who is asking — the summary; the full record is one click away,
                   either in the requester panel or on the contact page. */}
            <section className="flex flex-col" style={{ ...PANEL_CARD, padding: "15px 16px", gap: 11 }}>
              <p style={PANEL_GROUP}>{t("app.ticket.panelRequester")}</p>
              <div className="flex items-center" style={{ gap: 11 }}>
                <Avatar name={requesterName} size={36} fontSize={12} />
                <div className="min-w-0">
                  <div className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>
                    {requesterName}
                  </div>
                  <div className="truncate" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {[organization?.name, t("app.tickets.count", { count: requesterTicketCount })]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>
              <Link
                href={`/app/contacts/${requester.id}`}
                className="hover:underline"
                style={{ fontSize: 13, color: "var(--brand-2)", fontWeight: 500 }}
              >
                {t("app.ticket.requesterFullRecord")}
              </Link>
            </section>

            {/* 3. What the ticket is — every field editable in place. */}
            <section className="flex flex-col" style={{ ...PANEL_CARD, padding: "15px 16px", gap: 11 }}>
              <p style={PANEL_GROUP}>{t("app.ticket.panelDetails")}</p>
              <PropsForm
                ticketId={ticket.id}
                number={ticket.number}
                status={ticket.status}
                assigneeId={ticket.assigneeId}
                teamId={ticket.teamId}
                priority={ticket.priority}
                type={ticket.type}
                channel={ticket.channel}
                tags={ticket.tags}
                agents={agents}
                teams={teams}
              />
            </section>

            {/* The tenant's own fields, when the form carries any. Silent
                otherwise: an empty card is one more thing to read past. */}
            {fieldEntries.length > 0 && (
              <section className="flex flex-col" style={{ ...PANEL_CARD, padding: "15px 16px", gap: 9 }}>
                <p style={PANEL_GROUP}>{t("app.ticket.formFieldsGroup")}</p>
                {fieldEntries.map((f) => (
                  <div key={f.label} className="flex flex-col" style={{ gap: 2 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{f.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, textWrap: "pretty" }}>
                      {f.value}
                    </span>
                  </div>
                ))}
              </section>
            )}

            {/* Capture a resolution — the knowledge of a closed ticket is otherwise
                lost. Restricted to the roles that can write to the knowledge base: the link
                leads to the editor, which would refuse them anyway. */}
            {!isOpen && isManager(agent.role) && (
              <section className="flex flex-col" style={{ ...PANEL_CARD, padding: "15px 16px", gap: 9 }}>
                <p style={PANEL_GROUP}>{t("app.ticket.kbGroup")}</p>
                <Link
                  href={`/app/kb/new?from=${ticket.number}`}
                  className="ohd-hover-edge-ink flex items-center justify-center font-medium"
                  style={{
                    height: 36,
                    borderRadius: 9,
                    border: "1px solid var(--line)",
                    fontSize: 13,
                    background: "var(--panel)",
                    color: "var(--ink)",
                  }}
                >
                  {t("app.ticket.kbConvert")}
                </Link>
                <p style={{ fontSize: 12, color: "var(--ink-3)", textWrap: "pretty" }}>
                  {t("app.ticket.kbConvertHint")}
                </p>
              </section>
            )}
            </>
          }
        />
      </div>
    </div>
  );
}
