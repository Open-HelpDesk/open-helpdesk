"use client";

/**
 * AG-03 — Table de l'inbox (partie cliente) : navigation clavier j/k/↵/x, sélection
 * multiple avec barre flottante d'actions groupées branchée sur bulkUpdateTickets.
 * Grid exact : 34px 26px minmax(260px,1fr) 190px 108px 96px 120px 92px, min-width 940.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, StatusChip } from "@/components/ticket-bits";
import { PRIORITY_COLORS, PRIORITY_LABELS_FR, STATUS_LABELS_FR } from "@/lib/format";
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

  const bulkSelectStyle = {
    height: 26,
    borderRadius: 5,
    background: "rgba(255,255,255,.12)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.25)",
    fontSize: 12,
  } as const;

  return (
    <div>
      <div style={{ minWidth: 940 }}>
        {/* En-tête sticky h32 fond sunk */}
        <div
          className="sticky top-0 z-10 grid items-center border-b font-semibold uppercase tracking-wide"
          style={{
            gridTemplateColumns: GRID,
            height: 32,
            fontSize: 11,
            background: "var(--sunk)",
            borderColor: "var(--line)",
            color: "var(--ink-3)",
          }}
        >
          <span className="flex justify-center">
            <input
              type="checkbox"
              checked={rows.length > 0 && selected.size === rows.length}
              onChange={toggleAll}
              style={{ width: 14, height: 14 }}
              aria-label="Tout sélectionner"
            />
          </span>
          <span />
          <span>Sujet</span>
          <span>Contact</span>
          <span>Statut</span>
          <span>SLA</span>
          <span>Assigné</span>
          <span className="pr-3 text-right">Activité</span>
        </div>

        {rows.map((t, i) => {
          const isSelected = selected.has(t.id);
          return (
            <div
              key={t.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              onClick={() => router.push(t.href)}
              className="grid cursor-pointer items-center border-b"
              style={{
                gridTemplateColumns: GRID,
                minHeight: 44,
                borderColor: "var(--line-2)",
                background: isSelected
                  ? "var(--acc-t)"
                  : t.overdue
                    ? "var(--dang-t)"
                    : "var(--bg)",
                boxShadow: i === cursor ? "inset 2px 0 0 var(--acc)" : undefined,
              }}
            >
              <span className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(t.id)}
                  style={{ width: 14, height: 14 }}
                  aria-label={`Sélectionner #${t.number}`}
                />
              </span>
              <span className="flex justify-center">
                <span
                  className="rounded-full"
                  style={{
                    width: 7,
                    height: 7,
                    background: PRIORITY_COLORS[t.priority] ?? "var(--ink-3)",
                  }}
                  title={PRIORITY_LABELS_FR[t.priority]}
                />
              </span>
              <span className="min-w-0 py-1.5 pr-3">
                <span className="block truncate">
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-3)",
                    }}
                  >
                    #{t.number}
                  </span>{" "}
                  <span style={{ fontSize: 13, fontWeight: t.isNew ? 600 : 450 }}>
                    {t.subject}
                  </span>
                </span>
                {t.excerpt && (
                  <span
                    className="block truncate"
                    style={{ fontSize: 12, color: "var(--ink-3)" }}
                  >
                    {t.excerpt}
                  </span>
                )}
              </span>
              <span className="min-w-0 pr-3">
                <span className="block truncate" style={{ fontSize: 12.5 }}>
                  {t.contactName}
                </span>
                {t.orgName && (
                  <span
                    className="block truncate"
                    style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                  >
                    {t.orgName}
                  </span>
                )}
              </span>
              <span className="pr-2">
                <StatusChip status={t.status} />
              </span>
              <span className="pr-2">
                {t.sla &&
                  (t.sla.tone === "neutral" ? (
                    <span
                      className="inline-block whitespace-nowrap rounded border px-1.5 py-0.5 tabular-nums"
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        borderColor: "var(--line)",
                        color: "var(--ink-2)",
                        background: "var(--bg)",
                      }}
                    >
                      {t.sla.text}
                    </span>
                  ) : (
                    <span
                      className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 font-semibold tabular-nums"
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        background: `var(--${t.sla.tone}-t)`,
                        color: `var(--${t.sla.tone})`,
                      }}
                    >
                      {t.sla.text}
                    </span>
                  ))}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 pr-2">
                {t.assigneeName ? (
                  <>
                    <Avatar name={t.assigneeName} size={20} />
                    <span className="truncate" style={{ fontSize: 12 }}>
                      {t.assigneeName}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>—</span>
                )}
              </span>
              <span
                className="whitespace-nowrap pr-3 text-right tabular-nums"
                style={{ fontSize: 11.5, color: "var(--ink-3)" }}
              >
                {t.activity}
              </span>
            </div>
          );
        })}
      </div>

      {/* Barre flottante de sélection multiple */}
      {selected.size > 0 && (
        <div
          className="ohd-rise-fast fixed bottom-10 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-2 shadow-lg"
          style={{ background: "var(--ink)", color: "#fff", opacity: pending ? 0.7 : 1 }}
        >
          <span className="whitespace-nowrap text-[12.5px] font-semibold">
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <span className="mx-1 h-5 w-px" style={{ background: "rgba(255,255,255,.25)" }} />
          <select
            defaultValue=""
            onChange={(e) => e.target.value && runBulk("assign", e.target.value)}
            style={bulkSelectStyle}
            aria-label="Assigner"
          >
            <option value="" disabled>
              Assigner
            </option>
            <option value="">Non assigné</option>
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
            aria-label="Statut"
          >
            <option value="" disabled>
              Statut
            </option>
            {Object.entries(STATUS_LABELS_FR).map(([k, v]) => (
              <option key={k} value={k} style={{ color: "var(--ink)" }}>
                {v}
              </option>
            ))}
          </select>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && runBulk("priority", e.target.value)}
            style={bulkSelectStyle}
            aria-label="Priorité"
          >
            <option value="" disabled>
              Priorité
            </option>
            {Object.entries(PRIORITY_LABELS_FR).map(([k, v]) => (
              <option key={k} value={k} style={{ color: "var(--ink)" }}>
                {v}
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
              placeholder="Taguer…"
              className="px-2 outline-none placeholder:text-white/60"
              style={{ ...bulkSelectStyle, width: 90 }}
            />
          </form>
          <button
            type="button"
            onClick={() => runBulk("delete")}
            className="rounded px-2 text-[12px] font-medium"
            style={{ height: 26, background: "var(--dang)", color: "#fff" }}
          >
            Supprimer
          </button>
          <span className="mx-1 h-5 w-px" style={{ background: "rgba(255,255,255,.25)" }} />
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            title="Annuler la sélection"
            className="px-1 text-[14px]"
            style={{ color: "rgba(255,255,255,.8)" }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
