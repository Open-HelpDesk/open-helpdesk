"use client";

/**
 * AG-03 (V2) — the ticket list: cards, j/k/↵/x keyboard navigation, and a
 * floating bulk-actions bar that appears only when something is selected.
 *
 * The V2 design replaces the dense table with one card per ticket and draws no
 * selection column. `x` still selects and the bulk bar still works, so the
 * capability survives the redesign without adding a checkbox to a resting state
 * that does without one.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ticket-bits";
import { PRIORITY_KEYS, PRIORITY_TOKEN, STATUS_KEYS, STATUS_TOKEN } from "@/lib/format";
import { useT } from "@/i18n/client";
import { bulkUpdateTickets, type BulkOp } from "./actions";

/** The priorities a row names out loud. The other two are the ordinary case. */
const PRIORITY_FLAGGED = new Set(["high", "urgent"]);

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
      {/* V2 — cards, not a table.
          A row of thin cells made every ticket look like a database record; the
          card gives the subject its own line and puts the two things an agent
          triages on — the SLA and the status — at a fixed place on the right.
          The selection column is gone with the table: `x` still selects, and the
          bulk bar below still appears, so nothing was removed from the screen
          except the always-visible checkbox the design does without. */}
      <div className="flex flex-col" style={{ gap: 8, padding: "0 20px 20px" }}>
        {rows.map((row, i) => {
          const st = STATUS_TOKEN[row.status] ?? "open";
          const isSelected = selected.has(row.id);
          // The border marks position and selection, not urgency: the SLA pill
          // already carries the red, and a second red on the same card competes
          // with it instead of adding anything.
          const line = isSelected
            ? "var(--brand)"
            : i === cursor
              ? "var(--brand-b)"
              : "var(--line)";
          return (
            <div
              key={row.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
            >
              {/* No onMouseEnter moving the cursor: the keyboard position is the
                  keyboard's, and having it follow the mouse meant crossing the
                  list on the way to something else silently re-aimed j/k and
                  Enter. Hovering now only lifts the card (.ohd-card). */}
              <Link
                href={row.href}
                className="ohd-card flex items-center"
                style={{
                  gap: 14,
                  padding: "13px 16px",
                  background: isSelected ? "var(--brand-t)" : "var(--panel)",
                  border: `1px solid ${line}`,
                  borderRadius: 13,
                  boxShadow: "0 1px 2px rgba(13,28,23,.03)",
                }}
              >
                <Avatar name={row.contactName} size={34} fontSize={11} />

                <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
                  <span className="flex items-center" style={{ gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11.5,
                        color: "var(--ink-3)",
                      }}
                    >
                      #{row.number}
                    </span>
                    <span className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>
                      {row.subject}
                    </span>
                  </span>
                  <span className="truncate" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {[row.contactName, row.orgName, row.excerpt].filter(Boolean).join(" · ")}
                  </span>
                </span>

                {/* Priority, but only the two levels that ask for a decision.
                    A dot on every row said "this ticket has a priority", which
                    is true of all of them; a named pill on the top two says
                    which rows to look at first, and leaves the rest quiet. */}
                {PRIORITY_FLAGGED.has(row.priority) && (
                  <span
                    className="inline-flex flex-none items-center whitespace-nowrap"
                    style={{
                      gap: 6,
                      padding: "4px 11px",
                      borderRadius: 999,
                      background: `var(--${PRIORITY_TOKEN[row.priority]}-t)`,
                      color: `var(--${PRIORITY_TOKEN[row.priority]})`,
                      fontSize: 11.5,
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        background: `var(--${PRIORITY_TOKEN[row.priority]})`,
                      }}
                    />
                    {t(PRIORITY_KEYS[row.priority]!)}
                  </span>
                )}

                {row.sla && (
                  <span
                    className="whitespace-nowrap"
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 600,
                      background: row.sla.tone === "dang" ? "var(--dang-t)" : row.sla.tone === "wait" ? "var(--wait-t)" : "var(--sunk)",
                      color: row.sla.tone === "dang" ? "var(--dang)" : row.sla.tone === "wait" ? "var(--wait)" : "var(--ink-2)",
                    }}
                  >
                    {row.sla.text}
                  </span>
                )}

                {/* A ticket still in `new` after a day stops saying so — see
                    NEW_BADGE_MS. It keeps its SLA chip and its priority, which
                    is what is actually worth reading by then. */}
                {(row.status !== "new" || row.isNew) && (
                  <span
                    className="inline-flex items-center whitespace-nowrap"
                    style={{
                      gap: 6,
                      padding: "4px 11px 4px 9px",
                      borderRadius: 999,
                      background: `var(--${st}-t)`,
                      color: `var(--${st})`,
                      fontSize: 11.5,
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{ width: 5, height: 5, borderRadius: "50%", background: `var(--${st})` }}
                    />
                    {t(STATUS_KEYS[row.status as keyof typeof STATUS_KEYS] ?? "app.status.open")}
                  </span>
                )}

                <span
                  className="tabular-nums text-right"
                  style={{ width: 60, flex: "none", fontSize: 12, color: "var(--ink-3)" }}
                >
                  {row.activity}
                </span>
              </Link>
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
