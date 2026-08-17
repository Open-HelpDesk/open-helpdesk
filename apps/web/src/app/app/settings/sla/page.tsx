import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { businessHours, db, slaPolicies } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { formatDurationFr, ruleSummary } from "@/lib/rule-labels";
import { PRIORITY_LABELS_FR } from "@/lib/format";
import {
  Card,
  Field,
  GridHead,
  PageHeader,
  PageShell,
  PriorityPill,
  StatusPill,
  TextInput,
} from "@/components/settings-page";
import {
  addHoliday,
  createCalendar,
  deleteCalendar,
  deleteSlaPolicy,
  removeHoliday,
  saveCalendar,
} from "./actions";

const TARGET_GRID = "130px 1fr 1fr 1fr";
const PRIORITY_ORDER = ["urgent", "high", "normal", "low"] as const;
const DAY_LABELS: [string, string][] = [
  ["mon", "Lundi"],
  ["tue", "Mardi"],
  ["wed", "Mercredi"],
  ["thu", "Jeudi"],
  ["fri", "Vendredi"],
  ["sat", "Samedi"],
  ["sun", "Dimanche"],
];

/**
 * ST-07 — SLA & horaires ouvrés (1000 px). Onglet Politiques : liste ordonnée,
 * badge PAR DÉFAUT verrouillée, cibles avec pastilles priorité. Onglet Horaires
 * ouvrés : chips calendriers, édition semaine, jours fériés — CRUD businessHours.
 */
