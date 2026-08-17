"use client";

/**
 * Déflexion (PT-04) : suggestions d'articles KB en direct pendant la saisie du sujet,
 * dans l'encart teinté de la maquette (« Ces articles répondent peut-être à votre question »).
 */
import { useEffect, useState } from "react";

type Suggestion = { title: string; slug: string };

export function SubjectWithDeflection({ defaultSubject = "" }: { defaultSubject?: string }) {
  const [subject, setSubject] = useState(defaultSubject);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (subject.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/portal/kb-suggest?q=${encodeURIComponent(subject.trim())}`, {
          signal: controller.signal,
        });
        if (res.ok) setSuggestions((await res.json()) as Suggestion[]);
      } catch {
        /* annulé */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [subject]);

  return (
    <div className="flex flex-col gap-[9px]">
      <label htmlFor="pt-subject" className="pt-label">
        Sujet
      </label>
      <input
        id="pt-subject"
        name="subject"
        required
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="pt-input h-[50px] px-[15px] text-[15.5px]"
      />
      {suggestions.length > 0 && (
        <div
          className="mt-1.5 flex flex-col gap-[11px] rounded-[14px] border px-[18px] py-4"
          style={{ background: "var(--acc-t)", borderColor: "var(--acc-b)" }}
        >
          <p
            className="text-[13px] font-semibold tracking-[0.02em]"
            style={{ color: "var(--acc)" }}
          >
            Ces articles répondent peut-être à votre question
          </p>
          {suggestions.map((s) => (
            <a
              key={s.slug}
              href={`/help/articles/${s.slug}`}
              target="_blank"
              className="flex items-center gap-2.5 text-[14.5px] font-medium"
              style={{ color: "var(--acc-2)" }}
            >
              <span aria-hidden style={{ color: "var(--acc-b)" }}>
                →
              </span>
              {s.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
