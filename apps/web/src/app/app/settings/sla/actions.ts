"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { businessHours, db, slaPolicies, teams } from "@openhelpdesk/db";
import { and, asc, eq } from "drizzle-orm";
import { parseDurationTokens } from "@/lib/rule-labels";
import { requireManager } from "../guard";

const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
const COLUMNS = ["firstReplyMin", "nextReplyMin", "resolveMin"] as const;

/** The tenant's calendar, or null (24/7). */
async function resolveCalendarId(tenantId: string, raw: string): Promise<string | null> {
  if (!raw) return null;
  const [row] = await db
    .select({ id: businessHours.id })
    .from(businessHours)
    .where(and(eq(businessHours.tenantId, tenantId), eq(businessHours.id, raw)));
  return row?.id ?? null;
}

function parseConditions(raw: unknown): unknown[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * ST-07 — Targets of the selected policy (edited in place under the list):
 * "15 min" / "4 h" / "2 j" inputs, applied calendar and reminder before the due date.
 */
export async function saveSlaTargets(formData: FormData) {
  const { tenant } = await requireManager();
  const policyId = String(formData.get("policyId") ?? "");
  const [existing] = await db
    .select()
    .from(slaPolicies)
    .where(and(eq(slaPolicies.tenantId, tenant.id), eq(slaPolicies.id, policyId)));
  if (!existing) return;

  const targets: Record<string, unknown> = {};
  for (const prio of PRIORITIES) {
    const entry: Record<string, number> = {};
    for (const col of COLUMNS) {
      const minutes = parseDurationTokens(String(formData.get(`t_${prio}_${col}`) ?? ""));
      if (minutes) entry[col] = minutes;
    }
    if (Object.keys(entry).length > 0) targets[prio] = entry;
  }
  const reminder = Number(formData.get("reminderMin") ?? 0);
  if (Number.isFinite(reminder) && reminder > 0) targets.reminderMin = reminder;

  await db
    .update(slaPolicies)
    .set({
      targets,
      businessHoursId: await resolveCalendarId(
        tenant.id,
        String(formData.get("businessHoursId") ?? ""),
      ),
    })
    .where(eq(slaPolicies.id, existing.id));

  revalidatePath("/app/settings/sla");
  redirect(`/app/settings/sla?policy=${existing.id}&saved=1`);
}

/** Name and matching conditions (drawer) — the default policy keeps its conditions empty. */
export async function savePolicyMeta(formData: FormData) {
  const { tenant } = await requireManager();
  const policyId = String(formData.get("policyId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!name) return;

  const [existing] = await db
    .select()
    .from(slaPolicies)
    .where(and(eq(slaPolicies.tenantId, tenant.id), eq(slaPolicies.id, policyId)));
  if (!existing) return;

  await db
    .update(slaPolicies)
    .set({
      name,
      conditions: existing.isDefault ? [] : parseConditions(formData.get("conditions")),
    })
    .where(eq(slaPolicies.id, existing.id));

  revalidatePath("/app/settings/sla");
  redirect(`/app/settings/sla?policy=${existing.id}&saved=1`);
}

/** Creation: the new policy is placed before the default policy. */
export async function createSlaPolicy(formData: FormData) {
  const { tenant } = await requireManager();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!name) return;

  const rows = await db
    .select()
    .from(slaPolicies)
    .where(eq(slaPolicies.tenantId, tenant.id))
    .orderBy(asc(slaPolicies.position));
  const defaultPosition = rows.find((p) => p.isDefault)?.position;
  const position =
    defaultPosition !== undefined
      ? defaultPosition
      : rows.length > 0
        ? Math.max(...rows.map((p) => p.position)) + 1
        : 0;

  // Starting targets: those of the default policy, so as not to start from an empty grid.
  const seedTargets = rows.find((p) => p.isDefault)?.targets ?? {};

  const [created] = await db
    .insert(slaPolicies)
    .values({
      tenantId: tenant.id,
      name,
      conditions: parseConditions(formData.get("conditions")),
      targets: seedTargets,
      businessHoursId: await resolveCalendarId(
        tenant.id,
        String(formData.get("businessHoursId") ?? ""),
      ),
      position,
    })
    .returning();

  // Shifts the default policy (and the following ones) so it stays last.
  if (defaultPosition !== undefined) {
    for (const p of rows.filter((r) => r.position >= defaultPosition)) {
      await db
        .update(slaPolicies)
        .set({ position: p.position + 1 })
        .where(eq(slaPolicies.id, p.id));
    }
  }

  revalidatePath("/app/settings/sla");
  redirect(`/app/settings/sla?policy=${created?.id ?? ""}&saved=1`);
}

/** Drag-and-drop reordering: positions normalized to the index. */
export async function reorderSlaPolicies(ids: string[]) {
  const { tenant } = await requireManager();
  const rows = await db
    .select({ id: slaPolicies.id })
    .from(slaPolicies)
    .where(eq(slaPolicies.tenantId, tenant.id));
  const owned = new Set(rows.map((r) => r.id));

  let position = 0;
  for (const id of ids) {
    if (!owned.has(id)) continue;
    await db.update(slaPolicies).set({ position: position++ }).where(eq(slaPolicies.id, id));
  }
  revalidatePath("/app/settings/sla");
}

/** The default policy cannot be deleted (ST-07). */
export async function deleteSlaPolicy(formData: FormData) {
  const { tenant } = await requireManager();
  const policyId = String(formData.get("policyId"));
  await db
    .delete(slaPolicies)
    .where(
      and(
        eq(slaPolicies.tenantId, tenant.id),
        eq(slaPolicies.id, policyId),
        eq(slaPolicies.isDefault, false),
      ),
    );
  revalidatePath("/app/settings/sla");
}

/* ---------- Business hours tab — businessHours CRUD ---------- */

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function isTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** Valid IANA time zone? (the Intl API is the source of truth). */
function isTimezone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function createCalendar(formData: FormData) {
  const { tenant } = await requireManager();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return;
  const timezone = String(formData.get("timezone") ?? "").trim();

  const [calendar] = await db
    .insert(businessHours)
    .values({
      tenantId: tenant.id,
      name,
      timezone: isTimezone(timezone) ? timezone : tenant.timezone,
      position: 99,
      weeklyHours: {
        mon: [["09:00", "18:00"]],
        tue: [["09:00", "18:00"]],
        wed: [["09:00", "18:00"]],
        thu: [["09:00", "18:00"]],
        fri: [["09:00", "18:00"]],
      },
      holidays: [],
    })
    .returning();

  revalidatePath("/app/settings/sla");
  redirect(`/app/settings/sla?tab=hours${calendar ? `&cal=${calendar.id}` : ""}`);
}

/** Week editing: per-day toggle + "09:00 → 18:00" range. */
export async function saveCalendar(formData: FormData) {
  const { tenant } = await requireManager();
  const calendarId = String(formData.get("calendarId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);

  const [calendar] = await db
    .select()
    .from(businessHours)
    .where(and(eq(businessHours.tenantId, tenant.id), eq(businessHours.id, calendarId)));
  if (!calendar) return;

  // WeekEditor payload: { mon: [["09:00","18:00"], …], … }
  let submitted: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(formData.get("week") ?? "{}"));
    if (parsed && typeof parsed === "object") submitted = parsed as Record<string, unknown>;
  } catch {
    /* unreadable week → closed calendar, the user sees the result */
  }

  const weeklyHours: Record<string, [string, string][]> = {};
  for (const day of DAYS) {
    const raw = submitted[day];
    if (!Array.isArray(raw)) continue;
    const ranges = raw
      .filter(
        (r): r is [string, string] =>
          Array.isArray(r) &&
          typeof r[0] === "string" &&
          typeof r[1] === "string" &&
          isTime(r[0]) &&
          isTime(r[1]) &&
          r[0] < r[1],
      )
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (ranges.length > 0) weeklyHours[day] = ranges;
  }

  const timezone = String(formData.get("timezone") ?? "").trim();

  await db
    .update(businessHours)
    .set({
      name: name || calendar.name,
      timezone: isTimezone(timezone) ? timezone : calendar.timezone,
      weeklyHours,
    })
    .where(eq(businessHours.id, calendar.id));

  revalidatePath("/app/settings/sla");
  redirect(`/app/settings/sla?tab=hours&cal=${calendar.id}&saved=1`);
}

export async function addHoliday(formData: FormData) {
  const { tenant } = await requireManager();
  const calendarId = String(formData.get("calendarId") ?? "");
  const date = String(formData.get("date") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 80);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) return;

  const [calendar] = await db
    .select()
    .from(businessHours)
    .where(and(eq(businessHours.tenantId, tenant.id), eq(businessHours.id, calendarId)));
  if (!calendar) return;

  const holidays = ((calendar.holidays as { date: string; label: string }[]) ?? []).filter(
    (h) => h.date !== date,
  );
  holidays.push({ date, label });
  holidays.sort((a, b) => a.date.localeCompare(b.date));

  await db.update(businessHours).set({ holidays }).where(eq(businessHours.id, calendar.id));
  revalidatePath("/app/settings/sla");
  redirect(`/app/settings/sla?tab=hours&cal=${calendar.id}`);
}

export async function removeHoliday(formData: FormData) {
  const { tenant } = await requireManager();
  const calendarId = String(formData.get("calendarId") ?? "");
  const date = String(formData.get("date") ?? "");

  const [calendar] = await db
    .select()
    .from(businessHours)
    .where(and(eq(businessHours.tenantId, tenant.id), eq(businessHours.id, calendarId)));
  if (!calendar) return;

  const holidays = ((calendar.holidays as { date: string; label: string }[]) ?? []).filter(
    (h) => h.date !== date,
  );
  await db.update(businessHours).set({ holidays }).where(eq(businessHours.id, calendar.id));
  revalidatePath("/app/settings/sla");
  redirect(`/app/settings/sla?tab=hours&cal=${calendar.id}`);
}

export async function deleteCalendar(formData: FormData) {
  const { tenant } = await requireManager();
  const calendarId = String(formData.get("calendarId") ?? "");
  const [calendar] = await db
    .select({ id: businessHours.id })
    .from(businessHours)
    .where(and(eq(businessHours.tenantId, tenant.id), eq(businessHours.id, calendarId)));
  if (!calendar) return;

  // Detaches policies and teams before deletion (back to 24/7).
  await db
    .update(slaPolicies)
    .set({ businessHoursId: null })
    .where(and(eq(slaPolicies.tenantId, tenant.id), eq(slaPolicies.businessHoursId, calendar.id)));
  await db
    .update(teams)
    .set({ businessHoursId: null })
    .where(and(eq(teams.tenantId, tenant.id), eq(teams.businessHoursId, calendar.id)));
  await db.delete(businessHours).where(eq(businessHours.id, calendar.id));

  revalidatePath("/app/settings/sla");
  redirect("/app/settings/sla?tab=hours");
}
