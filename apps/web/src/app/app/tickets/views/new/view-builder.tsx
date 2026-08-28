"use client";

/**
 * newview form — conditions as rows of `1fr 110px 1.2fr 28px`, values as chips,
 * and a live preview count.
 *
 * The preview goes through a server action rather than an API route: the count
 * has to be scoped to the caller's workspace, and `previewViewCount` already
 * establishes that with requireAgent. One less endpoint to guard.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { INBOX_SORTS, PRIORITY_KEYS, STATUS_KEYS, type InboxSort } from "@/lib/format";
import { createView, previewViewCount } from "./actions";

type Field = "status" | "priority" | "assignee" | "team" | "tag";
type Row = { id: number; field: Field; value: string[] };

const MULTI: Field[] = ["status", "priority", "tag"];
const STATUSES = ["new", "open", "waiting", "on_hold", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

const labelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--ink-2)",
};

/** Condition cell — h38, radius 9, the mockup's field box. */
const cell: React.CSSProperties = {
  height: 38,
  padding: "0 11px",
  border: "1px solid var(--line)",
  borderRadius: 9,
  background: "var(--panel)",
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  width: "100%",
};

export function ViewBuilder({
  agents,
  me,
  teams,
  tags,
  nameError,
}: {
  agents: { id: string; name: string }[];
  me: { id: string; name: string };
  teams: { id: string; name: string }[];
  tags: string[];
  nameError: boolean;
}) {
  const t = useT();
  const [shared, setShared] = useState<"private" | "team">("private");
  const [rows, setRows] = useState<Row[]>([{ id: 1, field: "status", value: ["new", "open"] }]);
  const [sort, setSort] = useState<InboxSort>("sla");
  const [matches, setMatches] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const conditions = rows
    .filter((r) => r.value.length > 0)
    .map((r) => ({
      field: r.field,
      value: MULTI.includes(r.field) ? r.value : (r.value[0] ?? ""),
    }));
  const conditionsJson = JSON.stringify(conditions);

  // The preview follows the conditions, debounced: every chip click would
  // otherwise be one round trip.
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          setMatches(await previewViewCount(JSON.parse(conditionsJson)));
        } catch {
          setMatches(null);
        }
      });
    }, 220);
    return () => clearTimeout(timer);
  }, [conditionsJson]);

  const FIELD_LABEL: Record<Field, string> = {
    status: t("app.newTicket.status"),
    priority: t("app.tickets.priority"),
    assignee: t("app.newTicket.assignee"),
    team: t("app.tickets.team"),
    tag: t("app.newTicket.tags"),
  };
  const SORT_LABEL: Record<InboxSort, string> = {
    sla: t("app.tickets.sortSla"),
    recent: t("app.tickets.sortNewest"),
    oldest: t("app.tickets.sortOldest"),
    priority: t("app.tickets.priority"),
    lastReply: t("app.tickets.sortLastReply"),
  };

  /** The values a field offers, and how each one reads. */
  function optionsFor(field: Field): { value: string; label: string }[] {
    switch (field) {
      case "status":
        return STATUSES.map((s) => ({ value: s, label: t(STATUS_KEYS[s]!) }));
      case "priority":
        return PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_KEYS[p]!) }));
      case "assignee":
        return [
          { value: "none", label: t("app.views.unassigned") },
          { value: me.id, label: me.name },
          ...agents.map((a) => ({ value: a.id, label: a.name })),
        ];
      case "team":
        return [
          { value: "none", label: t("app.views.unassigned") },
          ...teams.map((x) => ({ value: x.id, label: x.name })),
        ];
      case "tag":
        return tags.map((x) => ({ value: x, label: x }));
    }
  }

  const setField = (id: number, field: Field) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, field, value: [] } : r)));

  const toggleValue = (id: number, value: string) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        if (!MULTI.includes(r.field)) return { ...r, value: [value] };
        return r.value.includes(value)
          ? { ...r, value: r.value.filter((v) => v !== value) }
          : { ...r, value: [...r.value, value] };
      }),
    );

  return (
    <form action={createView} className="flex flex-col">
      <input type="hidden" name="conditions" value={conditionsJson} />
      <input type="hidden" name="shared" value={shared} />
      <input type="hidden" name="sort" value={sort} />

      <div
        className="flex flex-col"
        style={{ padding: 20, gap: 16, maxHeight: "66vh", overflow: "auto" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
          <label className="flex min-w-0 flex-col" style={{ gap: 6 }}>
            <span style={labelStyle}>{t("app.views.nameLabel")}</span>
            <input
              className="ohd-field outline-none"
              name="name"
              required
              autoFocus
              maxLength={80}
              style={{
                height: 42,
                padding: "0 12px",
                border: `1px solid ${nameError ? "var(--dang)" : "var(--line)"}`,
                borderRadius: 10,
                background: "var(--panel)",
                fontSize: 13.5,
                width: "100%",
              }}
            />
          </label>
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={labelStyle}>{t("app.views.visibility")}</span>
            <div
              className="flex"
              style={{ gap: 2, padding: 3, background: "var(--sunk)", borderRadius: 9 }}
            >
              {(
                [
                  ["private", t("app.views.sharePrivate")],
                  ["team", t("app.tickets.team")],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setShared(key)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 7,
                    fontSize: 12.5,
                    fontWeight: shared === key ? 600 : 450,
                    color: shared === key ? "var(--ink)" : "var(--ink-3)",
                    background: shared === key ? "var(--panel)" : "transparent",
                    boxShadow: shared === key ? "0 1px 2px rgba(13,28,23,.08)" : undefined,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {nameError && (
          <p
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--dang-t)",
              border: "1px solid var(--dang)",
              color: "var(--dang)",
              fontSize: 13,
            }}
          >
            {t("app.views.nameRequired")}
          </p>
        )}

        <div className="flex flex-col" style={{ gap: 9 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <span style={labelStyle}>{t("app.views.conditions")}</span>
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {t("app.views.conditionsHint")}
            </span>
          </div>

          {rows.map((row) => {
            const multi = MULTI.includes(row.field);
            const options = optionsFor(row.field);
            const chosen = options.filter((o) => row.value.includes(o.value));
            return (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 1.2fr 28px",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <select
                  className="ohd-field outline-none"
                  value={row.field}
                  onChange={(e) => setField(row.id, e.target.value as Field)}
                  style={cell}
                >
                  {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABEL[f]}
                    </option>
                  ))}
                </select>

                {/* The operator follows from the field: a label, not a choice. */}
                <span
                  style={{ ...cell, border: "none", padding: 0, color: "var(--ink-2)", fontSize: 12.5 }}
                >
                  {multi ? t("app.views.opIsAmong") : t("app.views.opIs")}
                </span>

                {/* Values as chips — click to add, click again to drop. */}
                <details className="relative min-w-0">
                  <summary
                    className="ohd-field cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                    style={{ ...cell, overflow: "hidden" }}
                  >
                    <span className="flex min-w-0 flex-1 items-center" style={{ gap: 6 }}>
                      {chosen.length === 0 ? (
                        <span style={{ color: "var(--ink-3)" }}>{t("app.views.anyValue")}</span>
                      ) : (
                        chosen.slice(0, 2).map((o) => (
                          <span
                            key={o.value}
                            className="whitespace-nowrap"
                            style={{
                              padding: "2px 9px",
                              borderRadius: 999,
                              background: "var(--brand-t)",
                              color: "var(--brand)",
                              fontSize: 11.5,
                              fontWeight: 600,
                            }}
                          >
                            {o.label}
                          </span>
                        ))
                      )}
                      {chosen.length > 2 && (
                        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                          +{chosen.length - 2}
                        </span>
                      )}
                    </span>
                    <span style={{ opacity: 0.4, fontSize: 9 }}>▾</span>
                  </summary>
                  <div
                    className="absolute left-0 z-30 mt-1 flex max-h-56 flex-col overflow-auto py-1"
                    style={{
                      minWidth: 200,
                      background: "var(--panel)",
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      boxShadow: "0 12px 32px rgba(0,0,0,.14)",
                    }}
                  >
                    {options.length === 0 ? (
                      <span style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--ink-3)" }}>
                        {t("app.views.anyValue")}
                      </span>
                    ) : (
                      options.map((o) => {
                        const on = row.value.includes(o.value);
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => toggleValue(row.id, o.value)}
                            className="ohd-hover flex items-center text-left"
                            style={{ gap: 8, padding: "7px 12px", fontSize: 13 }}
                          >
                            <span
                              style={{
                                width: 14,
                                fontSize: 11,
                                color: "var(--brand)",
                                fontWeight: 700,
                              }}
                            >
                              {on ? "✓" : ""}
                            </span>
                            {o.label}
                          </button>
                        );
                      })
                    )}
                  </div>
                </details>

                <button
                  type="button"
                  title={t("app.views.removeCondition")}
                  onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
                  style={{ color: "var(--ink-3)", fontSize: 14, textAlign: "center" }}
                >
                  ✕
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                { id: (rs.at(-1)?.id ?? 0) + 1, field: "priority", value: [] },
              ])
            }
            className="self-start"
            style={{
              fontSize: 12.5,
              color: "var(--brand-2)",
              fontWeight: 600,
              padding: "2px 0",
            }}
          >
            {t("app.views.addCondition")}
          </button>
        </div>

        <label className="flex flex-col" style={{ gap: 6, maxWidth: 300 }}>
          <span style={labelStyle}>{t("app.views.defaultSort")}</span>
          <select
            className="ohd-field outline-none"
            value={sort}
            onChange={(e) => setSort(e.target.value as InboxSort)}
            style={cell}
          >
            {INBOX_SORTS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </select>
        </label>

        <div
          className="flex items-center"
          style={{
            gap: 11,
            padding: "12px 14px",
            background: "var(--brand-t)",
            border: "1px solid var(--brand-b)",
            borderRadius: 11,
            fontSize: 13,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            style={{ flex: "none" }}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span style={{ color: "var(--ink)" }}>
            {matches === null ? "…" : t("app.views.previewCount", { count: matches })}{" "}
            <span style={{ color: "var(--ink-2)" }}>{t("app.views.previewHint")}</span>
          </span>
        </div>
      </div>

      <div
        className="flex items-center justify-end"
        style={{
          gap: 10,
          padding: "13px 20px",
          background: "var(--canvas)",
          borderTop: "1px solid var(--line)",
        }}
      >
        <Link
          href="/app/tickets"
          className="ohd-hover-edge-ink grid place-items-center"
          style={{
            height: 36,
            padding: "0 15px",
            border: "1px solid var(--line)",
            borderRadius: 9,
            background: "var(--panel)",
            fontSize: 13,
          }}
        >
          {t("app.newTicket.cancel")}
        </Link>
        <button
          type="submit"
          className="grid place-items-center font-semibold text-white"
          style={{
            height: 36,
            padding: "0 17px",
            borderRadius: 9,
            background: "var(--brand)",
            fontSize: 13,
          }}
        >
          {t("app.views.create")}
        </button>
      </div>
    </form>
  );
}
