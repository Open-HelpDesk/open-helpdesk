"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { people, withTenant } from "@openhelpdesk/db";
import { sendTenantEmail } from "@openhelpdesk/mail";
import { and, ne, sql } from "drizzle-orm";
import { PORTAL_COOKIE, getPortalTenant, magicLinkToken } from "@/lib/portal-auth";
import { getT } from "@/i18n/server";

/**
 * Employee sign-in by magic link (spec 19 §5.3).
 *
 * Unlike the customer portal, no contact is created on the fly: only an
 * address that belongs to a person of the directory receives a link. The
 * answer is the same either way — the page never tells who is an employee.
 */
export async function requestDeskMagicLink(formData: FormData) {
  const tenant = await getPortalTenant();
  if (!tenant) return;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) redirect("/desk/login");
  const sentUrl = `/desk/login?sent=1&e=${encodeURIComponent(email)}`;

  const person = await withTenant(tenant.id, async (tx) => {
    const [p] = await tx
      .select({ contactId: people.contactId, email: people.email })
      .from(people)
      .where(and(sql`lower(${people.email}) = ${email}`, ne(people.status, "departed")));
    return p ?? null;
  });
  if (person) {
    const t = await getT();
    const baseDomain = process.env.BASE_DOMAIN ?? "localhost:3000";
    const protocol = baseDomain.includes("localhost") ? "http" : "https";
    const token = magicLinkToken(tenant.id, person.contactId);
    const url = `${protocol}://${tenant.slug}.${baseDomain}/desk/auth?token=${token}`;
    await sendTenantEmail({
      tenantId: tenant.id,
      to: person.email,
      kind: "magic_link",
      subject: t("desk.portal.login.emailSubject", { workspace: tenant.name }),
      text: t("desk.portal.login.emailBody", { url, workspace: tenant.name }),
    });
  }
  redirect(sentUrl);
}

export async function deskSignOut() {
  const jar = await cookies();
  jar.delete(PORTAL_COOKIE);
  redirect("/desk/login");
}
