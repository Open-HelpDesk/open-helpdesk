"use client";

/** Déflexion (PT-04) : suggestions d'articles KB en direct pendant la saisie du sujet. */
import { useEffect, useState } from "react";

type Suggestion = { title: string; slug: string };

export function SubjectWithDeflection() {
  const [subject, setSubject] = useState("");
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
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Sujet *
        <input
          name="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-md border px-3 py-2.5 font-normal outline-none"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        />
      </label>
      {suggestions.length > 0 && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{ background: "var(--acc-t)", borderColor: "var(--line)" }}
        >
          <p className="mb-1 font-medium">Ces articles répondent peut-être déjà :</p>
          <ul className="flex flex-col gap-0.5">
            {suggestions.map((s) => (
              <li key={s.slug}>
                <a
                  href={`/help/articles/${s.slug}`}
                  target="_blank"
                  className="underline underline-offset-2"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
