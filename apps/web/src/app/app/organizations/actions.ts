"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PUBLIC_EMAIL_DOMAINS } from "@openhelpdesk/config";
import { db, organizations } from "@openhelpdesk/db";
import { and, arrayContains, eq, not, sql } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Ajouter un domaine de rattachement. Refusés : format invalide, domaines grand
 * public, domaine déjà porté par une autre organisation du tenant (sinon les
 * contacts seraient rattachés de façon ambiguë).
 */
export async function addOrgDomain(formData: FormData) {
  const { tenant } = await requireAgent();
  const organizationId = String(formData.get("organizationId"));
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();

  const isValid =
    DOMAIN_RE.test(domain) &&
    !(PUBLIC_EMAIL_DOMAINS as readonly string[]).includes(domain);

  let taken = false;
  if (isValid) {
    const [other] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.tenantId, tenant.id),
          arrayContains(organizations.emailDomains, [domain]),
        ),
      );
    taken = Boolean(other && other.id !== organizationId);
  }

  if (!isValid || taken) {
    redirect(`/app/organizations?selected=${organizationId}&error=invalid-domain`);
  }

  await db
    .update(organizations)
    .set({
      emailDomains: sql`(
        select array_agg(distinct d) from unnest(${organizations.emailDomains} || ${sql`array[${domain}]::text[]`}) as d
      )`,
    })
    .where(and(eq(organizations.tenantId, tenant.id), eq(organizations.id, organizationId)));

  revalidatePath("/app/organizations");
}

export async function removeOrgDomain(formData: FormData) {
  const { tenant } = await requireAgent();
  const organizationId = String(formData.get("organizationId"));
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();

  await db
    .update(organizations)
    .set({ emailDomains: sql`array_remove(${organizations.emailDomains}, ${domain})` })
    .where(and(eq(organizations.tenantId, tenant.id), eq(organizations.id, organizationId)));

  revalidatePath("/app/organizations");
}

/** « Partage des demandes » (AG-08 / PT-05). */
export async function toggleOrgSharedTickets(formData: FormData) {
  const { tenant } = await requireAgent();
  const organizationId = String(formData.get("organizationId"));
  await db
    .update(organizations)
    .set({ sharedTickets: not(organizations.sharedTickets) })
    .where(and(eq(organizations.tenantId, tenant.id), eq(organizations.id, organizationId)));
  revalidatePath("/app/organizations");
}

/** Onglet Notes du panneau AG-08 — organizations.notes. */
export async function updateOrgNotes(formData: FormData) {
  const { tenant } = await requireAgent();
  const organizationId = String(formData.get("organizationId"));
  const notes = String(formData.get("notes") ?? "").trim();
  await db
    .update(organizations)
    .set({ notes: notes || null })
    .where(and(eq(organizations.tenantId, tenant.id), eq(organizations.id, organizationId)));
  revalidatePath("/app/organizations");
}
