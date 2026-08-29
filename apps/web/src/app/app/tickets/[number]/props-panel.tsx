"use client";

/**
 * AG-04 — Properties panel (client part).
 *
 * V2 turns the two-column rows (label left, control right, 96 px apart) into a
 * stack of labelled fields: the label sits above a framed h36 control. At 304 px
 * the old rows left the selects about 190 px wide, which truncated half the
 * agent names; the label above gives the control the full width of the card.
 *
 * Every change applies on its own through updateTicketProps — there is no Save
 * button, and the panel dims while the transition runs.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_KEYS, PRIORITY_KEYS, STATUS_KEYS } from "@/lib/format";
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

/**
 * The statuses an agent picks by hand. "closed" is missing on purpose: it is
 * reached by the automatic closure that follows a resolution, and offering it
 * here would let an agent skip the CSAT window the resolution opens.
 */
const STATUSES = ["new", "open", "waiting", "on_hold", "resolved"] as const;

/** Framed control of the design: h36, r9, hairline, panel ground. */
const FIELD: React.CSSProperties = {
  height: 36,
  width: "100%",
  borderRadius: 9,
  border: "1px solid var(--line)",
  background: "var(--panel)",
  color: "var(--ink)",
  fontSize: 13,
  padding: "0 9px",
};

const LABEL: React.CSSProperties = { fontSize: 12, color: "var(--ink-3)" };

/** Declared here and not inside PropsForm: a component redefined on every render
 *  is a new type, and React would remount the select — losing its focus. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col" style={{ gap: 5 }}>
      <span style={LABEL}>{label}</span>
      {children}
    </label>
  );
}

export function PropsForm({
  ticketId,
  number,
  status,
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
  status: string;
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

  return (
    <div className="flex flex-col" style={{ gap: 11, opacity: pending ? 0.6 : 1 }}>
      <Field label={t("app.tickets.status")}>
        <select
          value={status}
          onChange={(e) => apply("status", e.target.value)}
          style={FIELD}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_KEYS[s]!)}
            </option>
          ))}
          {/* A closed ticket still has to show what it is, even though the
              picker does not offer that value. */}
          {status === "closed" && <option value="closed">{t("app.status.closed")}</option>}
        </select>
      </Field>

      <Field label={t("app.ticket.priority")}>
        <select
          value={priority}
          onChange={(e) => apply("priority", e.target.value)}
          style={FIELD}
        >
          {Object.entries(PRIORITY_KEYS).map(([k, v]) => (
            <option key={k} value={k}>
              {t(v)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("app.ticket.assignee")}>
        <select
          value={assigneeId ?? ""}
          onChange={(e) => apply("assigneeId", e.target.value)}
          style={FIELD}
        >
          <option value="">{t("app.ticket.unassigned")}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("app.ticket.team")}>
        <select
          value={teamId ?? ""}
          onChange={(e) => apply("teamId", e.target.value)}
          style={FIELD}
        >
          <option value="">{t("app.ticket.noTeam")}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("app.ticket.type")}>
        <select
          value={type ?? ""}
          onChange={(e) => apply("type", e.target.value)}
          style={FIELD}
        >
          <option value="">—</option>
          {TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.key)}
            </option>
          ))}
        </select>
      </Field>

      {/* Channel and tags are read here, not set: the channel is how the ticket
          arrived, and tags are written by the rules and the macros. */}
      <div className="flex items-baseline" style={{ gap: 8 }}>
        <span style={LABEL}>{t("app.ticket.channel")}</span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {CHANNEL_KEYS[channel] ? t(CHANNEL_KEYS[channel]) : channel}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-col" style={{ gap: 5 }}>
          <span style={LABEL}>{t("app.ticket.tags")}</span>
          <span className="flex flex-wrap items-center" style={{ gap: 6 }}>
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
      )}
    </div>
  );
}
