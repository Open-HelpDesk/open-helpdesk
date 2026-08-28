"use client";

/**
 * AG-04 (V2) — the right column and the icon rail that switches it.
 *
 * The V1 panel showed everything at once in one long scroll: properties, the
 * requester, their recent tickets. V2 splits it into five panels behind five
 * icons, so the column answers one question at a time.
 *
 * Which panel is open is client state, not a URL parameter: it is a preference
 * about how you are looking at a ticket, not part of what the ticket is, and
 * putting it in the query string would make every glance a new history entry.
 */
import { useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { Avatar } from "@/components/ticket-bits";
import { STATUS_KEYS } from "@/lib/format";
import { pinContactNote, unpinContactNote, linkTicket, unlinkTicket } from "./panel-actions";

type Panel = "details" | "requester" | "notes" | "history" | "linked";

export type PinnedNote = {
  id: string;
  body: string;
  authorName: string | null;
  when: string;
};

export type LinkedTicket = {
  id: string | null;
  number: number;
  subject: string;
  status: string;
  /** "related" | "duplicate" | "incident", or null for a derived link. */
  relation: string | null;
};

export type SlaEvent = { when: string; label: string; tone: "dang" | "ok" | "mute" };

export type RequesterInfo = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organizationName: string | null;
  ticketCount: number;
  recent: { number: number; subject: string; status: string; when: string }[];
};

