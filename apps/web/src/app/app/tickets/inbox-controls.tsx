"use client";

/**
 * AG-03 (V2) — the two menus above the ticket list.
 *
 * They replace the row of single-value chips. The chips could express one status
 * OR one priority; these express several at once and say how many tickets each
 * box would bring, which is the thing you actually want to know before ticking
 * it.
 *
 * State lives in the query string, not in the component: a filtered inbox is
 * something an agent sends to a colleague, and it has to survive a reload.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { INBOX_SORTS, type InboxSort } from "@/lib/format";

export type Facets = {
  priorities: { key: string; count: number }[];
  channels: { key: string; count: number }[];
  orgs: { key: string; name: string; count: number }[];
};

export type Selection = { priorities: string[]; channels: string[]; orgs: string[] };

const PANEL: React.CSSProperties = {
  position: "absolute",
  top: 40,
  right: 0,
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  boxShadow: "0 2px 4px rgba(13,28,23,.05), 0 18px 40px -16px rgba(13,28,23,.25)",
  padding: 6,
  zIndex: 40,
};

const BUTTON: React.CSSProperties = {
  height: 34,
  padding: "0 13px",
  borderRadius: 9,
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
};

/** Closes the panel on an outside click or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function InboxControls({
  sort,
  facets,
  selection,
  baseQuery,
}: {
  sort: InboxSort;
  facets: Facets;
  selection: Selection;
  /** The current query string without the parts these menus own. */
  baseQuery: string;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState<"none" | "sort" | "filters">("none");
  const [draft, setDraft] = useState<Selection>(selection);
  const wrap = useDismiss(open !== "none", () => setOpen("none"));

  // The URL is the source of truth: a back button or a shared link has to win
  // over whatever the menu was last showing.
  useEffect(() => setDraft(selection), [selection]);

  const SORT_LABEL: Record<InboxSort, string> = {
    sla: t("app.tickets.sortSla"),
    recent: t("app.tickets.sortNewest"),
    oldest: t("app.tickets.sortOldest"),
    priority: t("app.tickets.priority"),
    lastReply: t("app.tickets.sortLastReply"),
  };

  const push = (next: { sort?: InboxSort; sel?: Selection }) => {
    const q = new URLSearchParams(baseQuery);
    const s = next.sort ?? sort;
    if (s !== "sla") q.set("sort", s);
    else q.delete("sort");
    const sel = next.sel ?? draft;
    for (const [key, values] of [
      ["prio", sel.priorities],
      ["chan", sel.channels],
      ["org", sel.orgs],
    ] as const) {
      q.delete(key);
      for (const v of values) q.append(key, v);
    }
    // Any change to the list starts again at page 1: page 4 of a narrower list
    // is often empty, and an empty page reads as "no tickets".
    q.delete("page");
    const query = q.toString();
    router.push(query ? `/app/tickets?${query}` : "/app/tickets");
  };

  const activeCount =
    selection.priorities.length + selection.channels.length + selection.orgs.length;

  const toggle = (group: keyof Selection, key: string) => {
    const has = draft[group].includes(key);
    const next: Selection = {
      ...draft,
      [group]: has ? draft[group].filter((k) => k !== key) : [...draft[group], key],
    };
    setDraft(next);
    push({ sel: next });
  };

  type Group = {
    label: string;
    group: keyof Selection;
    items: { key: string; label: string; count: number }[];
  };
  const GROUPS: Group[] = ([
    {
      label: t("app.tickets.priority"),
      group: "priorities" as const,
      items: ["urgent", "high", "normal", "low"]
        .map((key) => ({
          key,
          label: t(
            key === "urgent"
              ? "app.priority.urgent"
              : key === "high"
                ? "app.priority.high"
                : key === "normal"
                  ? "app.priority.normal"
                  : "app.priority.low",
          ),
          count: facets.priorities.find((f) => f.key === key)?.count ?? 0,
        })),
      // The four priorities are always offered, including at zero. They are a
      // closed, ordered scale an agent knows by heart: hiding Urgent because
      // this view holds none makes the menu change shape from view to view, and
      // reads as "urgent no longer exists" rather than "none here".
    },
    {
      label: t("app.tickets.filterGroupChannel"),
      group: "channels" as const,
      items: ["email", "portal", "widget", "api"]
        .map((key) => ({
          key,
          label: t(
            key === "email"
              ? "app.reports.channelEmail"
              : key === "portal"
                ? "app.reports.channelPortal"
                : key === "widget"
                  ? "app.reports.channelWidget"
                  : "app.reports.channelApi",
          ),
          count: facets.channels.find((f) => f.key === key)?.count ?? 0,
        }))
        .filter((i) => i.count > 0 || draft.channels.includes(i.key)),
    },
    {
      label: t("app.tickets.filterGroupOrganization"),
      group: "orgs" as const,
      items: facets.orgs.map((o) => ({ key: o.key, label: o.name, count: o.count })),
    },
  ] satisfies Group[]).filter((g) => g.items.length > 0);

  return (
    <div ref={wrap} className="flex" style={{ gap: 8 }}>
      {/* Sort */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          aria-expanded={open === "sort"}
          onClick={() => setOpen(open === "sort" ? "none" : "sort")}
          style={{
            ...BUTTON,
            border: `1px solid ${open === "sort" ? "var(--brand-b)" : "var(--line)"}`,
            background: "var(--panel)",
            color: "var(--ink-2)",
          }}
        >
          {t("app.tickets.sortBy", { value: SORT_LABEL[sort] })}
          <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
        </button>

        {open === "sort" && (
          <div style={{ ...PANEL, width: 220 }} role="listbox">
            {INBOX_SORTS.map((key) => {
              const on = key === sort;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    setOpen("none");
                    push({ sort: key });
                  }}
                  className="ohd-row flex w-full items-center"
                  style={{
                    gap: 9,
                    padding: "8px 10px",
                    borderRadius: 8,
                    fontSize: 13,
                    background: on ? "var(--brand-t)" : "transparent",
                    color: on ? "var(--brand)" : "var(--ink-2)",
                    fontWeight: on ? 600 : 450,
                  }}
                >
                  <span className="flex-1 text-left">{SORT_LABEL[key]}</span>
                  {on && <span style={{ color: "var(--brand)", fontWeight: 700 }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          aria-expanded={open === "filters"}
          onClick={() => setOpen(open === "filters" ? "none" : "filters")}
          style={{
            ...BUTTON,
            border: `1px solid ${activeCount || open === "filters" ? "var(--brand-b)" : "var(--line)"}`,
            background: activeCount ? "var(--brand-t)" : "var(--panel)",
            color: activeCount ? "var(--brand)" : "var(--ink-2)",
            fontWeight: activeCount ? 600 : 450,
          }}
        >
          {t("app.tickets.filters")}
          {activeCount > 0 && ` · ${activeCount}`}
        </button>

        {open === "filters" && (
          <div style={{ ...PANEL, width: 264 }}>
            {GROUPS.map((g) => (
              <div key={g.group}>
                <div
                  style={{
                    padding: "8px 10px 4px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                  }}
                >
                  {g.label}
                </div>
                {g.items.map((item) => {
                  const on = draft[g.group].includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(g.group, item.key)}
                      className="ohd-row flex w-full items-center"
                      style={{ gap: 10, padding: "7px 10px", borderRadius: 8, fontSize: 13 }}
                    >
                      <span
                        className="grid place-items-center font-bold"
                        style={{
                          color: "var(--on-brand)",
                          width: 16,
                          height: 16,
                          flex: "none",
                          borderRadius: 5,
                          border: `1.5px solid ${on ? "var(--brand)" : "var(--line)"}`,
                          background: on ? "var(--brand)" : "var(--panel)",
                          fontSize: 10,
                        }}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="flex-1 truncate text-left" style={{ color: "var(--ink-2)" }}>
                        {item.label}
                      </span>
                      <span
                        className="tabular-nums"
                        style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                      >
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}

            <div
              className="flex items-center border-t"
              style={{ gap: 10, padding: "9px 10px 5px", marginTop: 5, borderColor: "var(--line-2)" }}
            >
              <button
                type="button"
                onClick={() => {
                  const empty: Selection = { priorities: [], channels: [], orgs: [] };
                  setDraft(empty);
                  push({ sel: empty });
                }}
                style={{ fontSize: 12.5, color: "var(--ink-3)" }}
              >
                {t("app.tickets.filterClearAll")}
              </button>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setOpen("none")}
                style={{ fontSize: 12.5, color: "var(--brand-2)", fontWeight: 600 }}
              >
                {t("app.tickets.filterApply")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
