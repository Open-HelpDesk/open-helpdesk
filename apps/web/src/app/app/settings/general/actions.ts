"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tenants, users } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { requireManager } from "../guard";
import { DEFAULT_LOCALE, isLocaleCode } from "@/i18n/locales";
import {
  MAX_BRAND_BYTES,
  deleteBrandAsset,
  saveBrandAsset,
  type BrandAssetKind,
} from "@/lib/storage";

/**
 * Accepted formats for the visual identity.
 *
 * The hints under the fields recommend PNG or SVG at 512 px for the logo and
 * 32 × 32 for the favicon: that is quality advice, not the list of accepted
 * formats. So we also accept JPEG and WebP, which a brand logo has a good
 * chance of being, and ICO for the favicon. Whatever gets rejected is rejected
 * with a message that names the formats — never silently.
 */
const FORMATS: Record<BrandAssetKind, Set<string>> = {
  logo: new Set(["image/png", "image/svg+xml", "image/jpeg", "image/webp"]),
  favicon: new Set(["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]),
};

/**
 * Uploads the file from the `kind` field if there is one, and returns its URL.
 *
 * `null` means "nothing was uploaded" — hence "do not touch the existing
 * setting". A rejected file is not a `null`: it interrupts the save with a
 * redirect, because an upload that fails without saying so is exactly the flaw
 * this product has already paid for.
 */
async function uploadIfProvided(
  tenantId: string,
  kind: BrandAssetKind,
  formData: FormData,
): Promise<string | null> {
  const file = formData.get(kind);
  if (!(file instanceof File) || file.size === 0) return null;
  if (!FORMATS[kind].has(file.type)) redirect(`/app/settings/general?error=${kind}-format`);
  if (file.size > MAX_BRAND_BYTES) redirect(`/app/settings/general?error=${kind}-size`);
  return saveBrandAsset(tenantId, kind, file);
}

/** ST-01 — Identity + regional settings: tenants.name, branding jsonb, locale, timezone, format. */
export async function saveGeneral(formData: FormData) {
  const { tenant } = await requireManager();

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const accent = String(formData.get("accentColor") ?? "").trim();
  const locale = String(formData.get("locale") ?? "fr");
  const timezone = String(formData.get("timezone") ?? "Europe/Paris");
  const format = String(formData.get("ticketNumberFormat") ?? "").trim() || "#{number}";
  const firstNumberRaw = String(formData.get("firstNumber") ?? "").trim();
  const firstNumber = Number(firstNumberRaw);

  // Uploads first: a rejected format must interrupt the save BEFORE anything
  // is written, otherwise the name and the language would be saved and the
  // error message would suggest that nothing had been.
  const previous = (tenant.branding as Record<string, unknown>) ?? {};
  const logoUrl = await uploadIfProvided(tenant.id, "logo", formData);
  const faviconUrl = await uploadIfProvided(tenant.id, "favicon", formData);

  // Removing is a state of the form, not a separate action: the screen only
  // has one save bar, and a button that submitted on its own would have thrown
  // away the name or the language just changed. An upload wins over a removal
  // — the component actually makes them mutually exclusive.
  const removeLogo = !logoUrl && formData.get("remove-logo") === "1";
  const removeFavicon = !faviconUrl && formData.get("remove-favicon") === "1";

  const branding = {
    ...previous,
    // An upload replaces, a removal erases the key: in both cases the old
    // object is no longer referenced by anyone and leaves the bucket below.
    ...(logoUrl ? { logoUrl } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
    ...(removeLogo ? { logoUrl: undefined } : {}),
    ...(removeFavicon ? { faviconUrl: undefined } : {}),
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

  if ((logoUrl || removeLogo) && typeof previous.logoUrl === "string") {
    await deleteBrandAsset(previous.logoUrl);
  }
  if ((faviconUrl || removeFavicon) && typeof previous.faviconUrl === "string") {
    await deleteBrandAsset(previous.faviconUrl);
  }

  // The logo is rendered by both shells and the favicon by the root layout:
  // they would not refresh if we revalidated only this screen.
  revalidatePath("/", "layout");
  redirect("/app/settings/general?saved=1");
}
/** ST-01 — Danger zone: ownership transfer (Owner only, real action). */
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
 * ST-01 — Workspace deletion: hard-coded REFUSAL. Scheduled deletion (30-day
 * retention) is available on the cloud plan only.
 */
export async function deleteWorkspace(formData: FormData) {
  const { tenant } = await requireManager();
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== tenant.slug) {
    redirect("/app/settings/general?error=slug");
  }
  // Deliberate refusal — no deletion is performed when self-hosted.
  redirect("/app/settings/general?error=delete-cloud");
}
