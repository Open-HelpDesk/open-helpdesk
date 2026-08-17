import { requireAgent } from "@/lib/session";
import {
  Card,
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

/**
 * ST-08 — Satisfaction (900 px, 2 colonnes) : réglages (moment d'envoi, rappel,
 * question, exclusions en chips) + aperçu fidèle de l'email 😊/😕.
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
        <div className="grid items-start gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
          {/* Colonne réglages */}
          <Card>
            <div className="flex flex-col gap-4">
              <Toggle
                name="enabled"
                defaultChecked={config.enabled === true}
                label="Envoyer une enquête de satisfaction"
                hint="Un seul envoi par ticket, même en cas de réouverture."
              />
              <Field label="Moment d'envoi">
                <Select name="delayHours" defaultValue={String(config.delayHours ?? 2)}>
                  <option value="0">Immédiatement à la résolution</option>
                  <option value="1">1 heure après la résolution</option>
                  <option value="2">2 heures après la résolution</option>
                  <option value="24">24 heures après la résolution</option>
                </Select>
              </Field>
              <Field label="Rappel">
                <Select name="reminderDays" defaultValue={String(config.reminderDays ?? 0)}>
                  <option value="0">Aucun</option>
                  <option value="3">Après 3 jours sans réponse</option>
                  <option value="7">Après 7 jours sans réponse</option>
                </Select>
              </Field>
              <Field label="Question posée">
                <textarea
                  name="question"
                  rows={2}
                  defaultValue={question}
                  className="rounded-md border px-2.5 py-1.5 text-sm"
                  style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  Exclusions
                </span>
                <ExclusionsField initial={config.exclusions ?? []} />
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  Les tickets correspondants ne reçoivent pas l'enquête — ex. « tag : spam »,
                  « formulaire : Commercial ».
                </span>
              </div>
            </div>
          </Card>

          {/* Colonne aperçu */}
          <Card title="Aperçu de l'email">
            <div
              className="rounded-lg border"
              style={{ borderColor: "var(--line-2)", background: "var(--canvas)", padding: 18 }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center justify-center rounded-md font-bold text-white"
                  style={{ width: 28, height: 28, fontSize: 13, background: accent }}
                >
                  {tenant.name[0]?.toUpperCase()}
                </span>
                <span className="font-semibold" style={{ fontSize: 13, color: "var(--ink)" }}>
                  {tenant.name}
                </span>
              </div>
              <p className="mt-4 font-semibold" style={{ fontSize: 14.5, color: "var(--ink)" }}>
                {question}
              </p>
              <p className="mt-1" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                Ticket #4821 — Impossible d'exporter les factures en PDF
              </p>
              <div className="mt-4 flex gap-3">
                <span
                  className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border"
                  style={{ height: 52, borderColor: "var(--line)", background: "var(--bg)" }}
                >
                  <span style={{ fontSize: 18 }}>😊</span>
                  <span className="font-medium" style={{ fontSize: 11.5, color: "var(--ok)" }}>
                    Satisfait
                  </span>
                </span>
                <span
                  className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border"
                  style={{ height: 52, borderColor: "var(--line)", background: "var(--bg)" }}
                >
                  <span style={{ fontSize: 18 }}>😕</span>
                  <span className="font-medium" style={{ fontSize: 11.5, color: "var(--dang)" }}>
                    Insatisfait
                  </span>
                </span>
              </div>
              <span
                className="mt-3 flex items-center rounded-md border px-2"
                style={{
                  height: 34,
                  borderColor: "var(--line)",
                  background: "var(--bg)",
                  fontSize: 12,
                  color: "var(--ink-3)",
                }}
              >
                Un commentaire ? (facultatif)
              </span>
              <p
                className="mt-4 text-center"
                style={{ fontSize: 11, color: "var(--ink-3)" }}
              >
                Propulsé par Open HelpDesk
              </p>
            </div>
          </Card>
        </div>

        <SaveBar saved={saved === "1"} cancelHref="/app/settings/csat" />
      </form>
    </PageShell>
  );
}
