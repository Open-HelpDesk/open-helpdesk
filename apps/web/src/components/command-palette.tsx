"use client";

/**
 * AG-06 — Recherche globale (⌘K) : champ unique, résultats groupés par type,
 * navigation ↑↓ + ↵, Échap pour fermer. Prochaines itérations : raccourcis de
 * filtre (from:, status:, #tag), section Actions, recherches récentes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Results = {
  tickets: { number: number; subject: string; status: string }[];
  contacts: { id: string; name: string | null; email: string }[];
  organizations: { id: string; name: string }[];
};

type Item = { key: string; href: string; group: string; label: string; hint?: string };

const EMPTY: Results = { tickets: [], contacts: [], organizations: [] };

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
      label: `#${t.number} ${t.subject}`,
    })),
    ...results.contacts.map((c) => ({
      key: `c-${c.id}`,
      href: `/app/contacts/${c.id}`,
      group: "Contacts",
      label: c.name ?? c.email,
      hint: c.name ? c.email : undefined,
    })),
    ...results.organizations.map((o) => ({
      key: `o-${o.id}`,
      href: `/app/organizations/${o.id}`,
      group: "Organisations",
      label: o.name,
    })),
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(17, 33, 28, 0.4)" }}
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border shadow-xl"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Rechercher tickets, contacts, organisations…"
          className="w-full border-b px-4 py-3 text-sm outline-none"
          style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--ink)" }}
        />
        <div className="max-h-80 overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm" style={{ color: "var(--mute)" }}>
              Tapez au moins deux caractères…
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm" style={{ color: "var(--mute)" }}>
              Aucun résultat pour « {q} »
            </p>
          ) : (
            items.map((item, i) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              return (
                <div key={item.key}>
                  {showGroup && (
                    <p
                      className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider"
                      style={{ color: "var(--mute)" }}
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
                    className="flex w-full items-baseline gap-2 truncate rounded-md px-3 py-2 text-left text-sm"
                    style={
                      i === active
                        ? { background: "var(--acc-t)", color: "var(--acc)" }
                        : { color: "var(--ink)" }
                    }
                  >
                    <span className="truncate">{item.label}</span>
                    {item.hint && (
                      <span className="shrink-0 text-xs" style={{ color: "var(--mute)" }}>
                        {item.hint}
                      </span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div
          className="flex gap-3 border-t px-4 py-2 font-mono text-[10px]"
          style={{ borderColor: "var(--line)", color: "var(--mute)" }}
        >
          <span>↑↓ naviguer</span>
          <span>↵ ouvrir</span>
          <span>échap fermer</span>
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
