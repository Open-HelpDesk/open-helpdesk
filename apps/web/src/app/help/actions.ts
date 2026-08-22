"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  contactOrganizations,
  contacts,
  db,
  kbArticles,
  nextTicketNumber,
  organizations,
  tickets,
  ticketMessages,
} from "@openhelpdesk/db";
import { and, arrayContains, eq, sql } from "drizzle-orm";
import { sendTenantEmail } from "@openhelpdesk/mail";
import { onContactMessage, onTicketCreated } from "@openhelpdesk/rules";
import {
  PORTAL_COOKIE,
  getPortalContact,
  getPortalTenant,
  magicLinkToken,
} from "@/lib/portal-auth";
import { saveUploadedFiles } from "@/lib/storage";

import { getT, type Translate } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/en";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "localhost:3000";
const PROTOCOL = BASE_DOMAIN.includes("localhost") ? "http" : "https";

async function findOrCreateContact(tenantId: string, email: string, name?: string) {
  let [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)));
  if (!contact) {
    [contact] = await db
      .insert(contacts)
      .values({ tenantId, email, name: name || null })
      .returning();
    const domain = email.split("@")[1] ?? "";
    const [org] = domain
      ? await db
          .select()
          .from(organizations)
          .where(
            and(eq(organizations.tenantId, tenantId), arrayContains(organizations.emailDomains, [domain])),
          )
      : [];
    if (contact && org) {
      await db.insert(contactOrganizations).values({
        tenantId,
        contactId: contact.id,
        organizationId: org.id,
      });
    }
  }
  return contact!;
}

/**
 * PT-07 — the sign-in email. Subject and body come from the dictionary: the
 * workspace's language is the customer's language too, and this message used to
 * leave in French whatever the tenant was set to.
 */
async function sendMagicLinkEmail(
  t: Translate,
  tenant: { id: string; slug: string; name: string },
  contact: { id: string; email: string },
  redirectTo: string,
) {
  const token = magicLinkToken(tenant.id, contact.id);
  const url = `${PROTOCOL}://${tenant.slug}.${BASE_DOMAIN}/help/auth?token=${token}&to=${encodeURIComponent(redirectTo)}`;
  await sendTenantEmail({
    tenantId: tenant.id,
    to: contact.email,
    kind: "magic_link",
    subject: t("login.emailSubject", { workspace: tenant.name }),
    text: t("login.emailBody", { url, workspace: tenant.name }),
  });
}

/** PT-07 — magic link dispatch. The account is created implicitly. */
export async function requestMagicLink(formData: FormData) {
  const tenant = await getPortalTenant();
  if (!tenant) return;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return;
  const sentUrl = `/help/login?sent=1&e=${encodeURIComponent(email)}`;
  const contact = await findOrCreateContact(tenant.id, email);
  if (contact.blocked) {
    redirect(sentUrl); // same response — no oracle on blocked accounts
  }
  const t = await getT();
  await sendMagicLinkEmail(t, tenant, contact, "/help/requests");
  redirect(sentUrl);
}

export async function portalSignOut() {
  const jar = await cookies();
  jar.delete(PORTAL_COOKIE);
  redirect("/help");
}

/**
 * PT-04 request types. The form posts a stable key; `tickets.type`
 * receives the label in the tenant's language.
 *
 * It is a free-text field, which agents also edit by hand and which the seed
 * fills with "Incident": writing the key there would display "technical" in
 * the agent workspace. The label is therefore content, just like the subject.
 */
const REQUEST_TYPE_KEYS: Record<string, MessageKey> = {
  technical: "newRequest.typeTechnical",
  billing: "newRequest.typeBilling",
  feature: "newRequest.typeFeature",
};
/** Customer-facing "urgency" → internal priority. */
const URGENCY_TO_PRIORITY: Record<string, "low" | "normal" | "high"> = {
  low: "low",
  normal: "normal",
  high: "high",
};

