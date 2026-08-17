"use client";

/**
 * ST-01 — Couleur d'accent : 5 pastilles 30×30 + champ hex synchronisé.
 * La valeur est portée par un input caché lu par la server action.
 */
import { useState } from "react";

const SWATCHES = ["#0B5F46", "#1D4ED8", "#6D28D9", "#C0342B", "#B45309"];

export function AccentPicker({ name, initial }: { name: string; initial: string }) {
  const [value, setValue] = useState(initial || "#0B5F46");
  const normalized = value.toUpperCase();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={name} value={value} />
      {SWATCHES.map((c) => {
        const selected = normalized === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setValue(c)}
            title={c}
            aria-pressed={selected}
            className="rounded-full"
            style={{
              width: 30,
              height: 30,
              background: c,
              border: "2px solid var(--bg)",
              outline: selected ? "2px solid var(--ink)" : "1px solid var(--line)",
              outlineOffset: 1,
            }}
          />
        );
      })}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        aria-label="Couleur hexadécimale"
        className="w-24 rounded-md border px-2 py-1.5 font-mono text-sm"
        style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
      />
    </div>
  );
}
