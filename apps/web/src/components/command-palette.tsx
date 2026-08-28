"use client";

/**
 * AG-06 — ⌘K palette (V2): rgba(8,14,12,.42) overlay + 2 px blur, 620 px panel
 * on radius 16, uppercase 10.5/600 groups spaced .12em, 22×22 tag icons coloured
 * by type, meta on the right ("#4821 · Open", views, shortcut), Actions section,
 * canvas footer.
 *
 * The mockup's third footer hint, "tab filter", is dropped: Tab filters nothing
 * here. The two hints the palette does honour — the `from:`/`status:`/`#tag`
 * prefixes and ↑↓/↵ — stay.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_KEYS, STATUS_TOKEN } from "@/lib/format";
import { useT } from "@/i18n/client";
import type { Edition } from "@openhelpdesk/config";

type Results = {
  tickets: { number: number; subject: string; status: string }[];
  contacts: { id: string; name: string | null; email: string; organizationName?: string | null }[];
  organizations: { id: string; name: string }[];
  articles: { id: string; title: string; status: string; viewCount: number; href: string }[];
};

type Item = {
  key: string;
  href: string;
  group: string;
  label: string;
  meta?: string;
  tag: string;
  tagBg: string;
  tagColor: string;
};

const EMPTY: Results = { tickets: [], contacts: [], organizations: [], articles: [] };

export function CommandPalette({ edition }: { edition: Edition }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults(EMPTY);
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        close();
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("ohd:open-search", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ohd:open-search", onOpenEvent);
    };
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setResults((await res.json()) as Results);
          setActive(0);
        }
      } catch {
        /* request aborted */
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, open]);

  const statusLabel = (status: string) => {
    const key = STATUS_KEYS[status];
    return key ? t(key) : status;
  };

  const items: Item[] = [
    ...results.tickets.map((ticket) => ({
      key: `t-${ticket.number}`,
      href: `/app/tickets/${ticket.number}`,
      group: t("app.shell.paletteGroupTickets"),
      label: ticket.subject,
      meta: `#${ticket.number} · ${statusLabel(ticket.status)}`,
      tag: "TK",
      tagBg: `var(--${STATUS_TOKEN[ticket.status] ?? "closed"}-t)`,
      tagColor: `var(--${STATUS_TOKEN[ticket.status] ?? "closed"})`,
    })),
    ...results.articles.map((a) => ({
      key: `a-${a.id}`,
      // Provided by the server: only it knows whether the user can edit.
      href: a.href,
      group: t("app.shell.paletteGroupArticles"),
      label: a.title,
      meta:
        a.status === "draft"
          ? t("app.shell.paletteArticleDraft")
          : t("app.shell.paletteArticleViews", { count: a.viewCount }),
      tag: "KB",
      tagBg: "var(--acc-t)",
      tagColor: "var(--acc)",
    })),
    ...results.contacts.map((c) => ({
      key: `c-${c.id}`,
      href: `/app/contacts?selected=${c.id}`,
      group: t("app.shell.contacts"),
      label: c.name ?? c.email,
      meta: c.organizationName ?? c.email,
      tag: "CT",
      tagBg: "var(--pause-t)",
      tagColor: "var(--pause)",
    })),
    ...results.organizations.map((o) => ({
      key: `o-${o.id}`,
      href: `/app/organizations?selected=${o.id}`,
      group: t("app.shell.organizations"),
      label: o.name,
      tag: "OR",
      tagBg: "var(--open-t)",
      tagColor: "var(--open)",
    })),
    {
      key: "action-new",
      href: "/app/tickets/new",
      group: t("app.shell.paletteGroupActions"),
      label: t("app.shell.newTicket"),
      meta: "N",
      tag: "⌘",
      tagBg: "var(--sunk)",
      tagColor: "var(--ink-2)",
    },
    // ST-11 is cloud only: no Billing entry when self-hosted.
    ...(edition === "cloud"
      ? [
          {
            key: "action-billing",
            href: "/app/settings/billing",
            group: t("app.shell.paletteGroupActions"),
            label: t("app.shell.paletteGoBilling"),
            meta: t("app.shell.paletteGoBillingShortcut"),
            tag: "⌘",
            tagBg: "var(--sunk)",
            tagColor: "var(--ink-2)",
          },
        ]
      : []),
  ];
  const ACTION_COUNT = edition === "cloud" ? 2 : 1;

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && items[active]) {
      router.push(items[active].href);
      close();
    }
  }

  if (!open) return null;

  let lastGroup = "";
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center"
      style={{
        background: "var(--scrim-palette)",
        backdropFilter: "blur(2px)",
        paddingTop: "11vh",
      }}
      onClick={close}
    >
      <div
        className="ohd-rise-fast flex w-full flex-col overflow-hidden"
        style={{
          maxWidth: 620,
          borderRadius: 16,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          boxShadow: "0 32px 80px rgba(0,0,0,.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center"
          style={{ gap: 11, padding: "14px 17px", borderBottom: "1px solid var(--line)" }}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth="2"
            className="shrink-0"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t("app.shell.palettePlaceholder")}
            className="min-w-0 flex-1 outline-none"
            style={{ fontSize: 15, background: "transparent", color: "var(--ink)" }}
          />
          <kbd
            className="shrink-0"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              padding: "2px 8px",
              borderRadius: 6,
              background: "var(--sunk)",
              color: "var(--ink-3)",
            }}
          >
            esc
          </kbd>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "56vh", padding: 8 }}>
          {q.trim().length < 2 && (
            <p className="px-3 py-4 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
              {t("app.shell.paletteMinChars")}
            </p>
          )}
          {q.trim().length >= 2 && items.length === ACTION_COUNT && (
            <p className="px-3 py-4 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
              {t("app.shell.paletteNoResults", { query: q })}
            </p>
          )}
          {items.map((item, i) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {showGroup && (
                  <p
                    className="uppercase"
                    style={{
                      padding: "8px 10px 4px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: ".12em",
                      color: "var(--ink-3)",
                    }}
                  >
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    router.push(item.href);
                    close();
                  }}
                  className="flex w-full items-center text-left"
                  style={{
                    gap: 11,
                    padding: "9px 10px",
                    borderRadius: 9,
                    color: "var(--ink)",
                    background: i === active ? "var(--sunk)" : "transparent",
                  }}
                >
                  <span
                    className="grid shrink-0 place-items-center font-bold"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      background: item.tagBg,
                      color: item.tagColor,
                    }}
                  >
                    {item.tag}
                  </span>
                  <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13.5 }}>
                    {item.label}
                  </span>
                  {item.meta && (
                    <span
                      className="shrink-0 whitespace-nowrap"
                      style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                    >
                      {item.meta}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div
          className="flex items-center"
          style={{
            gap: 16,
            padding: "10px 17px",
            borderTop: "1px solid var(--line)",
            background: "var(--canvas)",
            color: "var(--ink-3)",
            fontSize: 11.5,
          }}
        >
          <span>
            {t("app.shell.paletteFilters")}{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>from:</span>{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>status:</span>{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>#tag</span>
          </span>
          <span className="flex-1" />
          <span>{t("app.shell.paletteHint")}</span>
        </div>
      </div>
    </div>
  );
}

export function SearchButton({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <button
      type="button"
      title={t("app.shell.search")}
      className="rounded-lg p-2.5"
      style={{ color: "var(--ink)" }}
      onClick={() => window.dispatchEvent(new Event("ohd:open-search"))}
    >
      {children}
    </button>
  );
}
