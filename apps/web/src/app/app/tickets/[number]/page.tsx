import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import {
  DEFAULT_VIEWS,
  getTicketByNumber,
  listMacrosForEditor,
  viewTicketNumbers,
  type ViewKey,
} from "@/lib/data";
import {
  CHANNEL_LABELS_FR,
  PRIORITY_COLORS,
  PRIORITY_LABELS_FR,
  durationFr,
  relativeFr,
} from "@/lib/format";
import { Avatar, SlaClock, StatusChip } from "@/components/ticket-bits";
import { TopbarOverride } from "@/components/app-shell";
import { ChipVisual, CopyLinkChip, MergeChip } from "./header-tools";
import { MessageAttachments, type AttachmentData } from "./attachments";
import { PropsForm } from "./props-panel";
import { ReplyEditor } from "./reply-editor";

/**
 * AG-04 — Détail ticket (design espace-agent) : en-tête 2 rangées avec chips et
 * navigation ←/→, fil client/agent/note/événements, pièces jointes avec visionneuse,
 * composeur à onglets et split button, panneau propriétés 320 px.
 */

/** Titre de groupe du panneau propriétés — 11px/600 uppercase, letter-spacing .06em. */
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
}: {
  label: string;
  due: Date | null;
  doneAt: Date | null;
  createdAt: Date;
  now: number;
}) {
  let text = "—";
  let color = "var(--ink-3)";
  if (due) {
    if (doneAt) {
      if (doneAt.getTime() <= due.getTime()) {
        text = `Tenue · ${durationFr(Math.max(60_000, doneAt.getTime() - createdAt.getTime()))}`;
        color = "var(--ok)";
      } else {
        text = `Dépassée · -${durationFr(doneAt.getTime() - due.getTime())}`;
        color = "var(--dang)";
      }
    } else {
      const remaining = due.getTime() - now;
      if (remaining >= 0) {
        text = `À tenir · ${durationFr(remaining)}`;
        color = remaining < 30 * 60_000 ? "var(--wait)" : "var(--ink-2)";
      } else {
        text = `Dépassée · -${durationFr(-remaining)}`;
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
    if (authorType === "agent") return agents.find((a) => a.id === authorId)?.name ?? "Agent";
    return "Système";
  };

  // Navigation ←/→ dans la vue courante.
  const idx = viewNumbers.indexOf(number);
  const prevNumber = idx > 0 ? viewNumbers[idx - 1] : null;
  const nextNumber = idx >= 0 && idx < viewNumbers.length - 1 ? viewNumbers[idx + 1] : null;
  const positionLabel =
    idx >= 0 ? `ticket ${idx + 1} sur ${viewNumbers.length}` : `ticket #${number}`;

  // Badge SLA de l'en-tête.
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
    <div className="flex h-full">
      <TopbarOverride title="Mes tickets" subtitle={positionLabel} />

      {/* Colonne conversation */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: "var(--bg)" }}>
        {/* En-tête — 2 rangées, padding 12/18, gap 9 */}
        <header
          className="flex shrink-0 flex-col border-b"
          style={{ padding: "12px 18px", gap: 9, borderColor: "var(--line)" }}
        >
          <div className="flex items-center" style={{ gap: 10 }}>
            <Link
              href={`/app/tickets?view=${view}`}
              title="Retour à l'inbox"
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
              <ChipVisual label="Lier" />
              <ChipVisual label="Vers la KB" />
              <CopyLinkChip />
              <ChipVisual label="Historique" />
            </div>
            <div className="flex items-center" style={{ gap: 2, marginLeft: 4 }}>
              {prevNumber ? (
                <Link
                  href={`/app/tickets/${prevNumber}?view=${view}`}
                  title="Ticket précédent"
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
                  title="Ticket suivant"
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

          {/* En-tête — rangée 2 */}
          <div className="flex flex-wrap items-center" style={{ gap: 7 }}>
            <StatusChip status={ticket.status} />
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
              {PRIORITY_LABELS_FR[ticket.priority]}
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
                  ? `SLA dépassé de ${durationFr(-remaining)}`
                  : `SLA : ${durationFr(remaining)} restantes`}
              </span>
            )}
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {CHANNEL_LABELS_FR[ticket.channel] ?? ticket.channel} · créé{" "}
              {relativeFr(ticket.createdAt)}
            </span>
          </div>
        </header>

        {/* Bannière fusion */}
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
            Ce ticket a été fusionné dans{" "}
            {mergedIntoNumber ? (
              <Link href={`/app/tickets/${mergedIntoNumber}`} className="font-semibold underline">
                #{mergedIntoNumber}
              </Link>
            ) : (
              "un autre ticket"
            )}{" "}
            — lecture seule.
          </div>
        )}

        {/* Fil */}
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
                    {m.bodyText} · {relativeFr(m.createdAt)}
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
                      🔒 Note interne
                    </span>
                  )}
                  <span className="flex-1" />
                  <span
                    className="whitespace-nowrap"
                    style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                  >
                    {relativeFr(m.createdAt)}
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

        {/* Composeur */}
        {!ticket.mergedIntoId && (
          <ReplyEditor
            ticketId={ticket.id}
            ticketNumber={ticket.number}
            contactName={requesterName}
            macros={editorMacros}
          />
        )}
      </div>

      {/* Panneau propriétés — 320 px */}
      <aside
        className="hidden shrink-0 flex-col overflow-y-auto border-l xl:flex"
        style={{
          width: 320,
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

        {/* Champs du formulaire */}
        <section className="flex flex-col" style={{ gap: 8 }}>
          <p style={PANEL_GROUP}>Champs du formulaire</p>
          {fieldEntries.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Aucun champ renseigné.</p>
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

        {/* SLA — encadré, rangées séparées par --line-2 */}
        <section className="flex flex-col" style={{ gap: 8 }}>
          <p style={PANEL_GROUP}>SLA</p>
          <div
            className="overflow-hidden"
            style={{ border: "1px solid var(--line)", borderRadius: 8 }}
          >
            <SlaRow
              label="1ʳᵉ réponse"
              due={ticket.firstReplyDueAt}
              doneAt={ticket.firstRepliedAt}
              createdAt={ticket.createdAt}
              now={now}
            />
            <SlaRow
              label="Résolution"
              due={ticket.resolveDueAt}
              doneAt={ticket.resolvedAt}
              createdAt={ticket.createdAt}
              now={now}
            />
          </div>
        </section>

        {/* Contact */}
        <section className="flex flex-col" style={{ gap: 8 }}>
          <p style={PANEL_GROUP}>Contact</p>
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
              {requesterTicketCount} ticket{requesterTicketCount > 1 ? "s" : ""} récent
              {requesterTicketCount > 1 ? "s" : ""}
              {organization ? ` · ${organization.name}` : ""}
            </p>
            {recentRequesterTickets.map((t) => (
              <Link
                key={t.number}
                href={`/app/tickets/${t.number}`}
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
                  #{t.number}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-2)" }}>
                  {t.subject}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Capitaliser une résolution — le savoir d'un ticket clos se perd sinon. */}
        {!isOpen && (
          <section className="flex flex-col" style={{ gap: 8 }}>
            <p style={PANEL_GROUP}>Base de connaissances</p>
            <Link
              href={`/app/kb/new?depuis=${ticket.number}`}
              className="inline-flex items-center justify-center rounded-md border font-medium"
              style={{
                height: 30,
                fontSize: 12.5,
                borderColor: "var(--line)",
                background: "var(--bg)",
                color: "var(--ink)",
              }}
            >
              Transformer en article
            </Link>
            <p style={{ fontSize: 12, color: "var(--ink-3)", textWrap: "pretty" }}>
              Reprend la demande et la réponse dans un brouillon à relire.
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
