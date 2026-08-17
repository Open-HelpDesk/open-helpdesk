"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { businessHours, db, slaPolicies, teams } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { parseDurationFr } from "@/lib/rule-labels";
import { requireManager } from "../guard";

const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
const COLUMNS = ["firstReplyMin", "nextReplyMin", "resolveMin"] as const;

/** ST-07 — Sauvegarde d'une politique : cibles saisies en « 15 min » / « 4 h » / « 2 j ». */
export async function saveSlaPolicy(formData: FormData) {
  const { tenant } = await requireManager();
  const policyId = String(formData.get("policyId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!name) return;

  const existing = policyId
    ? (
        await db
          .select()
          .from(slaPolicies)
          .where(and(eq(slaPolicies.tenantId, tenant.id), eq(slaPolicies.id, policyId)))
      )[0]
    : undefined;
  if (policyId && !existing) return;

  let conditions: unknown[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("conditions") ?? "[]"));
    if (Array.isArray(parsed)) conditions = parsed;
  } catch {
    /* conditions vides */
  }
  // La politique par défaut couvre « tous les tickets restants » — conditions verrouillées.
  if (existing?.isDefault) conditions = [];

  const targets: Record<string, unknown> = {};
  for (const prio of PRIORITIES) {
    const entry: Record<string, number> = {};
    for (const col of COLUMNS) {
      const minutes = parseDurationFr(String(formData.get(`t_${prio}_${col}`) ?? ""));
      if (minutes) entry[col] = minutes;
    }
    if (Object.keys(entry).length > 0) targets[prio] = entry;
  }
  const reminder = Number(formData.get("reminderMin") ?? 0);
  if (Number.isFinite(reminder) && reminder > 0) targets.reminderMin = reminder;

  let businessHoursId: string | null = null;
  const bhRaw = String(formData.get("businessHoursId") ?? "");
  if (bhRaw) {
    const [bh] = await db
      .select({ id: businessHours.id })
      .from(businessHours)
      .where(and(eq(businessHours.tenantId, tenant.id), eq(businessHours.id, bhRaw)));
    businessHoursId = bh?.id ?? null;
  }

  if (existing) {
    await db
      .update(slaPolicies)
      .set({ name, conditions, targets, businessHoursId })
      .where(eq(slaPolicies.id, existing.id));
  } else {
    const rows = await db
      .select({ position: slaPolicies.position })
      .from(slaPolicies)
      .where(eq(slaPolicies.tenantId, tenant.id));
    const position = rows.length > 0 ? Math.max(...rows.map((p) => p.position)) + 1 : 0;
    await db
      .insert(slaPolicies)
      .values({ tenantId: tenant.id, name, conditions, targets, businessHoursId, position });
  }

  revalidatePath("/app/settings/sla");
  redirect("/app/settings/sla?saved=1");
}

/** La politique par défaut n'est pas supprimable (ST-07). */
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

/* ---------- Onglet Horaires ouvrés — CRUD businessHours ---------- */

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function isTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export async function createCalendar(formData: FormData) {
  const { tenant } = await requireManager();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return;

  const [calendar] = await db
    .insert(businessHours)
    .values({
      tenantId: tenant.id,
      name,
      timezone: tenant.timezone,
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

/** Édition de la semaine : toggle par jour + plage « 09:00 → 18:00 ». */
export async function saveCalendar(formData: FormData) {
  const { tenant } = await requireManager();
  const calendarId = String(formData.get("calendarId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);

  const [calendar] = await db
    .select()
    .from(businessHours)
    .where(and(eq(businessHours.tenantId, tenant.id), eq(businessHours.id, calendarId)));
  if (!calendar) return;

  const weeklyHours: Record<string, [string, string][]> = {};
  for (const day of DAYS) {
    if (formData.get(`d_${day}_on`) !== "on") continue;
    const start = String(formData.get(`d_${day}_start`) ?? "09:00");
    const end = String(formData.get(`d_${day}_end`) ?? "18:00");
    if (isTime(start) && isTime(end) && start < end) {
      weeklyHours[day] = [[start, end]];
    }
  }

  await db
    .update(businessHours)
    .set({ name: name || calendar.name, weeklyHours })
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

  // Détache les politiques et équipes avant suppression (retour au 24/7).
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
