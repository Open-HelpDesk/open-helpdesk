"use client";

/**
 * ST-08 — Exclusions en chips (« tag : spam », « formulaire : Commercial ») :
 * ajout/retrait côté client, valeurs portées par des inputs cachés répétés
 * lus par la server action à l'enregistrement.
 */
import { useState } from "react";

export function ExclusionsField({ initial }: { initial: string[] }) {
  const [chips, setChips] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v || chips.includes(v)) return;
    setChips([...chips, v]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 rounded-full border font-mono"
            style={{
              fontSize: 11.5,
              padding: "3px 10px",
              borderColor: "var(--line)",
              background: "var(--sunk)",
              color: "var(--ink)",
            }}
          >
            <input type="hidden" name="exclusions" value={c} />
            {c}
            <button
              type="button"
              onClick={() => setChips(chips.filter((x) => x !== c))}
              title="Retirer"
              style={{ color: "var(--ink-3)" }}
            >
              ✕
            </button>
          </span>
        ))}
        {chips.length === 0 && (
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Aucune exclusion.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="tag : spam"
          className="rounded-md border px-2.5 py-1.5 font-mono text-sm"
          style={{
            borderColor: "var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
            width: 200,
          }}
        />
        <button
          type="button"
          onClick={add}
          className="rounded-md border px-2.5 py-1 font-medium"
          style={{
            fontSize: 12.5,
            borderColor: "var(--line)",
            background: "var(--panel)",
            color: "var(--ink)",
          }}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
