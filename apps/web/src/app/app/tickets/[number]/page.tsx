import Link from "next/link";
import { notFound } from "next/navigation";
import { isManager, requireAgent } from "@/lib/session";
import {
  DEFAULT_VIEWS,
  getTicketByNumber,
  listMacrosForEditor,
  viewTicketNumbers,
  type ViewKey,
} from "@/lib/data";
import {
  CHANNEL_KEYS,
  PRIORITY_COLORS,
  PRIORITY_KEYS,
  duration,
} from "@/lib/format";
import { getT, type Translate } from "@/i18n/server";
import { Avatar, SlaClock, StatusChip } from "@/components/ticket-bits";
import { TopbarOverride } from "@/components/app-shell";
import { ChipVisual, CopyLinkChip, MergeChip } from "./header-tools";
import { MessageAttachments, type AttachmentData } from "./attachments";
import { PropsForm } from "./props-panel";
import { ReplyEditor } from "./reply-editor";

/**
 * AG-04 — Ticket detail (agent space design): 2-row header with chips and
 * ←/→ navigation, customer/agent/note/events thread, attachments with viewer,
 * tabbed composer with split button, 320 px properties panel.
 */

/** Group title of the properties panel — 11px/600 uppercase, letter-spacing .06em. */
const PANEL_GROUP: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

