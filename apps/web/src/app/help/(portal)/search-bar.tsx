"use client";

/**
 * PT-01 — barre de recherche du hero (h54, radius 28) avec typeahead :
 * suggestions /api/portal/kb-suggest dès 2 caractères, état « Aucun résultat » avec CTA.
 * Entrée = recherche complète (/help/search).
 */
import Link from "next/link";
import { useEffect, useState } from "react";

type Suggestion = { title: string; slug: string; category: string | null };

export function PortalSearchBar() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [open, setOpen] = useState(false);

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
          className="flex h-[54px] items-center gap-[11px] rounded-[28px] border px-[18px]"
          style={{ background: "var(--panel)", borderColor: "var(--acc-b)" }}
        >
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="var(--ink-3)" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            name="q"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Rechercher dans l'aide…"
            autoComplete="off"
            className="w-full bg-transparent text-base outline-none"
            style={{ color: "var(--ink)" }}
          />
        </div>
      </form>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-[60px] z-10 overflow-hidden rounded-xl border shadow-[0_14px_40px_rgba(0,0,0,.14)]"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          {suggestions.length > 0 ? (
            suggestions.map((s) => (
              <Link
                key={s.slug}
                href={`/help/articles/${s.slug}`}
                className="pt-row flex items-center gap-3 border-b px-4 py-3 hover:no-underline"
                style={{ borderColor: "var(--line-2)" }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--ink-3)" strokeWidth="1.8">
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
                  <span className="whitespace-nowrap text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    {s.category}
                  </span>
                )}
              </Link>
            ))
          ) : (
            /* Même bloc que /help/search (maquette « sans résultat ») : 20/600, 15.5, bouton h46. */
            <div className="flex flex-col items-center gap-3.5 px-6 py-8 text-center">
              <p className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
                Aucun résultat pour «&nbsp;{q.trim()}&nbsp;»
              </p>
              <p
                className="max-w-[440px] text-[15.5px]"
                style={{ color: "var(--ink-2)", textWrap: "pretty" }}
              >
                Essayez des termes plus généraux, ou décrivez votre situation à notre équipe.
              </p>
              <Link
                href="/help/requests/new"
                className="grid h-[46px] place-items-center rounded-[9px] px-[22px] text-[15px] font-semibold text-white hover:no-underline"
                style={{ background: "var(--acc)" }}
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
