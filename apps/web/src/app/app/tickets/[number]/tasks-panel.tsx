"use client";

/**
 * AG-04 (V2) — the Tasks tab.
 *
 * Client-side only for the disclosure of the "new task" row: everything that
 * changes data goes through a plain form and a server action, so ticking a task
 * works without JavaScript and cannot drift from what the server stored.
 */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { Avatar } from "@/components/ticket-bits";
import { addTicketTask, deleteTicketTask, toggleTicketTask } from "./task-actions";

export type TaskRow = {
  id: string;
  label: string;
  done: boolean;
  dueLabel: string | null;
  /** True when the task is open and its due date is today or past. */
  urgent: boolean;
  assigneeName: string | null;
};

const CARD: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 13,
  padding: "13px 16px",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(13,28,23,.03)",
};

export function TasksPanel({
  number,
  tasks,
  agents,
  meId,
}: {
  number: number;
  tasks: TaskRow[];
  agents: { id: string; name: string }[];
  meId: string;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  const open = tasks.filter((task) => !task.done).length;
  const done = tasks.length - open;

  return (
    <div className="flex flex-col" style={{ maxWidth: 760, gap: 10 }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
          {t("app.ticket.tasksSummary", { open, done })}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ohd-hover-edge-ink flex items-center"
          style={{
            height: 32,
            padding: "0 13px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--panel)",
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          {t("app.ticket.taskNew")}
        </button>
      </div>

      {adding && (
        <form
          action={addTicketTask}
          onSubmit={() => {
            setAdding(false);
            setLabel("");
          }}
          className="flex flex-wrap items-center"
          style={{
            gap: 12,
            padding: "11px 14px",
            background: "var(--panel)",
            border: "1.5px solid var(--brand-b)",
            borderRadius: 12,
            boxShadow: "0 0 0 4px var(--brand-t)",
          }}
        >
          <input type="hidden" name="number" value={number} />
          <span
            aria-hidden
            style={{
              width: 20,
              height: 20,
              flex: "none",
              borderRadius: 6,
              border: "1.5px solid var(--line)",
              background: "var(--panel)",
            }}
          />
          <input
            name="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("app.ticket.taskPlaceholder")}
            autoFocus
            className="min-w-0 flex-1 outline-none"
            style={{
              minWidth: 180,
              border: "none",
              background: "transparent",
              fontSize: 14,
              color: "var(--ink)",
            }}
          />
          <div className="flex items-center" style={{ gap: 7 }}>
            <select
              name="assignee"
              defaultValue={meId}
              aria-label={t("app.tickets.assignee")}
              style={{
                height: 30,
                padding: "0 10px",
                border: "1px solid var(--line)",
                borderRadius: 999,
                fontSize: 12,
                color: "var(--ink-2)",
                background: "var(--panel)",
              }}
            >
              <option value="none">{t("app.tickets.unassigned")}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              name="due"
              type="date"
              aria-label={t("app.ticket.taskDue")}
              style={{
                height: 30,
                padding: "0 10px",
                border: "1px solid var(--line)",
                borderRadius: 999,
                fontSize: 12,
                color: "var(--ink-2)",
                background: "var(--panel)",
              }}
            />
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setLabel("");
              }}
              style={{
                height: 30,
                padding: "0 11px",
                border: "1px solid var(--line)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              {t("app.ticket.taskCancel")}
            </button>
            {/* Disabled until there is a label: the design greys the button out
                rather than accepting a blank task and reporting it afterwards. */}
            <button
              type="submit"
              disabled={!label.trim()}
              style={{
                height: 30,
                padding: "0 13px",
                borderRadius: 8,
                background: label.trim() ? "var(--brand)" : "var(--ink-3)",
                color: "var(--on-brand)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {t("app.ticket.taskAdd")}
            </button>
          </div>
        </form>
      )}

      {tasks.length === 0 && !adding ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 520 }}>
          {t("app.ticket.tasksEmpty")}
        </p>
      ) : (
        tasks.map((task) => (
          <div key={task.id} style={CARD}>
            <form action={toggleTicketTask} style={{ display: "flex", flex: "none" }}>
              <input type="hidden" name="number" value={number} />
              <input type="hidden" name="id" value={task.id} />
              <button
                type="submit"
                role="checkbox"
                aria-checked={task.done}
                aria-label={task.label}
                className="grid place-items-center font-bold"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  border: `1.5px solid ${task.done ? "var(--ok)" : "var(--line)"}`,
                  background: task.done ? "var(--ok)" : "var(--panel)",
                  color: "var(--on-ok)",
                  fontSize: 11,
                }}
              >
                {task.done ? "✓" : ""}
              </button>
            </form>

            <span
              className="min-w-0 flex-1"
              style={{
                fontSize: 14,
                color: task.done ? "var(--ink-3)" : "var(--ink)",
                textDecoration: task.done ? "line-through" : "none",
              }}
            >
              {task.label}
            </span>

            <div className="flex items-center" style={{ gap: 8 }}>
              {task.assigneeName && <Avatar name={task.assigneeName} size={26} fontSize={9.5} />}
              <span
                className="whitespace-nowrap"
                style={{
                  fontSize: 12,
                  color: task.urgent ? "var(--wait)" : "var(--ink-3)",
                }}
              >
                {task.dueLabel ?? t("app.ticket.taskNoDue")}
              </span>
              <form action={deleteTicketTask} style={{ display: "flex" }}>
                <input type="hidden" name="number" value={number} />
                <input type="hidden" name="id" value={task.id} />
                <button
                  type="submit"
                  title={t("app.ticket.taskDelete")}
                  aria-label={t("app.ticket.taskDelete")}
                  className="ohd-row grid place-items-center"
                  style={{ width: 26, height: 26, borderRadius: 6, color: "var(--ink-3)", fontSize: 13 }}
                >
                  ✕
                </button>
              </form>
            </div>
          </div>
        ))
      )}

      {/* The footnote repeats the empty state's own sentence, so it only shows
          once there is a list to footnote. */}
      {tasks.length > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", textWrap: "pretty" }}>
          {t("app.ticket.tasksFootnote")}
        </p>
      )}
    </div>
  );
}
