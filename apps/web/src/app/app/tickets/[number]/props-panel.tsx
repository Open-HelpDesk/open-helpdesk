"use client";

/**
 * AG-04 — Panneau propriétés (partie cliente) : groupes Affectation et Classification,
 * selects auto-appliqués via updateTicketProps (rangées 96px / 1fr).
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_LABELS_FR, PRIORITY_COLORS, PRIORITY_LABELS_FR } from "@/lib/format";
import { updateTicketProps } from "../actions";

const TYPES = ["Question", "Incident", "Tâche", "Autre"];

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
    height: 28,
    width: "100%",
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "var(--bg)",
    color: "var(--ink)",
    fontSize: 12.5,
    padding: "0 6px",
  } as const;

  const labelStyle = { fontSize: 12, color: "var(--ink-3)" } as const;
  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "96px 1fr",
    alignItems: "center",
    gap: 8,
  } as const;

  return (
    <div className="flex flex-col gap-5" style={{ opacity: pending ? 0.6 : 1 }}>
      <section>
        <p
          className="mb-2 font-semibold uppercase tracking-wider"
          style={{ fontSize: 11, color: "var(--ink-3)" }}
        >
          Affectation
        </p>
        <div className="flex flex-col gap-2">
          <div style={rowStyle}>
            <span style={labelStyle}>Assigné</span>
            <select
              value={assigneeId ?? ""}
              onChange={(e) => apply("assigneeId", e.target.value)}
              style={selectStyle}
            >
              <option value="">Non assigné</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Équipe</span>
            <select
              value={teamId ?? ""}
              onChange={(e) => apply("teamId", e.target.value)}
              style={selectStyle}
            >
              <option value="">Aucune équipe</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <p
          className="mb-2 font-semibold uppercase tracking-wider"
          style={{ fontSize: 11, color: "var(--ink-3)" }}
        >
          Classification
        </p>
        <div className="flex flex-col gap-2">
          <div style={rowStyle}>
            <span style={labelStyle}>Priorité</span>
            <div className="flex items-center gap-1.5">
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
                {Object.entries(PRIORITY_LABELS_FR).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Type</span>
            <select
              value={type ?? ""}
              onChange={(e) => apply("type", e.target.value)}
              style={selectStyle}
            >
              <option value="">—</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Canal</span>
            <span style={{ fontSize: 12.5 }}>{CHANNEL_LABELS_FR[channel] ?? channel}</span>
          </div>
          <div style={{ ...rowStyle, alignItems: "start" }}>
            <span style={{ ...labelStyle, paddingTop: 3 }}>Tags</span>
            <span className="flex flex-wrap gap-1">
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