/** PT-04 — request submission. */
export async function submitRequest(formData: FormData) {
  const tenant = await getPortalTenant();
  if (!tenant) return;
  // Suspended workspace: browsing stays open, creation cut off (banner in the layout).
  if (tenant.status === "suspended" || tenant.status === "deleting") return;
  const session = await getPortalContact();

  const email =
    session?.contact.email ?? String(formData.get("email") ?? "").trim().toLowerCase();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!email || !subject || !body) return;
  const t = await getT();
  const typeKey = REQUEST_TYPE_KEYS[String(formData.get("type") ?? "").trim()];
  const type = typeKey ? t(typeKey) : null;
  const moduleValue = String(formData.get("module") ?? "").trim();
  const priority = URGENCY_TO_PRIORITY[String(formData.get("urgency") ?? "")] ?? "normal";

  const contact = session?.contact ?? (await findOrCreateContact(tenant.id, email));
  if (contact.blocked) redirect("/help/requests/submitted");

  const [orgLink] = await db
    .select({ organizationId: contactOrganizations.organizationId })
    .from(contactOrganizations)
    .where(eq(contactOrganizations.contactId, contact.id))
    .limit(1);

  const number = await nextTicketNumber(tenant.id);
  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId: tenant.id,
      number,
      subject,
      status: "new",
      priority,
      channel: "portal",
      type,
      requesterId: contact.id,
      organizationId: orgLink?.organizationId ?? null,
      customFields: moduleValue ? { module: moduleValue } : {},
    })
    .returning();
  const [message] = await db
    .insert(ticketMessages)
    .values({
      tenantId: tenant.id,
      ticketId: ticket!.id,
      kind: "public_reply",
      authorType: "contact",
      authorId: contact.id,
      bodyText: body,
      source: "portal",
    })
    .returning();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length > 0 && message) {
    await saveUploadedFiles(tenant.id, message.id, files);
  }
  await onTicketCreated(tenant.id, ticket!.id);

  if (!session) {
    // Not signed in: magic link to follow up on the request (PT-04 specs).
    await sendMagicLinkEmail(t, tenant, contact, `/help/requests/${number}`);
  }
  redirect(
    session
      ? `/help/requests/${number}`
      : `/help/requests/submitted?n=${number}&e=${encodeURIComponent(email)}`,
  );
}

/** PT-06 — reply on one's own request (reopens it if resolved, on the engine side). */
export async function replyToRequest(formData: FormData) {
  {
    const tenant = await getPortalTenant();
    if (tenant && (tenant.status === "suspended" || tenant.status === "deleting")) return;
  }
  const session = await getPortalContact();
  if (!session) redirect("/help/login");
  const number = Number(formData.get("number"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body || !Number.isInteger(number)) return;

  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, session.tenant.id), eq(tickets.number, number)));
  if (!ticket || ticket.requesterId !== session.contact.id) return;

  const [message] = await db
    .insert(ticketMessages)
    .values({
      tenantId: session.tenant.id,
      ticketId: ticket.id,
      kind: "public_reply",
      authorType: "contact",
      authorId: session.contact.id,
      bodyText: body,
      source: "portal",
    })
    .returning();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length > 0 && message) {
    await saveUploadedFiles(session.tenant.id, message.id, files);
  }
  const reopen = ["waiting", "on_hold", "resolved"].includes(ticket.status);
  await db
    .update(tickets)
    .set({ updatedAt: new Date(), ...(reopen ? { status: "open", resolvedAt: null } : {}) })
    .where(eq(tickets.id, ticket.id));
  await onContactMessage(session.tenant.id, ticket.id);
  revalidatePath(`/help/requests/${number}`);
}

/** PT-06 — "Mark as resolved" / "Reopen". */
export async function toggleRequestResolved(formData: FormData) {
  const session = await getPortalContact();
  if (!session) redirect("/help/login");
  const number = Number(formData.get("number"));
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, session.tenant.id), eq(tickets.number, number)));
  if (!ticket || ticket.requesterId !== session.contact.id) return;

  if (ticket.status === "resolved") {
    await db
      .update(tickets)
      .set({ status: "open", resolvedAt: null, updatedAt: new Date() })
      .where(eq(tickets.id, ticket.id));
  } else if (ticket.status !== "closed") {
    await db
      .update(tickets)
      .set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(tickets.id, ticket.id));
  }
  revalidatePath(`/help/requests/${number}`);
}

/**
 * PT-03 — "Did this article help you?". The 👎 no longer triggers a redirect:
 * the client-side vote block shows the "Create a pre-filled request" panel.
 */
export async function voteArticle(formData: FormData) {
  const tenant = await getPortalTenant();
  if (!tenant) return;
  const slug = String(formData.get("slug"));
  const vote = formData.get("vote") === "down" ? "down" : "up";
  await db
    .update(kbArticles)
    .set(
      vote === "up"
        ? { votesUp: sql`${kbArticles.votesUp} + 1` }
        : { votesDown: sql`${kbArticles.votesDown} + 1` },
    )
    .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.slug, slug)));
  revalidatePath(`/help/articles/${slug}`);
}
