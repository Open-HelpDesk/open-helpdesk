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
import { Avatar, StatusChip } from "@/components/ticket-bits";
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
    <div className="flex items-baseline justify-between gap-2">
      <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{label}</span>
      <span className="whitespace-nowrap font-semibold tabular-nums" style={{ fontSize: 12, color }}>
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
    background: "var(--bg)",
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
      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tête — rangée 1 */}
        <header
          className="shrink-0 border-b px-4 pb-2.5 pt-3"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div className="flex items-center gap-2.5">
            <Link
              href={`/app/tickets?view=${view}`}
              title="Retour à l'inbox"
              className="flex shrink-0 items-center justify-center"
              style={navBtnStyle}
            >
              ←
            </Link>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
                color: "var(--ink-3)",
              }}
            >
              #{ticket.number}
            </span>
            <h1
              className="min-w-0 flex-1 truncate"
              style={{ fontSize: 16, fontWeight: 600 }}
            >
              {ticket.subject}
            </h1>
            <div className="hidden items-center gap-1.5 lg:flex">
              {!ticket.mergedIntoId && (
                <MergeChip ticketId={ticket.id} ticketNumber={ticket.number} />
              )}
              <ChipVisual label="Lier" />
              <ChipVisual label="Vers la KB" />
              <CopyLinkChip />
              <ChipVisual label="Historique" />
            </div>
            <div className="flex items-center gap-1">
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
          <div className="mt-2 flex flex-wrap items-center gap-2.5 pl-9">
            <StatusChip status={ticket.status} />
            <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5 }}>
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
                className="rounded px-1.5 py-0.5 font-semibold tabular-nums"
                style={
                  remaining < 0
                    ? { fontSize: 11.5, background: "var(--dang-t)", color: "var(--dang)" }
                    : remaining < 30 * 60_000
                      ? { fontSize: 11.5, background: "var(--wait-t)", color: "var(--wait)" }
                      : {
                          fontSize: 11.5,
                          border: "1px solid var(--line)",
                          color: "var(--ink-2)",
                        }
                }
              >
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
            className="flex shrink-0 items-center gap-2 border-b px-4 py-2 text-[13px]"
            style={{
              background: "var(--wait-t)",
              borderColor: "var(--line)",
              color: "var(--wait)",
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
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
          style={{ padding: "18px 22px", background: "var(--canvas)" }}
        >
          {messages.map((m) => {
            if (m.kind === "system_event") {
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                  <p
                    className="text-center"
                    style={{ fontSize: 12, color: "var(--ink-3)" }}
                  >
                    {m.bodyText} · {relativeFr(m.createdAt)}
                  </p>
                  <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                </div>
              );
            }
            const isNote = m.kind === "internal_note";
            const isAgent = m.authorType === "agent";
            const name = authorName(m.authorId, m.authorType);
            const atts = (attachmentsByMessage.get(m.id) ?? []) as AttachmentData[];
            return (
              <article
                key={m.id}
                className="border"
                style={{
                  borderRadius: 10,
                  padding: "12px 14px",
                  maxWidth: isNote ? "70%" : "82%",
                  alignSelf: isAgent || isNote ? "flex-end" : "flex-start",
                  background: isNote
                    ? "var(--note)"
                    : isAgent
                      ? "var(--acc-t)"
                      : "var(--panel)",
                  borderColor: isNote
                    ? "var(--note-line)"
                    : isAgent
                      ? "var(--acc-b)"
                      : "var(--line)",
                }}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Avatar name={name} size={22} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{name}</span>
                  {isNote && (
                    <span
                      className="rounded px-1.5 py-0.5"
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        background: "var(--wait-t)",
                        color: "var(--wait)",
                        letterSpacing: "0.03em",
                      }}
                    >
                      🔒 NOTE INTERNE
                    </span>
                  )}
                  <span
                    className="ml-auto whitespace-nowrap pl-3"
                    style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                  >
                    {relativeFr(m.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.bodyText}</p>
                <MessageAttachments attachments={atts} senderName={name} />
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
        className="hidden w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l p-4 xl:flex"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
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
        <section>
          <p
            className="mb-2 font-semibold uppercase tracking-wider"
            style={{ fontSize: 11, color: "var(--ink-3)" }}
          >
            Champs du formulaire
          </p>
          {fieldEntries.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Aucun champ renseigné.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {fieldEntries.map((f) => (
                <div
                  key={f.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "96px 1fr",
                    gap: 8,
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{f.label}</span>
                  <span className="min-w-0 truncate">{f.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SLA */}
        <section>
          <p
            className="mb-2 font-semibold uppercase tracking-wider"
            style={{ fontSize: 11, color: "var(--ink-3)" }}
          >
            SLA
          </p>
          <div
            className="flex flex-col gap-1.5 border p-2.5"
            style={{ borderRadius: 8, borderColor: "var(--line)", background: "var(--sunk)" }}
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
        <section>
          <p
            className="mb-2 font-semibold uppercase tracking-wider"
            style={{ fontSize: 11, color: "var(--ink-3)" }}
          >
            Contact
          </p>
          <div
            className="border p-3"
            style={{ borderRadius: 8, borderColor: "var(--line)", background: "var(--bg)" }}
          >
            <div className="flex items-center gap-2.5">
              <Avatar name={requesterName} size={32} />
              <div className="min-w-0">
                <p className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>
                  {requesterName}
                </p>
                <p className="truncate" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                  {requester.email}
                </p>
              </div>
            </div>
            <p className="mt-2" style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {requesterTicketCount} ticket{requesterTicketCount > 1 ? "s" : ""} récent
              {requesterTicketCount > 1 ? "s" : ""}
              {organization ? ` · ${organization.name}` : ""}
            </p>
            {recentRequesterTickets.length > 0 && (
              <ul
                className="mt-2 flex flex-col gap-1 border-t pt-2"
                style={{ borderColor: "var(--line-2)" }}
              >
                {recentRequesterTickets.map((t) => (
                  <li key={t.number}>
                    <Link
                      href={`/app/tickets/${t.number}`}
                      className="flex items-baseline gap-1.5"
                      style={{ fontSize: 12 }}
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
                      <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
