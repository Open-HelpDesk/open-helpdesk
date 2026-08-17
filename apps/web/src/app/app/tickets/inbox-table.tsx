"use client";

/**
 * AG-03 — Table de l'inbox (partie cliente) : navigation clavier j/k/↵/x, sélection
 * multiple avec barre flottante d'actions groupées branchée sur bulkUpdateTickets.
 * Grid exact : 34px 26px minmax(260px,1fr) 190px 108px 96px 120px 92px, min-width 940.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, SlaClock, StatusChip } from "@/components/ticket-bits";
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

  // Barre flottante du design : fond --ink, texte --bg, actions padding 5px 9px / 12.5px.
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
        {/* En-tête sticky h32 fond sunk */}
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
              aria-label="Tout sélectionner"
            />
          </span>
          <span />
          <span>Sujet</span>
          <span>Contact</span>
          <span>Statut</span>
          <span>SLA</span>
          <span>Assigné</span>
          <span className="text-right">Activité</span>
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
                padding: "0 14px",
                borderColor: "var(--line-2)",
                background: isSelected
                  ? "var(--acc-t)"
                  : t.overdue
                    ? "var(--dang-t)"
                    : "var(--bg)",
                boxShadow: i === cursor ? "inset 2px 0 0 var(--acc)" : undefined,
              }}
            >
              <span onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(t.id)}
                  className="block"
                  style={{ width: 14, height: 14, accentColor: "var(--acc)" }}
                  aria-label={`Sélectionner #${t.number}`}
                />
              </span>
              <span>
                <span
                  className="block rounded-full"
                  style={{
                    width: 7,
                    height: 7,
                    background: PRIORITY_COLORS[t.priority] ?? "var(--ink-3)",
                  }}
                  title={PRIORITY_LABELS_FR[t.priority]}
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
                    #{t.number}
                  </span>
                  <span
                    className="truncate"
                    style={{ fontSize: 13, fontWeight: t.isNew ? 600 : 500 }}
                  >
                    {t.subject}
                  </span>
                </span>
                {t.excerpt && (
                  <span className="truncate" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {t.excerpt}
                  </span>
                )}
              </span>
              <span
                className="flex min-w-0 flex-col"
                style={{ gap: 1, paddingRight: 12 }}
              >
                <span className="truncate" style={{ fontSize: 12.5 }}>
                  {t.contactName}
                </span>
                {t.orgName && (
                  <span className="truncate" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                    {t.orgName}
                  </span>
                )}
              </span>
              <span>
                <StatusChip status={t.status} />
              </span>
              <span>
                {t.sla && (
                  <span
                    className="inline-flex items-center whitespace-nowrap tabular-nums"
                    style={{
                      gap: 4,
                      padding: "2px 7px",
                      borderRadius: 5,
                      fontSize: 11.5,
                      fontWeight: 600,
                      background:
                        t.sla.tone === "neutral" ? "transparent" : `var(--${t.sla.tone}-t)`,
                      color:
                        t.sla.tone === "neutral" ? "var(--ink-3)" : `var(--${t.sla.tone})`,
                      border: `1px solid ${
                        t.sla.tone === "neutral" ? "var(--line)" : `var(--${t.sla.tone})`
                      }`,
                    }}
                  >
                    <SlaClock />
                    {t.sla.text}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 items-center" style={{ gap: 6 }}>
                {t.assigneeName ? (
                  <>
                    <Avatar name={t.assigneeName} size={20} tone={i} />
                    <span className="truncate" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      {t.assigneeName}
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
                {t.activity}
              </span>
            </div>
          );
        })}
      </div>

      {/* Barre flottante de sélection multiple */}
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
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          {bulkDivider}
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
            Supprimer
          </button>
          {bulkDivider}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            title="Annuler la sélection"
            style={{ padding: "5px 8px", borderRadius: 6, fontSize: 12.5, opacity: 0.65 }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
