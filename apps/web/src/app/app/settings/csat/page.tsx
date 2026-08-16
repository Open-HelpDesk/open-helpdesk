import { requireAgent } from "@/lib/session";
import { saveCsatConfig } from "./actions";

/**
 * ST-08 — Satisfaction (specs/11) : activation, question, aperçu de l'email.
 * Reste à venir : envoi différé (n heures après résolution), exclusions par tags/formulaires.
 */
export default async function CsatPage() {
  const { tenant } = await requireAgent();
  const config = (tenant.csatConfig ?? {}) as { enabled?: boolean; question?: string };
  const question =
    config.question ?? "Comment évaluez-vous la réponse apportée à votre demande ?";

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Satisfaction (CSAT)</h1>
      <p className="mb-5 text-sm" style={{ color: "var(--mute)" }}>
        Une enquête à deux niveaux (Bonne / Mauvaise réponse) est envoyée au demandeur à
        la résolution du ticket — une seule fois par ticket.
      </p>

      <form action={saveCsatConfig} className="flex max-w-xl flex-col gap-4">
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="enabled" defaultChecked={config.enabled === true} />
          Envoyer l'enquête à la résolution
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
          QUESTION POSÉE
          <textarea
            name="question"
            rows={2}
            defaultValue={question}
            className="rounded-md border px-3 py-2 text-sm font-normal"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
          />
        </label>

        {/* Aperçu */}
        <div
          className="rounded-lg border p-4"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--mute)" }}>
            Aperçu de l'email
          </p>
          <p className="text-sm">
            Bonjour Julien Lambert,
            <br />
            <br />
            Votre demande « Impossible d'exporter les factures en PDF » (#4821) a été
            résolue.
            <br />
            <br />
            {question}
          </p>
          <div className="mt-3 flex gap-2">
            <span
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
              style={{ background: "var(--ok)" }}
            >
              Bonne réponse
            </span>
            <span
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
              style={{ background: "var(--dang)" }}
            >
              Mauvaise réponse
            </span>
          </div>
        </div>

        <button
          type="submit"
          className="self-start rounded-md px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Enregistrer
        </button>
      </form>
    </div>
  );
}