function SlaRow({
  label,
  due,
  doneAt,
  createdAt,
  now,
  t,
}: {
  label: string;
  due: Date | null;
  doneAt: Date | null;
  createdAt: Date;
  now: number;
  t: Translate;
}) {
  let text = "—";
  let color = "var(--ink-3)";
  if (due) {
    if (doneAt) {
      if (doneAt.getTime() <= due.getTime()) {
        text = t("app.ticket.slaMet", {
          duration: duration(t, Math.max(60_000, doneAt.getTime() - createdAt.getTime())),
        });
        color = "var(--ok)";
      } else {
        text = t("app.ticket.slaMissed", {
          duration: duration(t, doneAt.getTime() - due.getTime()),
        });
        color = "var(--dang)";
      }
    } else {
      const remaining = due.getTime() - now;
      if (remaining >= 0) {
        text = t("app.ticket.slaPending", { duration: duration(t, remaining) });
        color = remaining < 30 * 60_000 ? "var(--wait)" : "var(--ink-2)";
      } else {
        text = t("app.ticket.slaMissed", { duration: duration(t, -remaining) });
        color = "var(--dang)";
      }
    }
  }
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "8px 10px",
        borderBottom: "1px solid var(--line-2)",
        fontSize: 12.5,
      }}
    >
      <span style={{ color: "var(--ink-2)" }}>{label}</span>
      <span className="whitespace-nowrap tabular-nums" style={{ fontWeight: 600, color }}>
        {text}
      </span>
    </div>
  );
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const t = await getT();
  const { tenant, agent } = await requireAgent();
  const { number: numberParam } = await params;
  const { view: viewParam } = await searchParams;
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
  const positionLabel =
    idx >= 0
      ? t("app.ticket.position", { index: idx + 1, total: viewNumbers.length })
      : t("app.ticket.positionUnknown", { number: String(number) });

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

  const priorityKey = PRIORITY_KEYS[ticket.priority];
  const channelKey = CHANNEL_KEYS[ticket.channel];

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
    // Below xl, the two columns stack instead of sitting side by side: the
    // properties panel was simply absent from the DOM, and the agent lost
    // assignee, team, priority, type, SLA and contact record with no way at all
    // to reach them — not even a fallback.
    <div className="flex h-full max-xl:flex-col max-xl:overflow-y-auto">
      <TopbarOverride title={t("app.ticket.topbarTitle")} subtitle={positionLabel} />

      {/* Conversation column */}
      <div className="flex min-w-0 flex-1 flex-col max-xl:min-h-0" style={{ background: "var(--bg)" }}>
        {/* Header — 2 rows, padding 12/18, gap 9 */}
        <header
          className="flex shrink-0 flex-col border-b"
          style={{ padding: "12px 18px", gap: 9, borderColor: "var(--line)" }}
        >
          <div className="flex items-center" style={{ gap: 10 }}>
            <Link
              href={`/app/tickets?view=${view}`}
              title={t("app.ticket.backToInbox")}
              className="grid shrink-0 place-items-center"
              style={navBtnStyle}
            >
              ←
            </Link>
            <span
              className="shrink-0"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--ink-3)",
              }}
            >
              #{ticket.number}
            </span>
            <h1
              className="min-w-0 flex-1 truncate"
              style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.01em" }}
            >
              {ticket.subject}
            </h1>
            <div className="hidden items-center lg:flex" style={{ gap: 4 }}>
              {!ticket.mergedIntoId && (
                <MergeChip ticketId={ticket.id} ticketNumber={ticket.number} />
              )}
              <ChipVisual label={t("app.ticket.chipLink")} />
              <ChipVisual label={t("app.ticket.chipToKb")} />
              <CopyLinkChip />
              <ChipVisual label={t("app.ticket.chipHistory")} />
            </div>
            <div className="flex items-center" style={{ gap: 2, marginLeft: 4 }}>
              {prevNumber ? (
                <Link
                  href={`/app/tickets/${prevNumber}?view=${view}`}
                  title={t("app.ticket.previousTicket")}
                  className="flex items-center justify-center"
                  style={navBtnStyle}
                >
                  ←
                </Link>
              ) : (
                <span
                  className="flex items-center justify-center"
                  style={{ ...navBtnStyle, opacity: 0.4 }}
                >
                  ←
                </span>
              )}
              {nextNumber ? (
                <Link
                  href={`/app/tickets/${nextNumber}?view=${view}`}
                  title={t("app.ticket.nextTicket")}
                  className="flex items-center justify-center"
                  style={navBtnStyle}
                >
                  →
                </Link>
              ) : (
                <span
                  className="flex items-center justify-center"
                  style={{ ...navBtnStyle, opacity: 0.4 }}
                >
                  →
                </span>
              )}
            </div>
          </div>

          {/* Header — row 2 */}
          <div className="flex flex-wrap items-center" style={{ gap: 7 }}>
            <StatusChip status={ticket.status} t={t} />
            <span
              className="inline-flex items-center"
              style={{ gap: 5, fontSize: 12.5, color: "var(--ink-2)" }}
            >
              <span
                className="rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: PRIORITY_COLORS[ticket.priority] ?? "var(--ink-3)",
                }}
              />
              {priorityKey ? t(priorityKey) : ticket.priority}
            </span>
            {isOpen && remaining !== null && (
              <span
                className="inline-flex items-center tabular-nums"
                style={{
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 5,
                  fontSize: 11.5,
                  fontWeight: 600,
                  ...(remaining < 0
                    ? {
                        background: "var(--dang-t)",
                        color: "var(--dang)",
                        border: "1px solid var(--dang)",
                      }
                    : remaining < 30 * 60_000
                      ? {
                          background: "var(--wait-t)",
                          color: "var(--wait)",
                          border: "1px solid var(--wait)",
                        }
                      : {
                          color: "var(--ink-3)",
                          border: "1px solid var(--line)",
                        }),
                }}
              >
                <SlaClock />
                {remaining < 0
                  ? t("app.ticket.slaOverdueBy", { duration: duration(t, -remaining) })
                  : t("app.ticket.slaRemaining", { duration: duration(t, remaining) })}
              </span>
            )}
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {t("app.ticket.channelCreated", {
                channel: channelKey ? t(channelKey) : ticket.channel,
                when: t.fmt.relative(ticket.createdAt),
              })}
            </span>
          </div>
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

        {/* Thread */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          style={{ padding: "18px 22px", gap: 14 }}
        >
          {messages.map((m) => {
            if (m.kind === "system_event") {
              return (
                <div
                  key={m.id}
                  className="flex items-center"
                  style={{ gap: 9, padding: "2px 0", fontSize: 12, color: "var(--ink-3)" }}
                >
                  <span className="h-px flex-1" style={{ background: "var(--line-2)" }} />
                  <span className="text-center">
                    {m.bodyText} · {t.fmt.relative(m.createdAt)}
                  </span>
                  <span className="h-px flex-1" style={{ background: "var(--line-2)" }} />
                </div>
              );
            }
            const isNote = m.kind === "internal_note";
            const isAgent = m.authorType === "agent";
            const name = authorName(m.authorId, m.authorType);
            const atts = (attachmentsByMessage.get(m.id) ?? []) as AttachmentData[];
            const line = isNote
              ? "var(--note-line)"
              : isAgent
                ? "var(--acc-b)"
                : "var(--line)";
            return (
              <article
                key={m.id}
                className="overflow-hidden"
                style={{
                  borderRadius: 10,
                  border: `1px solid ${line}`,
                  maxWidth: isNote ? "70%" : "82%",
                  alignSelf: isAgent && !isNote ? "flex-end" : "flex-start",
                  background: isNote
                    ? "var(--note)"
                    : isAgent
                      ? "var(--acc-t)"
                      : "var(--panel)",
                }}
              >
                <div
                  className="flex items-center"
                  style={{
                    gap: 8,
                    padding: "8px 12px",
                    borderBottom: `1px solid ${line}`,
                  }}
                >
                  <Avatar name={name} size={22} fontSize={9.5} tone={isNote ? 3 : isAgent ? 2 : 0} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{name}</span>
                  {isNote && (
                    <span
                      className="inline-flex items-center uppercase"
                      style={{
                        gap: 4,
                        padding: "1px 7px",
                        borderRadius: 4,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: ".03em",
                        background: "var(--wait-t)",
                        color: "var(--wait)",
                      }}
                    >
                      🔒 {t("app.ticket.internalNote")}
                    </span>
                  )}
                  <span className="flex-1" />
                  <span
                    className="whitespace-nowrap"
                    style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                  >
                    {t.fmt.relative(m.createdAt)}
                  </span>
                </div>
                <p
                  className="whitespace-pre-wrap"
                  style={{
                    padding: "11px 12px",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    textWrap: "pretty",
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
            );
          })}
        </div>

        {/* Composer */}
        {!ticket.mergedIntoId && (
          <ReplyEditor
            ticketId={ticket.id}
            ticketNumber={ticket.number}
            contactName={requesterName}
            macros={editorMacros}
          />
        )}
      </div>

      {/* Properties panel — 320 px */}
      <aside
        // The width goes through the classes and not through the inline style: an
        // inline `width` would win over the responsive rule.
        className="flex w-full shrink-0 flex-col overflow-y-auto border-l border-t xl:w-80 xl:border-t-0 max-xl:border-l-0"
        style={{
          padding: "14px 16px",
          gap: 16,
          background: "var(--panel)",
          borderColor: "var(--line)",
        }}
      >
        <PropsForm
          ticketId={ticket.id}
          number={ticket.number}
          assigneeId={ticket.assigneeId}
          teamId={ticket.teamId}
          priority={ticket.priority}
          type={ticket.type}
          channel={ticket.channel}
          tags={ticket.tags}
          agents={agents}
          teams={teams}
        />

        {/* Form fields */}
        <section className="flex flex-col" style={{ gap: 8 }}>
          <p style={PANEL_GROUP}>{t("app.ticket.formFieldsGroup")}</p>
          {fieldEntries.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("app.ticket.noFields")}</p>
          ) : (
            fieldEntries.map((f) => (
              <div
                key={f.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "96px 1fr",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 26,
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: "var(--ink-3)" }}>{f.label}</span>
                <span className="min-w-0 truncate" style={{ fontWeight: 500 }}>
                  {f.value}
                </span>
              </div>
            ))
          )}
        </section>

        {/* SLA — boxed, rows separated by --line-2 */}
        <section className="flex flex-col" style={{ gap: 8 }}>
          <p style={PANEL_GROUP}>{t("app.ticket.slaGroup")}</p>
          <div
            className="overflow-hidden"
            style={{ border: "1px solid var(--line)", borderRadius: 8 }}
          >
            <SlaRow
              label={t("app.ticket.slaFirstReply")}
              due={ticket.firstReplyDueAt}
              doneAt={ticket.firstRepliedAt}
              createdAt={ticket.createdAt}
              now={now}
              t={t}
            />
            <SlaRow
              label={t("app.ticket.slaResolution")}
              due={ticket.resolveDueAt}
              doneAt={ticket.resolvedAt}
              createdAt={ticket.createdAt}
              now={now}
              t={t}
            />
          </div>
        </section>

        {/* Contact */}
        <section className="flex flex-col" style={{ gap: 8 }}>
          <p style={PANEL_GROUP}>{t("app.ticket.contactGroup")}</p>
          <div
            className="flex flex-col"
            style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 11, gap: 9 }}
          >
            <div className="flex items-center" style={{ gap: 9 }}>
              <Avatar name={requesterName} size={32} fontSize={11} tone={0} />
              <div className="min-w-0">
                <p className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>
                  {requesterName}
                </p>
                <p className="truncate" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                  {requester.email}
                </p>
              </div>
            </div>
            <div style={{ height: 1, background: "var(--line-2)" }} />
            <p style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {t("app.ticket.recentCount", { count: requesterTicketCount })}
              {organization ? ` · ${organization.name}` : ""}
            </p>
            {recentRequesterTickets.map((rt) => (
              <Link
                key={rt.number}
                href={`/app/tickets/${rt.number}`}
                className="flex items-center"
                style={{ gap: 7, fontSize: 12 }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--ink-3)",
                  }}
                >
                  #{rt.number}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-2)" }}>
                  {rt.subject}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Capture a resolution — the knowledge of a closed ticket is otherwise
            lost. Restricted to the roles that can write to the knowledge base: the link
            leads to the editor, which would refuse them anyway. */}
        {!isOpen && isManager(agent.role) && (
          <section className="flex flex-col" style={{ gap: 8 }}>
            <p style={PANEL_GROUP}>{t("app.ticket.kbGroup")}</p>
            <Link
              href={`/app/kb/new?from=${ticket.number}`}
              className="ohd-hover-edge-ink inline-flex items-center justify-center rounded-md border font-medium"
              style={{
                height: 30,
                fontSize: 12.5,
                borderColor: "var(--line)",
                background: "var(--bg)",
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
      </aside>
    </div>
  );
}
