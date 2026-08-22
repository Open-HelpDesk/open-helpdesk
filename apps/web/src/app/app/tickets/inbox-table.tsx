"use client";

/**
 * AG-03 — Inbox table (client part): j/k/↵/x keyboard navigation, multi-selection
 * with a floating bulk-actions bar wired to bulkUpdateTickets.
 * Exact grid: 34px 26px minmax(260px,1fr) 190px 108px 96px 120px 92px, min-width 940.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, SlaClock, StatusChip } from "@/components/ticket-bits";
import { PRIORITY_COLORS, PRIORITY_KEYS, STATUS_KEYS } from "@/lib/format";
import { useT } from "@/i18n/client";
import { bulkUpdateTickets, type BulkOp } from "./actions";

export type InboxRowData = {
  id: string;
  number: number;
  subject: string;
  excerpt: string | null;
  isNew: boolean;
  priority: string;
  contactName: string;
  orgName: string | null;
  status: string;
  sla: { text: string; tone: "dang" | "wait" | "neutral" } | null;
  overdue: boolean;
  assigneeName: string | null;
  activity: string;
  href: string;
};

const GRID = "34px 26px minmax(260px,1fr) 190px 108px 96px 120px 92px";

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function InboxTable({
  rows,
  agents,
}: {
  rows: InboxRowData[];
  agents: { id: string; name: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagValue, setTagValue] = useState("");
  const [pending, startTransition] = useTransition();
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setCursor((c) => {
          const next = e.key === "j" ? Math.min(c + 1, rows.length - 1) : Math.max(c - 1, 0);
          rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "Enter") {
        const row = rows[cursor];
        if (row) router.push(row.href);
      } else if (e.key === "x") {
        e.preventDefault();
        const row = rows[cursor];
        if (row) {
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(row.id)) next.delete(row.id);
            else next.add(row.id);
            return next;
          });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, router]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }

  function runBulk(op: BulkOp, value?: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      await bulkUpdateTickets({ ids, op, value });
      setSelected(new Set());
      setTagValue("");
      router.refresh();
    });
  }

  // Floating bar from the design: --ink background, --bg text, actions padding 5px 9px / 12.5px.
  const bulkSelectStyle = {
    padding: "5px 9px",
    borderRadius: 6,
    background: "rgba(127,127,127,.28)",
    color: "var(--bg)",
    border: "none",
    fontSize: 12.5,
  } as const;
  const bulkDivider = (
    <span style={{ width: 1, height: 18, background: "currentColor", opacity: 0.25 }} />
  );

  return (
    <div>
      <div style={{ minWidth: 940 }}>
        {/* Sticky header, h32, sunk background */}
        <div
          className="sticky top-0 z-10 grid items-center border-b font-semibold"
          style={{
            gridTemplateColumns: GRID,
            height: 32,
            padding: "0 14px",
            fontSize: 11,
            letterSpacing: ".03em",
            background: "var(--sunk)",
            borderColor: "var(--line)",
            color: "var(--ink-3)",
          }}
        >
          <span>
            <input
              type="checkbox"
              checked={rows.length > 0 && selected.size === rows.length}
              onChange={toggleAll}
              className="block"
              style={{ width: 14, height: 14, accentColor: "var(--acc)" }}
              aria-label={t("app.tickets.selectAll")}
            />
          </span>
          <span />
          <span>{t("app.tickets.colSubject")}</span>
          <span>{t("app.tickets.colContact")}</span>
          <span>{t("app.tickets.status")}</span>
          <span>{t("app.tickets.colSla")}</span>
          <span>{t("app.tickets.assignee")}</span>
          <span className="text-right">{t("app.tickets.activity")}</span>
        </div>

        {rows.map((row, i) => {
          const isSelected = selected.has(row.id);
          const priorityKey = PRIORITY_KEYS[row.priority];
          return (
            <div
              key={row.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              onClick={() => router.push(row.href)}
              className="grid cursor-pointer items-center border-b"
              style={{
                gridTemplateColumns: GRID,
                minHeight: 44,
                padding: "0 14px",
                borderColor: "var(--line-2)",
                background: isSelected
                  ? "var(--acc-t)"
                  : row.overdue
                    ? "var(--dang-t)"
                    : "var(--bg)",
                boxShadow: i === cursor ? "inset 2px 0 0 var(--acc)" : undefined,
              }}
            >
              <span onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(row.id)}
                  className="block"
                  style={{ width: 14, height: 14, accentColor: "var(--acc)" }}
                  aria-label={t("app.tickets.selectTicket", {
                    number: String(row.number),
                  })}
                />
              </span>
              <span>
                <span
                  className="block rounded-full"
                  style={{
                    width: 7,
                    height: 7,
                    background: PRIORITY_COLORS[row.priority] ?? "var(--ink-3)",
                  }}
                  title={priorityKey ? t(priorityKey) : undefined}
                />
              </span>
              <span
                className="flex min-w-0 flex-col"
                style={{ gap: 1, paddingRight: 16 }}
              >
                <span className="flex min-w-0 items-center" style={{ gap: 7 }}>
                  <span
                    className="shrink-0"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-3)",
                    }}
                  >
                    #{row.number}
                  </span>
                  <span
                    className="truncate"
                    style={{ fontSize: 13, fontWeight: row.isNew ? 600 : 500 }}
                  >
                    {row.subject}
                  </span>
                </span>
                {row.excerpt && (
                  <span className="truncate" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {row.excerpt}
                  </span>
                )}
              </span>
              <span
                className="flex min-w-0 flex-col"
                style={{ gap: 1, paddingRight: 12 }}
              >
                <span className="truncate" style={{ fontSize: 12.5 }}>
                  {row.contactName}
                </span>
                {row.orgName && (
                  <span className="truncate" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                    {row.orgName}
                  </span>
                )}
              </span>
              <span>
                <StatusChip status={row.status} t={t} />
              </span>
              <span>
                {row.sla && (
                  <span
                    className="inline-flex items-center whitespace-nowrap tabular-nums"
                    style={{
                      gap: 4,
                      padding: "2px 7px",
                      borderRadius: 5,
                      fontSize: 11.5,
                      fontWeight: 600,
                      background:
                        row.sla.tone === "neutral" ? "transparent" : `var(--${row.sla.tone}-t)`,
                      color:
                        row.sla.tone === "neutral" ? "var(--ink-3)" : `var(--${row.sla.tone})`,
                      border: `1px solid ${
                        row.sla.tone === "neutral" ? "var(--line)" : `var(--${row.sla.tone})`
                      }`,
                    }}
                  >
                    <SlaClock />
                    {row.sla.text}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 items-center" style={{ gap: 6 }}>
                {row.assigneeName ? (
                  <>
                    <Avatar name={row.assigneeName} size={20} tone={i} />
                    <span className="truncate" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      {row.assigneeName}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="grid shrink-0 place-items-center rounded-full font-bold"
                      style={{
                        width: 20,
                        height: 20,
                        fontSize: 9,
                        background: "var(--sunk)",
                        color: "var(--ink-3)",
                      }}
                    >
                      ?
                    </span>
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>—</span>
                  </>
                )}
              </span>
              <span
                className="whitespace-nowrap text-right tabular-nums"
                style={{ fontSize: 12, color: "var(--ink-3)" }}
              >
                {row.activity}
              </span>
            </div>
          );
        })}
      </div>

      {/* Floating multi-selection bar */}
      {selected.size > 0 && (
        <div
          className="ohd-rise-fast fixed left-1/2 z-40 flex -translate-x-1/2 items-center"
          style={{
            bottom: 22,
            gap: 6,
            padding: "7px 9px",
            borderRadius: 9,
            background: "var(--ink)",
            color: "var(--bg)",
            boxShadow: "0 8px 28px rgba(0,0,0,.24)",
            opacity: pending ? 0.7 : 1,
          }}
        >
          <span
            className="whitespace-nowrap"
            style={{ fontSize: 12.5, fontWeight: 600, padding: "0 6px" }}
          >
            {t("app.tickets.selectedCount", { count: selected.size })}
          </span>
          {bulkDivider}
          <select
            defaultValue=""
            onChange={(e) => e.target.value && runBulk("assign", e.target.value)}
            style={bulkSelectStyle}
            aria-label={t("app.tickets.assign")}
          >
            <option value="" disabled>
              {t("app.tickets.assign")}
            </option>
            <option value="">{t("app.tickets.unassigned")}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id} style={{ color: "var(--ink)" }}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && runBulk("status", e.target.value)}
            style={bulkSelectStyle}
            aria-label={t("app.tickets.status")}
          >
            <option value="" disabled>
              {t("app.tickets.status")}
            </option>
            {Object.entries(STATUS_KEYS).map(([k, v]) => (
              <option key={k} value={k} style={{ color: "var(--ink)" }}>
                {t(v)}
              </option>
            ))}
          </select>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && runBulk("priority", e.target.value)}
            style={bulkSelectStyle}
            aria-label={t("app.tickets.priority")}
          >
            <option value="" disabled>
              {t("app.tickets.priority")}
            </option>
            {Object.entries(PRIORITY_KEYS).map(([k, v]) => (
              <option key={k} value={k} style={{ color: "var(--ink)" }}>
                {t(v)}
              </option>
            ))}
          </select>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runBulk("tag", tagValue);
            }}
            className="flex items-center"
          >
            <input
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              placeholder={t("app.tickets.tagPlaceholder")}
              className="outline-none placeholder:opacity-60"
              style={{ ...bulkSelectStyle, width: 92 }}
            />
          </form>
          <button
            type="button"
            onClick={() => runBulk("delete")}
            style={{
              padding: "5px 9px",
              borderRadius: 6,
              fontSize: 12.5,
              background: "var(--dang)",
              color: "#fff",
            }}
          >
            {t("app.tickets.delete")}
          </button>
          {bulkDivider}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            title={t("app.tickets.cancelSelection")}
            style={{ padding: "5px 8px", borderRadius: 6, fontSize: 12.5, opacity: 0.65 }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
