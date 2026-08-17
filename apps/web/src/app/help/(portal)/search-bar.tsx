"use client";

/**
 * PT-01 — barre de recherche du hero (h58, pilule, raccourci ⌘K) avec typeahead :
 * suggestions /api/portal/kb-suggest dès 2 caractères, état « Aucun résultat » avec CTA.
 * Entrée = recherche complète (/help/search).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Suggestion = { title: string; slug: string; category: string | null };

export function PortalSearchBar() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setSuggestions(null);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/portal/kb-suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (res.ok) setSuggestions((await res.json()) as Suggestion[]);
      } catch {
        /* requête annulée */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  // ⌘K / Ctrl+K place le curseur dans la recherche : la maquette affiche le
  // raccourci dans la barre, il doit donc faire quelque chose.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showDropdown = open && q.trim().length >= 2 && suggestions !== null;

  return (
    <div
      className="relative w-full max-w-[600px]"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <form action="/help/search" role="search">
        <div
          className="flex h-[58px] items-center gap-[13px] rounded-full border py-0 pl-5 pr-2.5"
          style={{
            background: "var(--panel)",
            borderColor: "var(--acc-b)",
            boxShadow: "var(--sh-2)",
          }}
        >
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="var(--ink-3)" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            name="q"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Rechercher dans l'aide…"
            autoComplete="off"
            className="w-full min-w-0 flex-1 bg-transparent text-[16.5px] outline-none"
            style={{ color: "var(--ink)" }}
          />
          <kbd
            aria-hidden
            className="flex-none rounded-full px-[9px] py-[5px] font-mono text-[11.5px] font-normal max-sm:hidden"
            style={{ background: "var(--sunk)", color: "var(--ink-3)" }}
          >
            ⌘K
          </kbd>
        </div>
      </form>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-[66px] z-10 overflow-hidden rounded-2xl border"
          style={{
            background: "var(--panel)",
            borderColor: "var(--line)",
            boxShadow: "var(--sh-3)",
          }}
        >
          {suggestions.length > 0 ? (
            suggestions.map((s) => (
              <Link
                key={s.slug}
                href={`/help/articles/${s.slug}`}
                className="pt-row flex items-center gap-[13px] border-b px-[18px] py-[13px] hover:no-underline"
                style={{ borderColor: "var(--line-2)" }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--acc)" strokeWidth="1.7">
                  <path d="M14 3v5h5" />
                  <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
                </svg>
                <span
                  className="min-w-0 flex-1 truncate text-[14.5px]"
                  style={{ color: "var(--ink)" }}
                >
                  {s.title}
                </span>
                {s.category && (
                  <span
                    className="whitespace-nowrap text-xs uppercase tracking-[0.03em]"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {s.category}
                  </span>
                )}
              </Link>
            ))
          ) : (
            /* Même bloc que /help/search (maquette « sans résultat ») : titre serif, bouton h48. */
            <div className="flex flex-col items-center gap-[15px] px-6 py-9 text-center">
              <p className="pt-title text-[26px] tracking-[-0.015em]" style={{ color: "var(--ink)" }}>
                Aucun résultat pour «&nbsp;{q.trim()}&nbsp;»
              </p>
              <p
                className="max-w-[44ch] text-base"
                style={{ color: "var(--ink-2)", textWrap: "pretty" }}
              >
                Essayez des termes plus généraux, ou décrivez votre situation à notre équipe.
              </p>
              <Link
                href="/help/requests/new"
                className="mt-1.5 grid h-12 place-items-center rounded-[10px] px-6 text-[15px] font-semibold text-white hover:no-underline"
                style={{ background: "var(--cta-a)", boxShadow: "var(--sh-2)" }}
              >
                Soumettre une demande
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
