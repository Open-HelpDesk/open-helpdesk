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
 * Formats acceptés pour l'identité visuelle.
 *
 * Les aides sous les champs conseillent PNG ou SVG en 512 px pour le logo et
 * 32 × 32 pour le favicon : c'est un conseil de qualité, pas la liste des
 * formats admis. On accepte donc aussi le JPEG et le WebP, qu'un logo de marque
 * a de bonnes chances d'être, et l'ICO pour le favicon. Ce qui est refusé l'est
 * avec un message qui nomme les formats — jamais en silence.
 */
const FORMATS: Record<BrandAssetKind, Set<string>> = {
  logo: new Set(["image/png", "image/svg+xml", "image/jpeg", "image/webp"]),
  favicon: new Set(["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]),
};

/**
 * Dépose le fichier du champ `kind` s'il y en a un, et renvoie son URL.
 *
 * `null` signifie « rien n'a été déposé » — donc « ne touche pas au réglage
 * existant ». Un fichier refusé n'est pas un `null` : il interrompt
 * l'enregistrement par une redirection, parce qu'un dépôt qui n'aboutit pas
 * sans le dire est exactement le défaut que ce produit a déjà payé.
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

  // Les dépôts d'abord : un format refusé doit interrompre l'enregistrement
  // AVANT d'écrire quoi que ce soit, sinon le nom et la langue seraient
  // enregistrés et le message d'erreur laisserait croire que rien ne l'a été.
  const ancien = (tenant.branding as Record<string, unknown>) ?? {};
  const logoUrl = await uploadIfProvided(tenant.id, "logo", formData);
  const faviconUrl = await uploadIfProvided(tenant.id, "favicon", formData);

  // Retirer est un état du formulaire, pas une action à part : l'écran n'a
  // qu'une barre d'enregistrement, et un bouton qui aurait soumis de son côté
  // aurait emporté le nom ou la langue qu'on venait de changer. Un dépôt
  // l'emporte sur un retrait — le composant les rend d'ailleurs exclusifs.
  const retireLogo = !logoUrl && formData.get("remove-logo") === "1";
  const retireFavicon = !faviconUrl && formData.get("remove-favicon") === "1";

  const branding = {
    ...ancien,
    // Un dépôt remplace, un retrait efface la clé : dans les deux cas l'ancien
    // objet n'est plus désigné par personne et part du bucket plus bas.
    ...(logoUrl ? { logoUrl } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
    ...(retireLogo ? { logoUrl: undefined } : {}),
    ...(retireFavicon ? { faviconUrl: undefined } : {}),
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

  if ((logoUrl || retireLogo) && typeof ancien.logoUrl === "string") {
    await deleteBrandAsset(ancien.logoUrl);
  }
  if ((faviconUrl || retireFavicon) && typeof ancien.faviconUrl === "string") {
    await deleteBrandAsset(ancien.faviconUrl);
  }

  // Le logo est rendu par les deux shells et le favicon par la mise en page
  // racine : ils ne se rafraîchiraient pas en ne revalidant que cet écran.
  revalidatePath("/", "layout");
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
