"use client";

/**
 * AG-04 — le bouton « Rédiger avec l'IA » de la barre du composeur, et ce qui
 * s'affiche sous le brouillon.
 *
 * Vit dans `ee/` et s'insère dans le composeur d'`apps/web`, qui lui passe une
 * fonction d'insertion : c'est le composeur qui tient l'état du texte, donc
 * c'est lui qui écrit. Ce composant ne fait que demander, dire pourquoi ça n'a
 * rien donné, et montrer les sources.
 *
 * Le label **BROUILLON IA** n'est pas décoratif. Un agent qui relit trois
 * réponses d'affilée finit par les envoyer sans les lire ; le label et les
 * sources cliquables sont ce qui lui rappelle, à chaque fois, que le texte
 * sous ses yeux n'a pas été écrit par un humain et que les faits qu'il avance
 * viennent de quelque part de vérifiable.
 */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { aiDraft, type DraftPayload } from "./ai-actions";
import type { OutcomeReason } from "@openhelpdesk/ee-ai";

export function AiDraftButton({
  ticketId,
  onInsert,
  disabled,
}: {
  ticketId: string;
  /** Le composeur écrit : lui seul tient l'état du texte. */
  onInsert: (text: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<OutcomeReason | null>(null);
  const [sources, setSources] = useState<DraftPayload["sources"]>([]);

  async function run() {
    setBusy(true);
    setReason(null);
    setSources([]);
    try {
      const out = await aiDraft(ticketId);
      if (out.ok) {
        onInsert(out.value.text);
        setSources(out.value.sources);
      } else {
        setReason(out.reason);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || disabled}
        className="flex items-center ohd-hover"
        style={{
          height: 24,
          padding: "0 8px",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--acc)",
          fontWeight: 600,
          opacity: busy || disabled ? 0.5 : 1,
        }}
      >
        {busy ? t("app.ticket.aiWorking") : t("app.ticket.aiDraft")}
      </button>

      {reason && (
        <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 6 }}>
          {t(reasonKey(reason))}
        </span>
      )}

      {sources.length > 0 && (
        /* Sous le brouillon, pas dans une infobulle : la vérification doit être
           à portée de regard, sinon elle ne se fait pas. */
        <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginLeft: 6 }}>
          {t("app.ticket.aiSources")} {sources.map((s) => s.title).join(" · ")}
        </span>
      )}
    </>
  );
}

/** Le label que porte un brouillon d'IA, tant qu'il n'a pas été édité. */
export function AiDraftBadge() {
  const t = useT();
  return (
    <span
      className="rounded-full font-bold uppercase"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.06em",
        padding: "2px 8px",
        background: "var(--new-t)",
        color: "var(--acc)",
      }}
    >
      {t("app.ticket.aiDraftBadge")}
    </span>
  );
}

/**
 * Chaque motif a sa phrase, et « rien trouvé » n'est pas une panne.
 *
 * C'est la distinction que l'écran doit rendre : un refus faute de source
 * invite à écrire l'article manquant, une panne invite à réessayer, une offre
 * absente invite à changer de palier. Un message unique les confondrait tous
 * les trois.
 */
function reasonKey(reason: OutcomeReason) {
  switch (reason) {
    case "unconfigured":
      return "app.ticket.aiUnconfigured" as const;
    case "disabled":
      return "app.ticket.aiDisabled" as const;
    case "capability_off":
      return "app.ticket.aiCapabilityOff" as const;
    case "quota_reached":
      return "app.ticket.aiQuotaReached" as const;
    case "locale_closed":
      return "app.ticket.aiLocaleClosed" as const;
    default:
      return "app.ticket.aiNoSource" as const;
  }
}
