import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { businessHours, db, slaPolicies } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import {
  addBusinessMinutes,
  formatBusinessMoment,
  zonedParts,
  zonedTimeToInstant,
  type BusinessCalendar,
} from "@openhelpdesk/rules";
import { formatDurationFr, ruleSummary } from "@/lib/rule-labels";
import { PRIORITY_COLORS, PRIORITY_KEYS } from "@/lib/format";
import { PageHeader, PageShell, SaveBar } from "@/components/settings-page";
import { Drawer } from "@/components/settings-overlays";
import { ConditionsBuilder } from "@/components/rule-builders";
import { PolicyRows } from "./policy-rows";
import { WeekEditor } from "./week-editor";
import { getT } from "@/i18n/server";
import {
  addHoliday,
  createCalendar,
  createSlaPolicy,
  deleteCalendar,
  deleteSlaPolicy,
  removeHoliday,
  saveCalendar,
  savePolicyMeta,
  saveSlaTargets,
} from "./actions";

const TARGET_GRID = "130px 1fr 1fr 1fr";
const TARGET_MIN_WIDTH = 560;
const PRIORITY_ORDER = ["urgent", "high", "normal", "low"] as const;

type Targets = Record<
  string,
  { firstReplyMin?: number; nextReplyMin?: number; resolveMin?: number }
> & { reminderMin?: number };

/**
 * Rend une phrase traduite dont plusieurs segments sont mis en valeur : la phrase
 * reste une seule clé, les segments à passer en gras y sont encadrés d'astérisques
 * (le traducteur les déplace avec les mots, l'ordre change d'une langue à l'autre).
 */
function emphasize(sentence: string) {
  return sentence
    .split("*")
    .map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part));
}

/** Champ de cible : même boîte que le design (h32, bordée, tabular-nums). */
function TargetInput({ name, value }: { name: string; value?: number }) {
  return (
    <input
      name={name}
      defaultValue={formatDurationFr(value)}
      placeholder="—"
      className="tabular-nums"
      style={{
        height: 32,
        padding: "0 10px",
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: "var(--bg)",
        color: "var(--ink)",
        fontSize: 13,
        width: "100%",
      }}
    />
  );
}

function SelectBox({
  name,
  children,
  defaultValue,
}: {
  name: string;
  children: React.ReactNode;
  defaultValue?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      style={{
        minHeight: 36,
        padding: "7px 11px",
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: "var(--bg)",
        color: "var(--ink)",
        fontSize: 13.5,
        width: "100%",
      }}
    >
      {children}
    </select>
  );
}

/**
 * ST-07 — SLA & horaires ouvrés (1000 px), fidèle à la maquette :
 * onglet Politiques = bandeau bleu + liste unique glissable + cibles éditables de la
 * politique sélectionnée à côté de l'encart « Exemple calculé » (réellement calculé) ;
 * onglet Horaires = chips calendriers, semaine à interrupteurs, jours fériés en chips.
 */
