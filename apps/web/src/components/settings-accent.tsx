"use client";

/**
 * ST-01 — Couleur d'accent : 5 pastilles 30×30 + champ hex synchronisé.
 * La valeur est portée par un input caché lu par la server action.
 */
import { useState } from "react";
import { useT } from "@/i18n/client";

const SWATCHES = ["#0B5F46", "#1D4ED8", "#6D28D9", "#C0342B", "#B45309"];

export function AccentPicker({ name, initial }: { name: string; initial: string }) {
  const t = useT();
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
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: c,
              // Design : la sélection est un seul contour --ink, rien sur les autres.
              outline: selected ? "2px solid var(--ink)" : "none",
              outlineOffset: 2,
            }}
          />
        );
      })}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        aria-label={t("app.settingsNav.hexColor")}
        className="font-mono"
        style={{
          width: 92,
          padding: "5px 10px",
          border: "1px solid var(--line)",
          borderRadius: 6,
          fontSize: 12.5,
          background: "var(--bg)",
          color: "var(--ink-2)",
        }}
      />
    </div>
  );
}
