"use client";

/**
 * ST-08 — Exclusions en chips (« tag : spam », « tag : interne »,
 * « formulaire : Commercial ») dans un cadre unique min-height 44 : la saisie se
 * fait en ligne (placeholder « Ajouter un tag ou un formulaire… », validation
 * Entrée ou perte de focus). Les valeurs sont portées par des inputs cachés
 * répétés, lus par la server action à l'enregistrement.
 */
import { useState } from "react";
import { useT } from "@/i18n/client";

export function ExclusionsField({ initial }: { initial: string[] }) {
  const t = useT();
  const [chips, setChips] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    setDraft("");
    if (!v || chips.includes(v)) return;
    setChips([...chips, v]);
  }

  return (
    <div
      className="flex flex-wrap items-center border"
      style={{
        minHeight: 44,
        padding: "8px 10px",
        gap: 6,
        borderRadius: 6,
        borderColor: "var(--line)",
        background: "var(--bg)",
      }}
    >
      {chips.map((c) => (
        <span
          key={c}
          className="inline-flex items-center border"
          style={{
            padding: "3px 9px",
            gap: 7,
            borderRadius: 5,
            fontSize: 12,
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
            aria-label={t("app.settings.portal.csatExclusionRemove", { name: c })}
            style={{ opacity: 0.45 }}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder={t("app.settings.portal.csatExclusionsPlaceholder")}
        aria-label={t("app.settings.portal.csatExclusionsAdd")}
        className="min-w-0 flex-1 bg-transparent"
        style={{ fontSize: 12.5, color: "var(--ink)", minWidth: 190 }}
      />
    </div>
  );
}
