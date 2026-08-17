"use client";

/**
 * AG-06 — Palette ⌘K (design espace-agent) : overlay rgba(8,14,12,.42) + blur 2 px,
 * panneau 620 px, groupes uppercase 10.5/700, icônes-tags 22×22 colorées par type,
 * méta à droite (« #4821 · Ouvert », vues, raccourci), section Actions, pied
 * « Filtres : from: status: #tag » + « ↑↓ naviguer · ↵ ouvrir ».
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABELS_FR, STATUS_TOKEN, nFr } from "@/lib/format";

type Results = {
  tickets: { number: number; subject: string; status: string }[];
  contacts: { id: string; name: string | null; email: string; organizationName?: string | null }[];
  organizations: { id: string; name: string }[];
  articles: { id: string; title: string; status: string; viewCount: number }[];
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

export function CommandPalette() {
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
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setResults((await res.json()) as Results);
          setActive(0);
        }
      } catch {
        /* requête annulée */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, open]);

  const items: Item[] = [
    ...results.tickets.map((t) => ({
      key: `t-${t.number}`,
      href: `/app/tickets/${t.number}`,
      group: "Tickets",
      label: t.subject,
      meta: `#${t.number} · ${STATUS_LABELS_FR[t.status] ?? t.status}`,
      tag: "TK",
      tagBg: `var(--${STATUS_TOKEN[t.status] ?? "closed"}-t)`,
      tagColor: `var(--${STATUS_TOKEN[t.status] ?? "closed"})`,
    })),
    ...results.articles.map((a) => ({
      key: `a-${a.id}`,
      href: `/app/kb/${a.id}`,
      group: "Articles",
      label: a.title,
      meta: a.status === "draft" ? "Brouillon" : `${nFr(a.viewCount)} vues`,
      tag: "KB",
      tagBg: "var(--acc-t)",
      tagColor: "var(--acc)",
    })),
    ...results.contacts.map((c) => ({
      key: `c-${c.id}`,
      href: `/app/contacts?selected=${c.id}`,
      group: "Contacts",
      label: c.name ?? c.email,
      meta: c.organizationName ?? c.email,
      tag: "CT",
      tagBg: "var(--pause-t)",
      tagColor: "var(--pause)",
    })),
    ...results.organizations.map((o) => ({
      key: `o-${o.id}`,
      href: `/app/organizations?selected=${o.id}`,
      group: "Organisations",
      label: o.name,
      tag: "OR",
      tagBg: "var(--open-t)",
      tagColor: "var(--open)",
    })),
    {
      key: "action-new",
      href: "/app/tickets/new",
      group: "Actions",
      label: "Nouveau ticket",
      meta: "N",
      tag: "⌘",
      tagBg: "var(--sunk)",
      tagColor: "var(--ink-2)",
    },
  ];

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
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{
        background: "rgba(8,14,12,.42)",
        backdropFilter: "blur(2px)",
        paddingTop: "11vh",
      }}
      onClick={close}
    >
      <div
        className="ohd-rise-fast flex w-full flex-col overflow-hidden border shadow-xl"
        style={{
          maxWidth: 620,
          borderRadius: 12,
          background: "var(--panel)",
          borderColor: "var(--line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 border-b px-4"
          style={{ borderColor: "var(--line)" }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Rechercher tickets, contacts, articles…"
            className="min-w-0 flex-1 py-3.5 outline-none"
            style={{ fontSize: 15, background: "transparent", color: "var(--ink)" }}
          />
          <kbd className="ohd-kbd shrink-0">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {q.trim().length < 2 && (
            <p className="px-3 py-4 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
              Tapez au moins deux caractères…
            </p>
          )}
          {q.trim().length >= 2 &&
            items.length === 1 /* seule l'action reste */ && (
              <p className="px-3 py-4 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
                Aucun résultat pour « {q} »
              </p>
            )}
          {items.map((item, i) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {showGroup && (
                  <p
                    className="px-3 pb-1 pt-2.5 uppercase tracking-wider"
                    style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-3)" }}
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
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left"
                  style={
                    i === active
                      ? { background: "var(--acc-t)", color: "var(--ink)" }
                      : { color: "var(--ink)" }
                  }
                >
                  <span
                    className="flex shrink-0 items-center justify-center font-bold"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      fontSize: 9,
                      background: item.tagBg,
                      color: item.tagColor,
                    }}
                  >
                    {item.tag}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{item.label}</span>
                  {item.meta && (
                    <span
                      className="shrink-0 whitespace-nowrap tabular-nums"
                      style={{
                        fontSize: 11.5,
                        fontFamily: "var(--font-mono)",
                        color: "var(--ink-3)",
                      }}
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
          className="flex items-center gap-3 border-t px-4 py-2"
          style={{
            background: "var(--sunk)",
            borderColor: "var(--line)",
            color: "var(--ink-3)",
            fontSize: 11,
          }}
        >
          <span>
            Filtres :{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>from: status: #tag</span>
          </span>
          <span className="flex-1" />
          <span>↑↓ naviguer · ↵ ouvrir</span>
        </div>
      </div>
    </div>
  );
}

export function SearchButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      title="Recherche (⌘K)"
      className="rounded-lg p-2.5"
      style={{ color: "var(--ink)" }}
      onClick={() => window.dispatchEvent(new Event("ohd:open-search"))}
    >
      {children}
    </button>
  );
}