const ICONS: { key: Panel; d: string }[] = [
  { key: "details", d: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01" },
  { key: "requester", d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
  {
    key: "notes",
    d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z",
  },
  { key: "history", d: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2" },
  {
    key: "linked",
    d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  },
];

const CARD: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 14,
  background: "var(--panel)",
  boxShadow: "0 1px 2px rgba(13,28,23,.03)",
};

const GROUP: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "new"
      ? "viol"
      : status === "open"
        ? "open"
        : status === "waiting"
          ? "wait"
          : status === "on_hold"
            ? "pause"
            : status === "resolved"
              ? "ok"
              : "closed";
  return (
    <span
      className="whitespace-nowrap"
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        background: `var(--${tone}-t)`,
        color: `var(--${tone})`,
        fontSize: 10.5,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

export function SidePanels({
  number,
  ticketId,
  requester,
  notes,
  linked,
  slaEvents,
  details,
}: {
  number: number;
  ticketId: string;
  requester: RequesterInfo;
  notes: PinnedNote[];
  linked: LinkedTicket[];
  slaEvents: SlaEvent[];
  /** The properties form, rendered on the server and handed over as-is. */
  details: React.ReactNode;
}) {
  const t = useT();
  const [panel, setPanel] = useState<Panel>("details");
  const [pinning, setPinning] = useState(false);
  const [linking, setLinking] = useState(false);

  const LABEL: Record<Panel, string> = {
    details: t("app.ticket.panelDetails"),
    requester: t("app.ticket.panelRequester"),
    notes: t("app.ticket.panelNotes"),
    history: t("app.ticket.panelHistory"),
    linked: t("app.ticket.panelLinked"),
  };

  return (
    <div className="flex min-h-0">
      <aside
        className="flex shrink-0 flex-col overflow-auto border-l"
        style={{
          width: 304,
          padding: 16,
          gap: 12,
          background: "var(--canvas)",
          borderColor: "var(--line)",
        }}
      >
        {panel === "details" && details}

        {panel === "requester" && (
          <>
            <div className="flex flex-col" style={{ ...CARD, padding: "15px 16px", gap: 13 }}>
              <div className="flex items-center" style={{ gap: 12 }}>
                <Avatar name={requester.name} size={44} fontSize={14} />
                <div className="min-w-0">
                  <div className="truncate" style={{ fontSize: 15, fontWeight: 600 }}>
                    {requester.name}
                  </div>
                  {requester.organizationName && (
                    <div className="truncate" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                      {requester.organizationName}
                    </div>
                  )}
                </div>
              </div>
              <div
                className="flex flex-col border-t"
                style={{ gap: 8, paddingTop: 12, borderColor: "var(--line-2)", fontSize: 13 }}
              >
                <div className="flex justify-between" style={{ gap: 10 }}>
                  <span style={{ color: "var(--ink-3)" }}>{t("app.contacts.email")}</span>
                  <span className="min-w-0 truncate" style={{ fontWeight: 500 }}>
                    {requester.email}
                  </span>
                </div>
                {requester.phone && (
                  <div className="flex justify-between" style={{ gap: 10 }}>
                    <span style={{ color: "var(--ink-3)" }}>{t("app.contacts.phone")}</span>
                    <span style={{ fontWeight: 500 }}>{requester.phone}</span>
                  </div>
                )}
                <div className="flex justify-between" style={{ gap: 10 }}>
                  <span style={{ color: "var(--ink-3)" }}>{t("app.ticket.requesterTickets")}</span>
                  <span className="tabular-nums" style={{ fontWeight: 500 }}>
                    {requester.ticketCount}
                  </span>
                </div>
              </div>
            </div>

            {requester.recent.length > 0 && (
              <div className="overflow-hidden" style={CARD}>
                <div
                  className="border-b"
                  style={{ ...GROUP, padding: "12px 16px", borderColor: "var(--line)" }}
                >
                  {t("app.ticket.requesterRecent")}
                </div>
                {requester.recent.map((r) => (
                  <Link
                    key={r.number}
                    href={`/app/tickets/${r.number}`}
                    className="ohd-row flex items-center border-b"
                    style={{ gap: 8, padding: "10px 16px", borderColor: "var(--line-2)" }}
                  >
                    <span
                      style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}
                    >
                      #{r.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12.5 }}>
                      {r.subject}
                    </span>
                    <StatusPill
                      status={r.status}
                      label={t(STATUS_KEYS[r.status as keyof typeof STATUS_KEYS] ?? "app.status.open")}
                    />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {panel === "notes" && (
          <>
            <div className="flex items-center" style={{ gap: 10 }}>
              <span style={GROUP}>{t("app.ticket.panelNotes")}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setPinning((v) => !v)}
                style={{ fontSize: 12.5, color: "var(--brand-2)", fontWeight: 600 }}
              >
                {t("app.ticket.notePin")}
              </button>
            </div>

            {pinning && (
              <form
                action={pinContactNote}
                onSubmit={() => setPinning(false)}
                className="flex flex-col"
                style={{ ...CARD, padding: 12, gap: 8 }}
              >
                <input type="hidden" name="number" value={number} />
                <input type="hidden" name="contactId" value={requester.id} />
                <textarea
                  name="body"
                  required
                  autoFocus
                  rows={3}
                  placeholder={t("app.ticket.notePlaceholder")}
                  className="w-full resize-none outline-none"
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 9,
                    padding: "8px 10px",
                    fontSize: 13,
                    background: "var(--bg)",
                  }}
                />
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setPinning(false)}
                    style={{ fontSize: 12, color: "var(--ink-3)" }}
                  >
                    {t("app.ticket.taskCancel")}
                  </button>
                  <button
                    type="submit"
                    className="font-semibold text-white"
                    style={{
                      height: 30,
                      padding: "0 12px",
                      borderRadius: 8,
                      background: "var(--brand)",
                      fontSize: 12,
                    }}
                  >
                    {t("app.ticket.notePinAction")}
                  </button>
                </div>
              </form>
            )}

            {notes.map((n) => (
              <div
                key={n.id}
                className="flex flex-col"
                style={{
                  border: "1px solid var(--note-b)",
                  borderRadius: 14,
                  background: "var(--note)",
                  padding: "13px 15px",
                  gap: 7,
                }}
              >
                <div className="flex items-center" style={{ gap: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: "var(--note-ink)" }}>
                    {n.authorName ?? t("app.ticket.authorAgent")}
                  </span>
                  <span className="flex-1" />
                  <span style={{ color: "var(--ink-3)" }}>{n.when}</span>
                  <form action={unpinContactNote}>
                    <input type="hidden" name="number" value={number} />
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      title={t("app.ticket.noteUnpin")}
                      aria-label={t("app.ticket.noteUnpin")}
                      style={{ color: "var(--ink-3)", fontSize: 12 }}
                    >
                      ✕
                    </button>
                  </form>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink)", textWrap: "pretty" }}>
                  {n.body}
                </p>
              </div>
            ))}

            <p
              style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.55, textWrap: "pretty" }}
            >
              {t("app.ticket.notesFootnote")}
            </p>
          </>
        )}

        {panel === "history" && (
          <div className="flex flex-col" style={{ ...CARD, padding: "15px 16px" }}>
            <div style={{ ...GROUP, paddingBottom: 12 }}>{t("app.ticket.panelHistory")}</div>
            {slaEvents.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {t("app.ticket.historyEmpty")}
              </p>
            ) : (
              slaEvents.map((e, i) => (
                <div key={i} className="flex" style={{ gap: 11 }}>
                  <span className="flex flex-none flex-col items-center" style={{ gap: 3 }} aria-hidden>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        marginTop: 4,
                        borderRadius: "50%",
                        background:
                          e.tone === "dang"
                            ? "var(--dang)"
                            : e.tone === "ok"
                              ? "var(--ok)"
                              : "var(--line)",
                      }}
                    />
                    {i < slaEvents.length - 1 && (
                      <span className="w-px flex-1" style={{ background: "var(--line-2)" }} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1" style={{ paddingBottom: 13 }}>
                    <div
                      className="tabular-nums"
                      style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                    >
                      {e.when}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        lineHeight: 1.45,
                        color:
                          e.tone === "dang"
                            ? "var(--dang)"
                            : e.tone === "ok"
                              ? "var(--ok)"
                              : "var(--ink-2)",
                      }}
                    >
                      {e.label}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {panel === "linked" && (
          <>
            <div className="flex items-center" style={{ gap: 10 }}>
              <span style={GROUP}>{t("app.ticket.panelLinked")}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setLinking((v) => !v)}
                style={{ fontSize: 12.5, color: "var(--brand-2)", fontWeight: 600 }}
              >
                {t("app.ticket.linkAdd")}
              </button>
            </div>

            {linking && (
              <form
                action={linkTicket}
                onSubmit={() => setLinking(false)}
                className="flex flex-col"
                style={{ ...CARD, padding: 12, gap: 8 }}
              >
                <input type="hidden" name="number" value={number} />
                <input type="hidden" name="ticketId" value={ticketId} />
                <input
                  name="target"
                  type="number"
                  required
                  min={1}
                  placeholder={t("app.ticket.linkNumberPlaceholder")}
                  className="w-full outline-none"
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 9,
                    height: 32,
                    padding: "0 10px",
                    fontSize: 13,
                    fontFamily: "var(--font-mono)",
                    background: "var(--bg)",
                  }}
                />
                <select
                  name="relation"
                  defaultValue="related"
                  aria-label={t("app.ticket.linkRelation")}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 9,
                    height: 32,
                    padding: "0 8px",
                    fontSize: 12.5,
                    background: "var(--bg)",
                  }}
                >
                  <option value="related">{t("app.ticket.linkRelated")}</option>
                  <option value="duplicate">{t("app.ticket.linkDuplicate")}</option>
                  <option value="incident">{t("app.ticket.linkIncident")}</option>
                </select>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setLinking(false)}
                    style={{ fontSize: 12, color: "var(--ink-3)" }}
                  >
                    {t("app.ticket.taskCancel")}
                  </button>
                  <button
                    type="submit"
                    className="font-semibold text-white"
                    style={{
                      height: 30,
                      padding: "0 12px",
                      borderRadius: 8,
                      background: "var(--brand)",
                      fontSize: 12,
                    }}
                  >
                    {t("app.ticket.linkAction")}
                  </button>
                </div>
              </form>
            )}

            {linked.length === 0 && !linking ? (
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
                {t("app.ticket.linkedEmpty")}
              </p>
            ) : (
              linked.map((l) => (
                <div key={`${l.id ?? "org"}-${l.number}`} className="flex flex-col" style={{ ...CARD, padding: "13px 15px", gap: 6 }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span
                      style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}
                    >
                      #{l.number}
                    </span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--sunk)",
                        color: "var(--ink-2)",
                        fontSize: 10.5,
                        fontWeight: 600,
                      }}
                    >
                      {l.relation === "duplicate"
                        ? t("app.ticket.linkDuplicate")
                        : l.relation === "incident"
                          ? t("app.ticket.linkIncident")
                          : l.relation === "related"
                            ? t("app.ticket.linkRelated")
                            : t("app.ticket.linkSameOrg")}
                    </span>
                    <span className="flex-1" />
                    <StatusPill
                      status={l.status}
                      label={t(STATUS_KEYS[l.status as keyof typeof STATUS_KEYS] ?? "app.status.open")}
                    />
                    {/* Only an explicit link can be removed: "same organisation"
                        is a fact, not a decision, so there is nothing to undo. */}
                    {l.id && (
                      <form action={unlinkTicket}>
                        <input type="hidden" name="number" value={number} />
                        <input type="hidden" name="id" value={l.id} />
                        <button
                          type="submit"
                          title={t("app.ticket.linkRemove")}
                          aria-label={t("app.ticket.linkRemove")}
                          style={{ color: "var(--ink-3)", fontSize: 12 }}
                        >
                          ✕
                        </button>
                      </form>
                    )}
                  </div>
                  <Link
                    href={`/app/tickets/${l.number}`}
                    style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: "var(--ink)" }}
                  >
                    {l.subject}
                  </Link>
                </div>
              ))
            )}
          </>
        )}
      </aside>

      {/* The rail — five icons, one per panel. */}
      <nav
        className="flex shrink-0 flex-col items-center border-l"
        style={{
          width: 44,
          padding: "16px 0",
          gap: 4,
          background: "var(--panel)",
          borderColor: "var(--line)",
        }}
      >
        {ICONS.map(({ key, d }) => (
          <button
            key={key}
            type="button"
            title={LABEL[key]}
            aria-label={LABEL[key]}
            aria-pressed={panel === key}
            onClick={() => setPanel(key)}
            className="ohd-row grid place-items-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: panel === key ? "var(--brand-t)" : "transparent",
              color: panel === key ? "var(--brand)" : "var(--ink-3)",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={17}
              height={17}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={d} />
            </svg>
          </button>
        ))}
      </nav>
    </div>
  );
}
