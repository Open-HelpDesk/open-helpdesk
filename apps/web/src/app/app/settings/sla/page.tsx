import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { businessHours, db, slaPolicies } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { conditionsSummary, formatDurationTokens } from "@/lib/rule-labels";
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
  toggleSlaPolicy,
} from "./actions";

/** Mock-up grid: a fixed priority column, then the three targets in equal share. */
const TARGET_GRID = "110px 1fr 1fr 1fr";
const TARGET_MIN_WIDTH = 560;
const PRIORITY_ORDER = ["urgent", "high", "normal", "low"] as const;

type Targets = Record<
  string,
  { firstReplyMin?: number; nextReplyMin?: number; resolveMin?: number }
> & { reminderMin?: number };

/** Target field, to the mock-up's measure: h36, 0 12px, r9, 13 px, mono. */
function TargetInput({ name, value }: { name: string; value?: number }) {
  return (
    <input
      name={name}
      defaultValue={formatDurationTokens(value)}
      placeholder="—"
      className="font-mono tabular-nums"
      style={{
        height: 36,
        padding: "0 12px",
        border: "1px solid var(--line)",
        borderRadius: 9,
        background: "var(--panel)",
        color: "var(--ink)",
        fontSize: 13,
        width: "100%",
      }}
    />
  );
}

/** The mock-up's status pill: 3px 10px, r999, 11.5/600. */
function pillStyle(tone: "active" | "inactive" | "default"): React.CSSProperties {
  const ink = {
    active: ["var(--ok-t)", "var(--ok)"],
    inactive: ["var(--sunk)", "var(--ink-3)"],
    default: ["var(--sunk)", "var(--ink-3)"],
  }[tone];
  return {
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    background: ink[0],
    color: ink[1],
  };
}

/** Column heading of a target grid: 10.5 px, 600, spaced small caps. */
function ColumnHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: "var(--ink-3)",
        fontWeight: 600,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        fontSize: 10.5,
      }}
    >
      {children}
    </div>
  );
}

