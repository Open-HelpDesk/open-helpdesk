import { requireAgent } from "@/lib/session";
import {
  Field,
  PageHeader,
  PageShell,
  SaveBar,
  Select,
  Toggle,
} from "@/components/settings-page";
import { ExclusionsField } from "./exclusions-field";
import { saveCsatConfig } from "./actions";

type CsatConfig = {
  enabled?: boolean;
  question?: string;
  delayHours?: number;
  reminderDays?: number;
  exclusions?: string[];
};

const CONTROL: React.CSSProperties = {
  minHeight: 36,
  padding: "7px 11px",
  borderRadius: 6,
  fontSize: 13.5,
};

/**
 * ST-08 — Satisfaction (900 px, 2 colonnes minmax(340px,1fr) gap 20) : panneau
 * d'activation encadré, moment d'envoi / rappel en grille minmax(300px,1fr),
 * question, exclusions en chips + aperçu de l'email 😊/😕 à droite.
 */
export default async function CsatPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { saved } = await searchParams;
  const config = (tenant.csatConfig ?? {}) as CsatConfig;
  const question =
    config.question ?? "Comment évaluez-vous la réponse apportée à votre demande ?";
  const branding = (tenant.branding ?? {}) as { accentColor?: string };
  const accent = branding.accentColor ?? "#0B5F46";

  return (
    <PageShell maxWidth={900}>
      <PageHeader
        code="ST-08"
        title="Satisfaction (CSAT)"
        subtitle="Enquête envoyée après résolution, et son rendu côté client."
      />

      <form action={saveCsatConfig} className="flex flex-col" style={{ gap: 22 }}>
        <div
          className="st-rise grid items-start"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}
        >
          {/* Colonne réglages */}
          <div className="flex flex-col" style={{ gap: 20 }}>
            <div
              className="border"
              style={{
                padding: "13px 14px",
                borderRadius: 9,
                borderColor: "var(--line)",
                background: "var(--panel)",
              }}
            >
              <Toggle
                name="enabled"
                defaultChecked={config.enabled === true}
                label="Envoyer une enquête de satisfaction"
                hint="Un seul envoi par ticket, même en cas de réouverture."
              />
            </div>

            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
            >
              <Field label="Moment d'envoi">
                <Select name="delayHours" defaultValue={String(config.delayHours ?? 2)} style={CONTROL}>
                  <option value="0">Immédiatement à la résolution</option>
                  <option value="1">1 heure après la résolution</option>
                  <option value="2">2 heures après la résolution</option>
                  <option value="24">24 heures après la résolution</option>
                </Select>
              </Field>
              <Field label="Rappel si sans réponse">
                <Select name="reminderDays" defaultValue={String(config.reminderDays ?? 0)} style={CONTROL}>
                  <option value="0">Aucun</option>
                  <option value="3">Après 3 jours sans réponse</option>
                  <option value="7">Après 7 jours sans réponse</option>
                </Select>
              </Field>
            </div>

            <Field label="Question posée">
              <input
                name="question"
                defaultValue={question}
                maxLength={500}
                className="border"
                style={{
                  ...CONTROL,
                  borderColor: "var(--line)",
                  background: "var(--bg)",
                  color: "var(--ink)",
                }}
              />
            </Field>

            <div className="flex flex-col" style={{ gap: 6 }}>
              <span className="font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                Exclusions
              </span>
              <ExclusionsField initial={config.exclusions ?? []} />
            </div>
          </div>

          {/* Colonne aperçu — aperçu de l'email envoyé au contact */}
          <div
            className="overflow-hidden border"
            style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <div
              className="border-b"
              style={{
                padding: "9px 13px",
                background: "var(--sunk)",
                borderColor: "var(--line)",
                fontSize: 11.5,
                color: "var(--ink-3)",
              }}
            >
              Aperçu de l'email
            </div>
            <div
              className="flex flex-col items-center text-center"
              style={{ padding: "24px 20px", gap: 16 }}
            >
              <span
                className="grid place-items-center font-bold text-white"
                style={{ width: 32, height: 32, borderRadius: 9, fontSize: 14, background: accent }}
              >
                {tenant.name[0]?.toUpperCase()}
              </span>
              <p className="font-semibold" style={{ fontSize: 15, color: "var(--ink)", textWrap: "balance" }}>
                {question}
              </p>
              <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                Ticket #4821 — Impossible d'exporter les factures en PDF
              </p>
              <div className="flex w-full" style={{ gap: 10 }}>
                <span
                  className="flex flex-1 flex-col items-center justify-center border font-semibold"
                  style={{
                    height: 52,
                    borderRadius: 9,
                    borderColor: "var(--ok)",
                    color: "var(--ok)",
                    fontSize: 12.5,
                  }}
                >
                  😊<span>Satisfait</span>
                </span>
                <span
                  className="flex flex-1 flex-col items-center justify-center border font-semibold"
                  style={{
                    height: 52,
                    borderRadius: 9,
                    borderColor: "var(--line)",
                    color: "var(--ink-2)",
                    fontSize: 12.5,
                  }}
                >
                  😕<span>Insatisfait</span>
                </span>
              </div>
              <span
                className="w-full border text-left"
                style={{
                  minHeight: 56,
                  padding: 10,
                  borderRadius: 9,
                  borderColor: "var(--line)",
                  background: "var(--bg)",
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                }}
              >
                Un commentaire ? (facultatif)
              </span>
              <p style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Propulsé par Open HelpDesk</p>
            </div>
          </div>
        </div>

        <SaveBar saved={saved === "1"} cancelHref="/app/settings/csat" />
      </form>
    </PageShell>
  );
}
