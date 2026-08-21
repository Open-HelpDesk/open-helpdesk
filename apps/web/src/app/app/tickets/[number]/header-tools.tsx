"use client";

/** AG-04 — Chips d'en-tête interactifs : Fusionner (modal réel) et Copier le lien. */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { mergeTicket } from "../actions";

/** Chip d'en-tête du design : h28, padding 0 9px, 12px, fond panel, bordure line. */
const chipStyle = {
  height: 28,
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "var(--panel)",
  color: "var(--ink-2)",
  fontSize: 12,
  padding: "0 9px",
  whiteSpace: "nowrap",
} as const;

export function ChipVisual({ label }: { label: string }) {
  return (
    <button type="button" style={chipStyle}>
      {label}
    </button>
  );
}

export function CopyLinkChip() {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      style={{ ...chipStyle, color: copied ? "var(--acc-2)" : chipStyle.color }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* presse-papiers indisponible */
        }
      }}
    >
      {copied ? t("app.ticket.linkCopied") : t("app.ticket.copyLink")}
    </button>
  );
}

export function MergeChip({ ticketId, ticketNumber }: { ticketId: string; ticketNumber: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" style={chipStyle} onClick={() => setOpen(true)}>
        {t("app.ticket.merge")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "var(--scrim-modal)", padding: 24 }}
          onClick={() => setOpen(false)}
        >
          <div
            className="ohd-rise-fast w-full max-w-md border shadow-xl"
            style={{
              background: "var(--panel)",
              borderColor: "var(--line)",
              borderRadius: 12,
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold">
                {t("app.ticket.mergeTitle", { number: String(ticketNumber) })}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ color: "var(--ink-3)" }}
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
              {t("app.ticket.mergeHelp")}
            </p>
            <form action={mergeTicket} className="flex items-center gap-2">
              <input type="hidden" name="ticketId" value={ticketId} />
              <input
                name="targetNumber"
                required
                placeholder={t("app.ticket.mergeTargetPlaceholder")}
                className="min-w-0 flex-1 border px-3 outline-none"
                style={{
                  height: 34,
                  borderRadius: 6,
                  borderColor: "var(--line)",
                  background: "var(--bg)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                }}
              />
              <button
                type="submit"
                className="shrink-0 rounded-md px-3 text-[13px] font-semibold text-white"
                style={{ height: 34, background: "var(--acc)" }}
              >
                {t("app.ticket.merge")}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