export default async function SlaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cal?: string; policy?: string; saved?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { tab, cal, policy: policyParam, saved } = await searchParams;
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
      .orderBy(asc(businessHours.position), asc(businessHours.name)),
  ]);

  const calendarById = new Map(calendars.map((c) => [c.id, c]));
  const selected = policies.find((p) => p.id === policyParam) ?? policies[0];
  const selectedCalendar = calendars.find((c) => c.id === cal) ?? calendars[0];

  const tabs = [
    {
      label: t("app.settings.sla.tabPolicies"),
      href: "/app/settings/sla",
      active: activeTab === "policies",
    },
    {
      label: t("app.settings.sla.tabHours"),
      href: "/app/settings/sla?tab=hours",
      active: activeTab === "hours",
    },
  ];

  const reminders: [number, string][] = [
    [0, t("app.settings.sla.reminderNone")],
    [15, t("app.settings.sla.reminderMinutes", { count: 15 })],
    [30, t("app.settings.sla.reminderMinutes", { count: 30 })],
    [60, t("app.settings.sla.reminderHours", { count: 1 })],
    [120, t("app.settings.sla.reminderHours", { count: 2 })],
  ];

  /* ---------- Exemple calculé : vendredi 17 h de la semaine en cours ---------- */
  let example: { first: string; resolve: string } | null = null;
  if (selected) {
    const targets = (selected.targets ?? {}) as Targets;
    const urgent = targets.urgent;
    const row = selected.businessHoursId ? calendarById.get(selected.businessHoursId) : undefined;
    const calendar: BusinessCalendar | null = row
      ? {
          timezone: row.timezone,
          weeklyHours: (row.weeklyHours ?? {}) as BusinessCalendar["weeklyHours"],
          holidays: (row.holidays ?? []) as BusinessCalendar["holidays"],
        }
      : null;
    if (urgent?.firstReplyMin || urgent?.resolveMin) {
      const tz = calendar?.timezone ?? tenant.timezone;
      // Repère du design : le dernier vendredi 17 h, heure murale du calendrier
      // (zonedTimeToInstant gère le décalage été/hiver).
      const today = zonedParts(new Date(), tz);
      const noon = new Date(Date.UTC(today.year, today.month - 1, today.day, 12));
      const daysSinceFriday = (noon.getUTCDay() + 2) % 7;
      const fridayDate = new Date(noon.getTime() - daysSinceFriday * 86_400_000);
      const friday = zonedTimeToInstant(
        tz,
        fridayDate.getUTCFullYear(),
        fridayDate.getUTCMonth() + 1,
        fridayDate.getUTCDate(),
        17,
        0,
      );
      example = {
        first: urgent.firstReplyMin
          ? formatBusinessMoment(addBusinessMinutes(friday, urgent.firstReplyMin, calendar), tz)
          : "—",
        resolve: urgent.resolveMin
          ? formatBusinessMoment(addBusinessMinutes(friday, urgent.resolveMin, calendar), tz)
          : "—",
      };
    }
  }

  const newPolicyTrigger = (
    <span
      className="inline-flex items-center rounded-md px-3.5 font-semibold text-white"
      style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
    >
      {t("app.settings.sla.newPolicy")}
    </span>
  );

  return (
    <PageShell maxWidth={1000}>
      <PageHeader
        title={t("app.settings.sla.title")}
        subtitle={t("app.settings.sla.subtitle")}
        tabs={tabs}
        actions={
          activeTab === "policies" ? (
            <Drawer trigger={newPolicyTrigger} title={t("app.settings.sla.newPolicyTitle")}>
              <form action={createSlaPolicy} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {t("app.settings.sla.policyName")}
                  </span>
                  <input
                    name="name"
                    required
                    placeholder={t("app.settings.sla.policyNamePlaceholder")}
                    style={{
                      height: 36,
                      padding: "0 11px",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      background: "var(--bg)",
                      color: "var(--ink)",
                      fontSize: 13.5,
                    }}
                  />
                </label>
                <ConditionsBuilder
                  name="conditions"
                  label={t("app.settings.sla.conditionsLabelNew")}
                  initial={[]}
                />
                <label className="flex flex-col gap-1.5">
                  <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {t("app.settings.sla.calendarApplied")}
                  </span>
                  <SelectBox name="businessHoursId">
                    <option value="">{t("app.settings.sla.calendarNone")}</option>
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectBox>
                </label>
                <button
                  type="submit"
                  className="self-start rounded-md px-3.5 font-semibold text-white"
                  style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
                >
                  {t("app.settings.sla.createPolicy")}
                </button>
              </form>
            </Drawer>
          ) : undefined
        }
      />

      {activeTab === "policies" ? (
        <div className="flex flex-col gap-4">
          {/* Bandeau d'ordre d'évaluation */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 13px",
              background: "var(--open-t)",
              borderRadius: 9,
              fontSize: 12.5,
              color: "var(--open)",
            }}
          >
            {t("app.settings.sla.orderHint")}
          </div>

          <PolicyRows
            selectedId={selected?.id ?? ""}
            policies={policies.map((p) => ({
              id: p.id,
              name: p.name,
              conditions: p.isDefault
                ? t("app.settings.sla.allRemainingTickets")
                : ((p.conditions as never[]) ?? []).length > 0
                  ? ruleSummary((p.conditions as never[]) ?? [], [], [])
                      .replace(/^Si /, "")
                      .replace(" → aucune action", "")
                  : t("app.settings.sla.allTickets"),
              calendar: p.businessHoursId
                ? (calendarById.get(p.businessHoursId)?.name ?? "—")
                : "24/7",
              locked: p.isDefault,
            }))}
          />

          {selected && (
            <div className="flex flex-col gap-4">
              {/* Titre des cibles + édition du nom/conditions. Le drawer porte son
                  propre <form> : il reste hors du formulaire des cibles. */}
              <div className="flex flex-wrap items-center gap-2">
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {t("app.settings.sla.targetsFor", { name: selected.name })}
                </div>
                <span className="flex-1" />
                <Drawer
                  trigger={
                    <span
                      className="inline-flex items-center rounded-md border px-3 font-medium"
                      style={{
                        height: 32,
                        fontSize: 12.5,
                        borderColor: "var(--line)",
                        background: "var(--panel)",
                        color: "var(--ink)",
                      }}
                    >
                      {t("app.settings.sla.editNameConditions")}
                    </span>
                  }
                  title={t("app.settings.sla.policyDrawerTitle", { name: selected.name })}
                >
                  <form action={savePolicyMeta} className="flex flex-col gap-4">
                    <input type="hidden" name="policyId" value={selected.id} />
                    <label className="flex flex-col gap-1.5">
                      <span
                        className="font-semibold"
                        style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                      >
                        {t("app.settings.sla.name")}
                      </span>
                      <input
                        name="name"
                        required
                        defaultValue={selected.name}
                        style={{
                          height: 36,
                          padding: "0 11px",
                          border: "1px solid var(--line)",
                          borderRadius: 6,
                          background: "var(--bg)",
                          color: "var(--ink)",
                          fontSize: 13.5,
                        }}
                      />
                    </label>
                    {selected.isDefault ? (
                      <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                        {t("app.settings.sla.defaultPolicyNote")}
                      </p>
                    ) : (
                      <ConditionsBuilder
                        name="conditions"
                        label={t("app.settings.sla.conditionsLabel")}
                        initial={(selected.conditions as never[]) ?? []}
                      />
                    )}
                    <button
                      type="submit"
                      className="self-start rounded-md px-3.5 font-semibold text-white"
                      style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
                    >
                      {t("app.settings.sla.save")}
                    </button>
                  </form>
                  {!selected.isDefault && (
                    <form action={deleteSlaPolicy} className="mt-2">
                      <input type="hidden" name="policyId" value={selected.id} />
                      <button
                        className="rounded-md border px-3 font-medium"
                        style={{
                          height: 32,
                          fontSize: 12.5,
                          borderColor: "var(--dang)",
                          color: "var(--dang)",
                          background: "var(--panel)",
                        }}
                      >
                        {t("app.settings.sla.deletePolicy")}
                      </button>
                    </form>
                  )}
                </Drawer>
              </div>

              {/* Cibles de la politique sélectionnée */}
              <form action={saveSlaTargets} className="flex flex-col gap-2.5">
                <input type="hidden" name="policyId" value={selected.id} />
                <div
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    background: "var(--panel)",
                    overflow: "auto",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: TARGET_GRID,
                      minWidth: TARGET_MIN_WIDTH,
                      padding: "0 15px",
                      height: 36,
                      alignItems: "center",
                      background: "var(--sunk)",
                      borderBottom: "1px solid var(--line)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--ink-3)",
                    }}
                  >
                    <div>{t("app.settings.sla.colPriority")}</div>
                    <div>{t("app.settings.sla.colFirstReply")}</div>
                    <div>{t("app.settings.sla.colNextReplies")}</div>
                    <div>{t("app.settings.sla.colResolve")}</div>
                  </div>
                  {PRIORITY_ORDER.map((prio, index) => {
                    const targets = ((selected.targets ?? {}) as Targets)[prio];
                    return (
                      <div
                        key={prio}
                        style={{
                          display: "grid",
                          gridTemplateColumns: TARGET_GRID,
                          minWidth: TARGET_MIN_WIDTH,
                          padding: "0 15px",
                          height: 48,
                          alignItems: "center",
                          gap: 9,
                          borderBottom:
                            index === PRIORITY_ORDER.length - 1
                              ? "none"
                              : "1px solid var(--line-2)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: PRIORITY_COLORS[prio],
                            }}
                          />
                          {t(PRIORITY_KEYS[prio]!)}
                        </div>
                        <TargetInput name={`t_${prio}_firstReplyMin`} value={targets?.firstReplyMin} />
                        <TargetInput name={`t_${prio}_nextReplyMin`} value={targets?.nextReplyMin} />
                        <TargetInput name={`t_${prio}_resolveMin`} value={targets?.resolveMin} />
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {t("app.settings.sla.durationHint")}
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                    gap: 13,
                  }}
                >
                  <label className="flex flex-col gap-1.5">
                    <span
                      className="font-semibold"
                      style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                    >
                      {t("app.settings.sla.calendarApplied")}
                    </span>
                    <SelectBox
                      name="businessHoursId"
                      defaultValue={selected.businessHoursId ?? ""}
                    >
                      <option value="">{t("app.settings.sla.calendarNone")}</option>
                      {calendars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </SelectBox>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span
                      className="font-semibold"
                      style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                    >
                      {t("app.settings.sla.reminderLabel")}
                    </span>
                    <SelectBox
                      name="reminderMin"
                      defaultValue={String(((selected.targets ?? {}) as Targets).reminderMin ?? 30)}
                    >
                      {reminders.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </SelectBox>
                  </label>
                </div>
                {/* Exemple calculé — sous la grille de cibles, pleine largeur */}
                <div
                  style={{
                    border: "1px solid var(--acc-b)",
                    background: "var(--acc-t)",
                    borderRadius: 10,
                    padding: 15,
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    marginTop: 4,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      color: "var(--acc)",
                    }}
                  >
                    {t("app.settings.sla.exampleTitle")}
                  </div>
                  {example ? (
                    <div style={{ fontSize: 13.5, lineHeight: 1.6, textWrap: "pretty" }}>
                      {emphasize(
                        t("app.settings.sla.exampleSentence", {
                          first: example.first,
                          resolve: example.resolve,
                        }),
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                      {t("app.settings.sla.exampleEmpty")}
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", textWrap: "pretty" }}>
                    {t("app.settings.sla.exampleNote")}
                  </div>
                </div>

                <SaveBar saved={saved === "1"} cancelHref="/app/settings/sla" />
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Chips calendriers */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {calendars.map((c) => {
              const active = selectedCalendar?.id === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/app/settings/sla?tab=hours&cal=${c.id}`}
                  style={{
                    padding: "7px 13px",
                    border: `1px solid ${active ? "var(--acc)" : "var(--line)"}`,
                    background: active ? "var(--acc-t)" : "var(--panel)",
                    color: active ? "var(--acc)" : "var(--ink)",
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: active ? 600 : 450,
                  }}
                >
                  {c.name}
                </Link>
              );
            })}
            <Drawer
              trigger={
                <span
                  style={{
                    display: "inline-flex",
                    padding: "7px 13px",
                    border: "1px dashed var(--line)",
                    borderRadius: 7,
                    fontSize: 13,
                    color: "var(--ink-3)",
                  }}
                >
                  {t("app.settings.sla.addCalendar")}
                </span>
              }
              title={t("app.settings.sla.newCalendarTitle")}
            >
              <form action={createCalendar} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {t("app.settings.sla.calendarName")}
                  </span>
                  <input
                    name="name"
                    required
                    placeholder={t("app.settings.sla.calendarNamePlaceholder")}
                    style={{
                      height: 36,
                      padding: "0 11px",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      background: "var(--bg)",
                      color: "var(--ink)",
                      fontSize: 13.5,
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {t("app.settings.sla.timezone")}
                  </span>
                  <input
                    name="timezone"
                    defaultValue={tenant.timezone}
                    style={{
                      height: 36,
                      padding: "0 11px",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      background: "var(--bg)",
                      color: "var(--ink)",
                      fontSize: 13.5,
                    }}
                  />
                </label>
                <button
                  type="submit"
                  className="self-start rounded-md px-3.5 font-semibold text-white"
                  style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
                >
                  {t("app.settings.sla.create")}
                </button>
              </form>
            </Drawer>
          </div>

          {!selectedCalendar ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {t("app.settings.sla.noCalendar")}
            </p>
          ) : (
            <>
              <form action={saveCalendar} className="flex flex-col gap-4">
                <input type="hidden" name="calendarId" value={selectedCalendar.id} />
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1.5" style={{ minWidth: 240 }}>
                    <span
                      className="font-semibold"
                      style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                    >
                      {t("app.settings.sla.calendarName")}
                    </span>
                    <input
                      name="name"
                      defaultValue={selectedCalendar.name}
                      style={{
                        height: 36,
                        padding: "0 11px",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        background: "var(--bg)",
                        color: "var(--ink)",
                        fontSize: 13.5,
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5" style={{ minWidth: 200 }}>
                    <span
                      className="font-semibold"
                      style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                    >
                      {t("app.settings.sla.timezone")}
                    </span>
                    <input
                      name="timezone"
                      defaultValue={selectedCalendar.timezone}
                      style={{
                        height: 36,
                        padding: "0 11px",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        background: "var(--bg)",
                        color: "var(--ink)",
                        fontSize: 13.5,
                      }}
                    />
                  </label>
                </div>

                <WeekEditor
                  initial={
                    (selectedCalendar.weeklyHours ?? {}) as Record<string, [string, string][]>
                  }
                />
                <SaveBar
                  saved={saved === "1"}
                  cancelHref={`/app/settings/sla?tab=hours&cal=${selectedCalendar.id}`}
                />
              </form>

              {/* Jours fériés */}
              <div className="flex flex-col gap-2.5">
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {t("app.settings.sla.holidays")}
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {((selectedCalendar.holidays as { date: string; label: string }[]) ?? []).map(
                    (h) => (
                      <span
                        key={h.date}
                        style={{
                          padding: "5px 11px",
                          border: "1px solid var(--line)",
                          borderRadius: 20,
                          fontSize: 12.5,
                          background: "var(--panel)",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {h.label}
                        <span className="tabular-nums" style={{ color: "var(--ink-3)" }}>
                          {new Date(`${h.date}T00:00:00`).toLocaleDateString(t.locale.tag, {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <form action={removeHoliday} className="inline-flex">
                          <input type="hidden" name="calendarId" value={selectedCalendar.id} />
                          <input type="hidden" name="date" value={h.date} />
                          <button
                            title={t("app.settings.sla.removeHoliday")}
                            style={{ cursor: "pointer", opacity: 0.45 }}
                          >
                            ✕
                          </button>
                        </form>
                      </span>
                    ),
                  )}
                  <Drawer
                    trigger={
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "5px 11px",
                          border: "1px dashed var(--line)",
                          borderRadius: 20,
                          fontSize: 12.5,
                          color: "var(--ink-3)",
                        }}
                      >
                        {t("app.settings.sla.addHoliday")}
                      </span>
                    }
                    title={t("app.settings.sla.addHolidayTitle")}
                  >
                    <form action={addHoliday} className="flex flex-col gap-4">
                      <input type="hidden" name="calendarId" value={selectedCalendar.id} />
                      <label className="flex flex-col gap-1.5">
                        <span
                          className="font-semibold"
                          style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                        >
                          {t("app.settings.sla.holidayDate")}
                        </span>
                        <input
                          type="date"
                          name="date"
                          required
                          style={{
                            height: 36,
                            padding: "0 11px",
                            border: "1px solid var(--line)",
                            borderRadius: 6,
                            background: "var(--bg)",
                            color: "var(--ink)",
                            fontSize: 13.5,
                          }}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span
                          className="font-semibold"
                          style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                        >
                          {t("app.settings.sla.holidayLabel")}
                        </span>
                        <input
                          name="label"
                          required
                          placeholder={t("app.settings.sla.holidayLabelPlaceholder")}
                          style={{
                            height: 36,
                            padding: "0 11px",
                            border: "1px solid var(--line)",
                            borderRadius: 6,
                            background: "var(--bg)",
                            color: "var(--ink)",
                            fontSize: 13.5,
                          }}
                        />
                      </label>
                      <button
                        type="submit"
                        className="self-start rounded-md px-3.5 font-semibold text-white"
                        style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
                      >
                        {t("app.settings.sla.add")}
                      </button>
                    </form>
                  </Drawer>
                </div>
              </div>

              <form action={deleteCalendar} className="mt-2">
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
                  {t("app.settings.sla.deleteCalendar")}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
