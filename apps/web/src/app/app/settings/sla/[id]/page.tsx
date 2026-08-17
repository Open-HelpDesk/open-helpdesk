import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { businessHours, db, slaPolicies } from "@openhelpdesk/db";
import { and, asc, eq } from "drizzle-orm";
import { ConditionsBuilder } from "@/components/rule-builders";
import { formatDurationFr } from "@/lib/rule-labels";
import { PRIORITY_LABELS_FR } from "@/lib/format";
import {
  Card,
  Field,
  PageHeader,
  PageShell,
  PriorityPill,
  SaveBar,
  Select,
  StatusPill,
  TextInput,
} from "@/components/settings-page";
import { saveSlaPolicy } from "../actions";

const TARGET_GRID = "130px 1fr 1fr 1fr";
const PRIORITY_ORDER = ["urgent", "high", "normal", "low"] as const;
const COLUMNS = [
  ["firstReplyMin", "1ʳᵉ réponse"],
  ["nextReplyMin", "Réponses suiv."],
  ["resolveMin", "Résolution"],
] as const;

/**
 * ST-07 — Éditeur de politique : conditions d'application, grille de cibles
 * 130px/1fr/1fr/1fr avec pastilles priorité et saisies « 15 min » / « 4 h » / « 2 j »,
 * calendrier + rappel, encart « EXEMPLE CALCULÉ ».
 */
export default async function SlaEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { id } = await params;
  const { saved } = await searchParams;
  const isNew = id === "new";

  const [policy, calendars] = await Promise.all([
    isNew
      ? Promise.resolve(undefined)
      : db
          .select()
          .from(slaPolicies)
          .where(and(eq(slaPolicies.tenantId, tenant.id), eq(slaPolicies.id, id)))
          .then((rows) => rows[0]),
    db
      .select({ id: businessHours.id, name: businessHours.name })
      .from(businessHours)
      .where(eq(businessHours.tenantId, tenant.id))
      .orderBy(asc(businessHours.name)),
  ]);
  if (!isNew && !policy) notFound();

  const targets = (policy?.targets ?? {}) as Record<
    string,
    { firstReplyMin?: number; nextReplyMin?: number; resolveMin?: number }
  > & { reminderMin?: number };
  const reminderMin = typeof targets.reminderMin === "number" ? targets.reminderMin : 0;

  return (
    <PageShell maxWidth={1000}>
      <PageHeader
        code="ST-07"
        title="SLA & horaires ouvrés"
        subtitle="Cibles de réponse et de résolution, calendriers de travail et escalades."
        tabs={[
          { label: "Politiques SLA", href: "/app/settings/sla", active: true },
          { label: "Horaires ouvrés", href: "/app/settings/sla?tab=hours", active: false },
        ]}
      />

      <form action={saveSlaPolicy} className="flex flex-col gap-4">
        <input type="hidden" name="policyId" value={isNew ? "" : policy!.id} />

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nom de la politique" style={{ minWidth: 300 }}>
            <TextInput name="name" required defaultValue={policy?.name ?? ""} />
          </Field>
          {policy?.isDefault && <StatusPill tone="acc">PAR DÉFAUT</StatusPill>}
        </div>

        {policy?.isDefault ? (
          <Card>
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              La politique par défaut s'applique à tous les tickets restants — ses
              conditions sont verrouillées et elle n'est pas supprimable.
            </p>
            <input type="hidden" name="conditions" value="[]" />
          </Card>
        ) : (
          <ConditionsBuilder
            name="conditions"
            label="S'APPLIQUE SI — toutes ces conditions (vide = tous les tickets)"
            initial={(policy?.conditions as never[]) ?? []}
          />
        )}

        <Card title="Cibles par priorité">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 560 }}>
              <div
                className="grid gap-3 font-mono font-semibold uppercase"
                style={{
                  gridTemplateColumns: TARGET_GRID,
                  fontSize: 10.5,
                  letterSpacing: "0.06em",
                  color: "var(--ink-3)",
                  padding: "4px 0 8px",
                }}
              >
                <span>Priorité</span>
                {COLUMNS.map(([, label]) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              {PRIORITY_ORDER.map((prio) => (
                <div
                  key={prio}
                  className="grid items-center gap-3"
                  style={{ gridTemplateColumns: TARGET_GRID, padding: "4px 0" }}
                >
                  <PriorityPill priority={prio} label={PRIORITY_LABELS_FR[prio]!} />
                  {COLUMNS.map(([col]) => (
                    <TextInput
                      key={col}
                      name={`t_${prio}_${col}`}
                      defaultValue={formatDurationFr(targets[prio]?.[col])}
                      placeholder={col === "resolveMin" ? "2 j" : "4 h"}
                      className="font-mono tabular-nums"
                      spellCheck={false}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Saisies acceptées : « 15 min », « 4 h », « 2 j ». Vide = pas d'échéance.
          </p>
        </Card>

        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Calendrier ouvré">
            <Select name="businessHoursId" defaultValue={policy?.businessHoursId ?? ""}>
              <option value="">Astreinte 24/7</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rappel avant échéance">
            <Select name="reminderMin" defaultValue={String(reminderMin)}>
              <option value="0">Aucun</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 heure</option>
            </Select>
          </Field>
        </div>

        {/* Encart exemple — verbatim design */}
        <div
          className="rounded-[10px] border"
          style={{ background: "var(--note)", borderColor: "var(--note-line)", padding: 14 }}
        >
          <p
            className="mb-1 font-mono font-bold uppercase"
            style={{ fontSize: 10.5, letterSpacing: "0.07em", color: "var(--ink-2)" }}
          >
            Exemple calculé
          </p>
          <p style={{ fontSize: 13, color: "var(--ink)" }}>
            Un ticket Urgent créé vendredi 17 h devra recevoir une première réponse lundi 9 h 30
            et être résolu lundi 11 h.
          </p>
          <p className="mt-1" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            Le décompte est suspendu hors plage horaire et pendant les statuts En attente et En
            pause.
          </p>
        </div>

        <SaveBar saved={saved === "1"} cancelHref="/app/settings/sla" />
      </form>
    </PageShell>
  );
}
