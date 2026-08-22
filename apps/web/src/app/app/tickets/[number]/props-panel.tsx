"use client";

/**
 * AG-04 — Properties panel (client part): Assignment and Classification groups,
 * selects applied automatically through updateTicketProps (96px / 1fr rows).
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_KEYS, PRIORITY_COLORS, PRIORITY_KEYS } from "@/lib/format";
import { useT } from "@/i18n/client";
import { updateTicketProps } from "../actions";

/**
 * Ticket types.
 *
 * `tickets.type` is free text — the portal writes the label in the tenant's
 * language, and agents edit it by hand. These four VALUES are the vocabulary the
 * picker offers; the dictionary only translates how they are displayed, so a
 * value coming from anywhere else still shows as it was written.
 */
const TYPES = [
  { value: "Question", key: "app.ticket.typeQuestion" },
  { value: "Incident", key: "app.ticket.typeIncident" },
  { value: "Task", key: "app.ticket.typeTask" },
  { value: "Other", key: "app.ticket.typeOther" },
] as const;

export function PropsForm({
  ticketId,
  number,
  assigneeId,
  teamId,
  priority,
  type,
  channel,
  tags,
  agents,
  teams,
}: {
  ticketId: string;
  number: number;
  assigneeId: string | null;
  teamId: string | null;
  priority: string;
  type: string | null;
  channel: string;
  tags: string[];
  agents: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(field: string, value: string) {
    const fd = new FormData();
    fd.set("ticketId", ticketId);
    fd.set("number", String(number));
    fd.set(field, value);
    startTransition(async () => {
      await updateTicketProps(fd);
      router.refresh();
    });
  }

  const selectStyle = {
    height: 26,
    width: "100%",
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "var(--bg)",
    color: "var(--ink)",
    fontSize: 12.5,
    fontWeight: 500,
    padding: "0 6px",
  } as const;

  const labelStyle = { fontSize: 12.5, color: "var(--ink-3)" } as const;
  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "96px 1fr",
    alignItems: "center",
    gap: 8,
    minHeight: 26,
  } as const;
  const groupStyle = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: "var(--ink-3)",
  } as const;

  return (
    <div className="flex flex-col" style={{ gap: 16, opacity: pending ? 0.6 : 1 }}>
      <section className="flex flex-col" style={{ gap: 8 }}>
        <p style={groupStyle}>{t("app.ticket.assignmentGroup")}</p>
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div style={rowStyle}>
            <span style={labelStyle}>{t("app.ticket.assignee")}</span>
            <select
              value={assigneeId ?? ""}
              onChange={(e) => apply("assigneeId", e.target.value)}
              style={selectStyle}
            >
              <option value="">{t("app.ticket.unassigned")}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>{t("app.ticket.team")}</span>
            <select
              value={teamId ?? ""}
              onChange={(e) => apply("teamId", e.target.value)}
              style={selectStyle}
            >
              <option value="">{t("app.ticket.noTeam")}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="flex flex-col" style={{ gap: 8 }}>
        <p style={groupStyle}>{t("app.ticket.classificationGroup")}</p>
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div style={rowStyle}>
            <span style={labelStyle}>{t("app.ticket.priority")}</span>
            <div className="flex items-center" style={{ gap: 6 }}>
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: PRIORITY_COLORS[priority] ?? "var(--ink-3)",
                }}
              />
              <select
                value={priority}
                onChange={(e) => apply("priority", e.target.value)}
                style={selectStyle}
              >
                {Object.entries(PRIORITY_KEYS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>{t("app.ticket.type")}</span>
            <select
              value={type ?? ""}
              onChange={(e) => apply("type", e.target.value)}
              style={selectStyle}
            >
              <option value="">—</option>
              {TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.key)}
                </option>
              ))}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>{t("app.ticket.channel")}</span>
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>
              {CHANNEL_KEYS[channel] ? t(CHANNEL_KEYS[channel]) : channel}
            </span>
          </div>
          <div style={{ ...rowStyle, alignItems: "start" }}>
            <span style={{ ...labelStyle, paddingTop: 3 }}>{t("app.ticket.tags")}</span>
            <span className="flex flex-wrap items-center" style={{ gap: 6, paddingTop: 3 }}>
              {tags.length === 0 && (
                <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>—</span>
              )}
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded border px-1.5 py-0.5"
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    background: "var(--sunk)",
                    borderColor: "var(--line)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