/** The clock of the business-hours strip — 15 px, stroke 1.9, as drawn. */
function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="var(--ink-3)"
      strokeWidth="1.9"
      style={{ flex: "none" }}
      aria-hidden
    >
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
      <path d="M12 6v6l4 2" />
    </svg>
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
 * ST-07 — SLA & business hours (1000 px), faithful to the mockup:
 * Policies tab = blue banner + single draggable list + editable targets of the
 * selected policy next to the "Worked example" callout (actually computed);
 * Hours tab = calendar chips, week with switches, holidays as chips.
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

  /* V2 sends "New policy" to a page of its own (sla/new): the conditions
     builder is a three-column grid, and the 420 px drawer folded it in half. */
  const newPolicyLink = (
    <Link
      href="/app/settings/sla/new"
      className="inline-flex items-center font-semibold"
      style={{
        color: "var(--on-brand)",
        height: 38,
        padding: "0 16px",
        borderRadius: 9,
        fontSize: 13.5,
        background: "var(--brand)",
        whiteSpace: "nowrap",
      }}
    >
      {t("app.settings.sla.newPolicy")}
    </Link>
  );

  return (
    <PageShell>
      <PageHeader
        title={t("app.settings.sla.title")}
        subtitle={t("app.settings.sla.subtitle")}
        tabs={tabs}
        actions={activeTab === "policies" ? newPolicyLink : undefined}
      />

      {activeTab === "policies" ? (
        /* The mock-up drops the evaluation-order banner: the drag handles and
           the 01/02/03 numbering already say that order matters, and the page
           subtitle carries the rule in words. */
        <PolicyRows
          policies={policies.map((p) => {
            const targets = (p.targets ?? {}) as Targets;
            const calendarName = p.businessHoursId
              ? (calendarById.get(p.businessHoursId)?.name ?? "—")
              : t("app.settings.sla.calendarNone");

            return {
              id: p.id,
              name: p.name,
              scope: p.isDefault
                ? t("app.settings.sla.allRemainingTickets")
                : ((p.conditions as never[]) ?? []).length > 0
                  ? conditionsSummary(t, (p.conditions as never[]) ?? [], [])
                  : t("app.settings.sla.allTickets"),
              status: p.isDefault ? (
                <span key={`${p.id}-badge`} style={pillStyle("default")}>
                  {t("app.settings.sla.defaultBadge")}
                </span>
              ) : (
                <form key={`${p.id}-toggle`} action={toggleSlaPolicy} className="flex">
                  <input type="hidden" name="policyId" value={p.id} />
                  <button
                    type="submit"
                    aria-pressed={p.active}
                    title={
                      p.active
                        ? t("app.settings.sla.deactivatePolicy")
                        : t("app.settings.sla.activatePolicy")
                    }
                    className="ohd-hover-edge"
                    style={{
                      ...pillStyle(p.active ? "active" : "inactive"),
                      border: "1px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    {p.active
                      ? t("app.settings.sla.statusActive")
                      : t("app.settings.sla.statusInactive")}
                  </button>
                </form>
              ),
              save: (
                <button
                  key={`${p.id}-save`}
                  type="submit"
                  form={`sla-targets-${p.id}`}
                  style={{
                    height: 32,
                    flex: "none",
                    padding: "0 14px",
                    borderRadius: 8,
                    background: "var(--brand)",
                    color: "var(--on-brand)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  {t("app.settings.sla.save")}
                </button>
              ),
              edit: (
                <Drawer
                  key={p.id}
                  trigger={
                    <span
                      aria-label={t("app.settings.sla.editNameConditions")}
                      title={t("app.settings.sla.editNameConditions")}
                      style={{
                        width: 32,
                        height: 32,
                        flex: "none",
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        background: "var(--panel)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        color: "var(--ink-3)",
                        cursor: "pointer",
                      }}
                    >
                      ✎
                    </span>
                  }
                  title={t("app.settings.sla.policyDrawerTitle", { name: p.name })}
                >
                  <form action={savePolicyMeta} className="flex flex-col gap-4">
                    <input type="hidden" name="policyId" value={p.id} />
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
                        defaultValue={p.name}
                        style={{
                          height: 40,
                          padding: "0 12px",
                          border: "1px solid var(--line)",
                          borderRadius: 9,
                          background: "var(--panel)",
                          color: "var(--ink)",
                          fontSize: 13.5,
                        }}
                      />
                    </label>

                    {/* The calendar sits with the name, as on the mock-up's
                        "New policy" screen — a policy's durations are read
                        against it, so it belongs to the policy, not to the grid. */}
                    <label className="flex flex-col gap-1.5">
                      <span
                        className="font-semibold"
                        style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                      >
                        {t("app.settings.sla.calendarApplied")}
                      </span>
                      <SelectBox
                        name="businessHoursId"
                        defaultValue={p.businessHoursId ?? ""}
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
                        defaultValue={String(((p.targets ?? {}) as Targets).reminderMin ?? 30)}
                      >
                        {reminders.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </SelectBox>
                    </label>

                    {p.isDefault ? (
                      <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                        {t("app.settings.sla.defaultPolicyNote")}
                      </p>
                    ) : (
                      <ConditionsBuilder
                        name="conditions"
                        label={t("app.settings.sla.conditionsLabel")}
                        initial={(p.conditions as never[]) ?? []}
                      />
                    )}
                    <button
                      type="submit"
                      className="self-start rounded-[9px] px-4 font-semibold"
                      style={{
                        color: "var(--on-brand)",
                        height: 38,
                        fontSize: 13.5,
                        background: "var(--brand)",
                      }}
                    >
                      {t("app.settings.sla.save")}
                    </button>
                  </form>
                  {!p.isDefault && (
                    <form action={deleteSlaPolicy} className="mt-2">
                      <input type="hidden" name="policyId" value={p.id} />
                      <button
                        className="ohd-hover-edge-ink rounded-[9px] border px-3 font-medium"
                        style={{
                          height: 38,
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
              ),
              body: (
                <div
                  key={p.id}
                  style={{
                    borderTop: "1px solid var(--line-2)",
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <form
                    id={`sla-targets-${p.id}`}
                    action={saveSlaTargets}
                    className="flex flex-col"
                    style={{ gap: 12 }}
                  >
                    <input type="hidden" name="policyId" value={p.id} />

                    <div style={{ overflowX: "auto" }}>
                      <div className="flex flex-col" style={{ gap: 12, minWidth: TARGET_MIN_WIDTH }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: TARGET_GRID,
                            gap: 10,
                          }}
                        >
                          <ColumnHead>{t("app.settings.sla.colPriority")}</ColumnHead>
                          <ColumnHead>{t("app.settings.sla.colFirstReply")}</ColumnHead>
                          <ColumnHead>{t("app.settings.sla.colNextReplies")}</ColumnHead>
                          <ColumnHead>{t("app.settings.sla.colResolve")}</ColumnHead>
                        </div>
                        {PRIORITY_ORDER.map((prio) => {
                          const row = targets[prio];
                          return (
                            <div
                              key={prio}
                              style={{
                                display: "grid",
                                gridTemplateColumns: TARGET_GRID,
                                gap: 10,
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 7,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: PRIORITY_COLORS[prio],
                                }}
                              >
                                {/* Square, not a disc: the mock-up marks priority
                                    with an 8 px chip rounded to 2. */}
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 2,
                                    background: PRIORITY_COLORS[prio],
                                  }}
                                />
                                {t(PRIORITY_KEYS[prio]!)}
                              </span>
                              <TargetInput
                                name={`t_${prio}_firstReplyMin`}
                                value={row?.firstReplyMin}
                              />
                              <TargetInput
                                name={`t_${prio}_nextReplyMin`}
                                value={row?.nextReplyMin}
                              />
                              <TargetInput
                                name={`t_${prio}_resolveMin`}
                                value={row?.resolveMin}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Business-hours strip, as drawn: sunk, r10, clock 15 px. */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "11px 14px",
                        background: "var(--sunk)",
                        borderRadius: 10,
                        fontSize: 13,
                        color: "var(--ink-2)",
                        textWrap: "pretty",
                      }}
                    >
                      <ClockIcon />
                      {t("app.settings.sla.calendarApplied")} : {calendarName}
                    </div>
                  </form>
                </div>
              ),
            };
          })}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Calendar chips */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {calendars.map((c) => {
              const active = selectedCalendar?.id === c.id;
              return (
                <Link
                  className="ohd-hover-edge-ink"
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
                  className="self-start rounded-[9px] px-3.5 font-semibold"
                  style={{ color: "var(--on-brand)", height: 38, fontSize: 13, background: "var(--acc)" }}
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

              {/* Holidays */}
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
                        className="self-start rounded-[9px] px-3.5 font-semibold"
                        style={{ color: "var(--on-brand)", height: 38, fontSize: 13, background: "var(--acc)" }}
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
                  className="ohd-hover-edge-ink rounded-md border px-3 font-medium"
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
