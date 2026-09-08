"use client";

/**
 * AG-04 — le résumé du fil, dans le panneau latéral.
 *
 * Demandé, jamais automatique. Un résumé calculé à l'ouverture de chaque ticket
 * ferait un appel payant pour les neuf tickets sur dix qu'un agent survole, et
 * l'intérêt du résumé est justement d'être demandé quand on reprend un fil
 * long.
 *
 * Il porte l'heure à laquelle il a été fait. Un résumé de six messages affiché
 * au-dessus d'un fil qui en compte neuf est pire qu'aucun résumé : il donne
 * confiance et il est faux.
 */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { aiSummary } from "./ai-actions";
import type { OutcomeReason } from "@openhelpdesk/ee-ai";

export function AiSummary({ ticketId }: { ticketId: string }) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [reason, setReason] = useState<OutcomeReason | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setReason(null);
    try {
      const out = await aiSummary(ticketId);
      if (out.ok) {
        setText(out.value);
        setAt(new Date());
      } else {
        setReason(out.reason);
        setText(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col" style={{ gap: 8 }}>
      <div className="flex items-center gap-2">
        <h3
          className="uppercase"
          style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", color: "var(--ink-3)" }}
        >
          {t("app.ticket.aiSummaryTitle")}
        </h3>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="ohd-hover"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--acc)",
            opacity: busy ? 0.5 : 1,
            background: "none",
            border: 0,
          }}
        >
          {busy
            ? t("app.ticket.aiWorking")
            : text
              ? t("app.ticket.aiRegenerate")
              : t("app.ticket.aiSummarise")}
        </button>
      </div>

      {text && (
        <>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink)", margin: 0 }}>{text}</p>
          {at && (
            /* L'horodatage, pour qu'un résumé périmé se voie. */
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {t("app.ticket.aiSummaryAt")} {at.toLocaleTimeString()}
            </span>
          )}
        </>
      )}

      {!text && !reason && !busy && (
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
          {t("app.ticket.aiSummaryHint")}
        </p>
      )}

      {reason && (
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
          {t(
            reason === "unconfigured"
              ? "app.ticket.aiUnconfigured"
              : reason === "disabled"
                ? "app.ticket.aiDisabled"
                : reason === "capability_off"
                  ? "app.ticket.aiCapabilityOff"
                  : "app.ticket.aiTooShort",
          )}
        </p>
      )}
    </section>
  );
}
