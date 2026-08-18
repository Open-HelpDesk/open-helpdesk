"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tenants, users } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { requireManager } from "../guard";
import { DEFAULT_LOCALE, isLocaleCode } from "@/i18n/locales";

/** ST-01 — Identité + régionalisation : tenants.name, branding jsonb, locale, timezone, format. */
export async function saveGeneral(formData: FormData) {
  const { tenant } = await requireManager();

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const accent = String(formData.get("accentColor") ?? "").trim();
  const locale = String(formData.get("locale") ?? "fr");
  const timezone = String(formData.get("timezone") ?? "Europe/Paris");
  const format = String(formData.get("ticketNumberFormat") ?? "").trim() || "#{number}";
  const firstNumberRaw = String(formData.get("firstNumber") ?? "").trim();
  const firstNumber = Number(firstNumberRaw);

  const branding = {
    ...((tenant.branding as Record<string, unknown>) ?? {}),
    accentColor: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : undefined,
    firstTicketNumber:
      firstNumberRaw !== "" && Number.isInteger(firstNumber) && firstNumber > 0
        ? firstNumber
        : undefined,
  };

  await db
    .update(tenants)
    .set({
      name: name || tenant.name,
      branding,
      locale: isLocaleCode(locale) ? locale : DEFAULT_LOCALE,
      timezone: timezone.slice(0, 60) || "Europe/Paris",
      ticketNumberFormat: format.slice(0, 40),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id));

  revalidatePath("/app/settings/general");
  redirect("/app/settings/general?saved=1");
}

/** ST-01 — Zone de danger : transfert de propriété (Owner uniquement, action réelle). */
export async function transferOwnership(formData: FormData) {
  const { tenant, agent: me } = await requireManager();
  if (me.role !== "owner") return;

  const newOwnerId = String(formData.get("newOwnerId") ?? "");
  if (!newOwnerId || newOwnerId === me.id) return;

  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.id, newOwnerId)));
  if (!target || target.status !== "active" || target.role !== "admin") return;

  await db.update(users).set({ role: "owner" }).where(eq(users.id, target.id));
  await db.update(users).set({ role: "admin" }).where(eq(users.id, me.id));

  revalidatePath("/app/settings/general");
  redirect("/app/settings/general?saved=1");
}

/**
 * ST-01 — Suppression du workspace : REFUS en dur. La suppression programmée
 * (rétention 30 jours) est disponible sur l'offre cloud uniquement.
 */
export async function deleteWorkspace(formData: FormData) {
  const { tenant } = await requireManager();
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== tenant.slug) {
    redirect("/app/settings/general?error=slug");
  }
  // Refus volontaire — aucune suppression exécutée en auto-hébergé.
  redirect("/app/settings/general?error=delete-cloud");
}