export default async function SlaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cal?: string; saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { tab, cal, saved } = await searchParams;
  const activeTab = tab === "hours" ? "hours" : "policies";

  const [policies, calendars] = await Promise.all([
    db
      .select()
      .from(slaPolicies)
      .where(eq(slaPolicies.tenantId, tenant.id))
      .orderBy(asc(slaPolicies.position)),
    db
      .select()
      .from(businessHours)
      .where(eq(businessHours.tenantId, tenant.id))
      .orderBy(asc(businessHours.name)),
  ]);

  const calendarNameById = new Map(calendars.map((c) => [c.id, c.name]));
  const selectedCalendar = calendars.find((c) => c.id === cal) ?? calendars[0];

  const tabs = [
    { label: "Politiques SLA", href: "/app/settings/sla", active: activeTab === "policies" },
    { label: "Horaires ouvrés", href: "/app/settings/sla?tab=hours", active: activeTab === "hours" },
  ];

  return (
    <PageShell maxWidth={1000}>
      <PageHeader
        code="ST-07"
        title="SLA & horaires ouvrés"
        subtitle="Cibles de réponse et de résolution, calendriers de travail et escalades."
        tabs={tabs}
        actions={
          activeTab === "policies" ? (
            <Link
              href="/app/settings/sla/new"
              className="inline-flex items-center rounded-md px-3.5 font-semibold text-white"
              style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
            >
              Nouvelle politique
            </Link>
          ) : undefined
        }
      />

      {saved === "1" && <p style={{ fontSize: 12.5, color: "var(--ok)" }}>✓ Enregistré</p>}

      {activeTab === "policies" ? (
        <>
          <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            Évaluées dans l'ordre : la première politique dont les conditions matchent
            s'applique au ticket.
          </p>
          <ul className="flex flex-col gap-3">
            {policies.map((p, index) => {
              const targets = p.targets as Record<
                string,
                { firstReplyMin?: number; nextReplyMin?: number; resolveMin?: number }
              >;
              const conditions = (p.conditions as never[]) ?? [];
              return (
                <li key={p.id}>
                  <Card style={{ padding: 0 }}>
                    <div
                      className="flex items-center gap-2 border-b"
                      style={{ padding: "10px 14px", borderColor: "var(--line-2)" }}
                    >
                      <span
                        className="font-mono tabular-nums"
                        style={{ fontSize: 11, color: "var(--ink-3)" }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <Link
                        href={`/app/settings/sla/${p.id}`}
                        className="font-semibold"
                        style={{ fontSize: 13.5, color: "var(--ink)" }}
                      >
                        {p.name}
                      </Link>
                      {p.isDefault && <StatusPill tone="acc">PAR DÉFAUT</StatusPill>}
                      <span className="flex-1" />
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        {p.businessHoursId
                          ? (calendarNameById.get(p.businessHoursId) ?? "—")
                          : "Astreinte 24/7"}
                      </span>
                      {!p.isDefault && (
                        <form action={deleteSlaPolicy}>
                          <input type="hidden" name="policyId" value={p.id} />
                          <button
                            className="rounded-md border px-2 py-1 font-medium"
                            style={{ fontSize: 12, borderColor: "var(--dang)", color: "var(--dang)" }}
                          >
                            Supprimer
                          </button>
                        </form>
                      )}
                    </div>
                    <div style={{ padding: "10px 14px" }}>
                      <p className="mb-2" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                        {p.isDefault
                          ? "Tous les tickets restants."
                          : conditions.length > 0
                            ? ruleSummary(conditions, [], []).replace(" → aucune action", "")
                            : "Tous les tickets."}
                      </p>
                      <div className="overflow-x-auto">
                        <div style={{ minWidth: 520 }}>
                          <div
                            className="grid gap-3 font-mono font-semibold uppercase"
                            style={{
                              gridTemplateColumns: TARGET_GRID,
                              fontSize: 10,
                              letterSpacing: "0.06em",
                              color: "var(--ink-3)",
                              padding: "4px 0",
                            }}
                          >
                            <span>Priorité</span>
                            <span>1ʳᵉ réponse</span>
                            <span>Réponses suiv.</span>
                            <span>Résolution</span>
                          </div>
                          {PRIORITY_ORDER.map((prio) => (
                            <div
                              key={prio}
                              className="grid items-center gap-3"
                              style={{ gridTemplateColumns: TARGET_GRID, padding: "3px 0" }}
                            >
                              <PriorityPill priority={prio} label={PRIORITY_LABELS_FR[prio]!} />
                              <span className="font-mono tabular-nums" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                                {formatDurationFr(targets[prio]?.firstReplyMin) || "—"}
                              </span>
                              <span className="font-mono tabular-nums" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                                {formatDurationFr(targets[prio]?.nextReplyMin) || "—"}
                              </span>
                              <span className="font-mono tabular-nums" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                                {formatDurationFr(targets[prio]?.resolveMin) || "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <>
          {/* Chips calendriers + création */}
          <div className="flex flex-wrap items-center gap-2">
            {calendars.map((c) => {
              const active = selectedCalendar?.id === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/app/settings/sla?tab=hours&cal=${c.id}`}
                  className="rounded-full border font-medium"
                  style={{
                    fontSize: 12.5,
                    padding: "4px 12px",
                    borderColor: active ? "var(--acc)" : "var(--line)",
                    background: active ? "var(--acc-t)" : "var(--panel)",
                    color: active ? "var(--acc)" : "var(--ink)",
                  }}
                >
                  {c.name}
                </Link>
              );
            })}
            <span className="flex-1" />
            <form action={createCalendar} className="flex items-center gap-2">
              <TextInput name="name" required placeholder="Nom du calendrier" style={{ width: 180 }} />
              <button
                type="submit"
                className="rounded-md border px-3 font-medium"
                style={{
                  height: 30,
                  fontSize: 12.5,
                  borderColor: "var(--line)",
                  background: "var(--panel)",
                  color: "var(--ink)",
                }}
              >
                Nouveau calendrier
              </button>
            </form>
          </div>

          {!selectedCalendar ? (
            <Card>
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Aucun calendrier. Sans calendrier, les SLA sont calculés en 24/7.
              </p>
            </Card>
          ) : (
            <>
              <form action={saveCalendar}>
                <input type="hidden" name="calendarId" value={selectedCalendar.id} />
                <Card title="Semaine de travail">
                  <div className="mb-4 flex items-end gap-3">
                    <Field label="Nom du calendrier" style={{ minWidth: 260 }}>
                      <TextInput name="name" defaultValue={selectedCalendar.name} />
                    </Field>
                    <span className="pb-2" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                      Fuseau : {selectedCalendar.timezone}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {DAY_LABELS.map(([key, label]) => {
                      const ranges =
                        ((selectedCalendar.weeklyHours as Record<string, [string, string][]>) ?? {})[
                          key
                        ] ?? [];
                      const enabled = ranges.length > 0;
                      const [start, end] = ranges[0] ?? ["09:00", "18:00"];
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 rounded-md border px-3 py-2"
                          style={{ borderColor: "var(--line-2)", background: "var(--bg)" }}
                        >
                          <label
                            className="flex w-32 items-center gap-2 font-medium"
                            style={{ fontSize: 13, color: "var(--ink)" }}
                          >
                            <input type="checkbox" name={`d_${key}_on`} defaultChecked={enabled} />
                            {label}
                          </label>
                          <input
                            type="time"
                            name={`d_${key}_start`}
                            defaultValue={start}
                            className="rounded-md border px-2 py-1 font-mono text-sm"
                            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
                          />
                          <span style={{ color: "var(--ink-3)" }}>→</span>
                          <input
                            type="time"
                            name={`d_${key}_end`}
                            defaultValue={end}
                            className="rounded-md border px-2 py-1 font-mono text-sm"
                            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
                          />
                          {!enabled && (
                            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Fermé</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="submit"
                      className="rounded-md px-3.5 font-semibold text-white"
                      style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
                    >
                      Enregistrer
                    </button>
                  </div>
                </Card>
              </form>

              <Card title="Jours fériés">
                <div className="flex flex-wrap items-center gap-2">
                  {((selectedCalendar.holidays as { date: string; label: string }[]) ?? []).map(
                    (h) => (
                      <span
                        key={h.date}
                        className="inline-flex items-center gap-1.5 rounded-full border"
                        style={{
                          fontSize: 12,
                          padding: "3px 10px",
                          borderColor: "var(--line)",
                          background: "var(--sunk)",
                          color: "var(--ink)",
                        }}
                      >
                        {h.label}
                        <span className="font-mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          {new Date(`${h.date}T00:00:00`).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <form action={removeHoliday} className="inline">
                          <input type="hidden" name="calendarId" value={selectedCalendar.id} />
                          <input type="hidden" name="date" value={h.date} />
                          <button title="Supprimer" style={{ color: "var(--ink-3)" }}>
                            ✕
                          </button>
                        </form>
                      </span>
                    ),
                  )}
                  {((selectedCalendar.holidays as unknown[]) ?? []).length === 0 && (
                    <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                      Aucun jour férié configuré.
                    </span>
                  )}
                </div>
                <div
                  className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
                  style={{ borderColor: "var(--line-2)" }}
                >
                  <form action={addHoliday} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="calendarId" value={selectedCalendar.id} />
                    <input
                      type="date"
                      name="date"
                      required
                      className="rounded-md border px-2 py-1.5 font-mono text-sm"
                      style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
                    />
                    <TextInput name="label" required placeholder="Fête nationale" style={{ width: 200 }} />
                    <button
                      type="submit"
                      className="rounded-md border px-3 font-medium"
                      style={{
                        height: 30,
                        fontSize: 12.5,
                        borderColor: "var(--line)",
                        background: "var(--panel)",
                        color: "var(--ink)",
                      }}
                    >
                      Ajouter
                    </button>
                  </form>
                  <span className="flex-1" />
                  <form action={deleteCalendar} className="inline">
                    <input type="hidden" name="calendarId" value={selectedCalendar.id} />
                    <button
                      className="rounded-md border px-3 font-medium"
                      style={{
                        height: 30,
                        fontSize: 12.5,
                        borderColor: "var(--dang)",
                        color: "var(--dang)",
                        background: "var(--panel)",
                      }}
                    >
                      Supprimer le calendrier
                    </button>
                  </form>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
