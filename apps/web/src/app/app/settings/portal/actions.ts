"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { entitlementsFor } from "@/lib/entitlements";
import { requireManager } from "../guard";

type PortalConfig = {
  portalEnabled?: boolean;
  kbPublished?: boolean;
  hidePoweredBy?: boolean;
  kbVisibility?: "public" | "authenticated";
  contactAuth?: "magic_link" | "sso";
  welcomeText?: string;
  widget?: { enabled?: boolean; color?: string; position?: "right" | "left"; title?: string };
};

/** ST-09 — Deux formulaires (onglets Portail / Widget), fusionnés dans portalConfig. */
export async function savePortalConfig(formData: FormData) {
  const { tenant } = await requireManager();
  const section = formData.get("section") === "widget" ? "widget" : "portal";
  const config = ((tenant.portalConfig as PortalConfig) ?? {}) as PortalConfig;
  const ent = entitlementsFor(tenant.plan);

  let next: PortalConfig;
  if (section === "portal") {
    next = {
      ...config,
      portalEnabled: formData.get("portalEnabled") === "on",
      kbPublished: formData.get("kbPublished") === "on",
      // « Masquer Propulsé par » — disponible à partir du plan Pro uniquement.
      hidePoweredBy: ent.multiBrand ? formData.get("hidePoweredBy") === "on" : false,
      kbVisibility: formData.get("kbVisibility") === "authenticated" ? "authenticated" : "public",
      contactAuth: formData.get("contactAuth") === "sso" ? "sso" : "magic_link",
      welcomeText:
        String(formData.get("welcomeText") ?? "").trim().slice(0, 200) || undefined,
    };
  } else {
    const color = String(formData.get("widgetColor") ?? "");
    next = {
      ...config,
      widget: {
        enabled: formData.get("widgetEnabled") === "on",
        color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined,
        position: formData.get("widgetPosition") === "left" ? "left" : "right",
        title: String(formData.get("widgetTitle") ?? "").trim().slice(0, 60) || undefined,
      },
    };
  }

  await db.update(tenants).set({ portalConfig: next }).where(eq(tenants.id, tenant.id));
  revalidatePath("/app/settings/portal");
  redirect(`/app/settings/portal?${section === "widget" ? "tab=widget&" : ""}saved=1`);
}
