"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db, kbArticles, tickets } from "@openhelpdesk/db";
import { and, eq, sql } from "drizzle-orm";
import {
  PORTAL_COOKIE,
  getPortalContact,
  getPortalTenant,
  sendPortalMagicLink,
} from "@/lib/portal-auth";
import {
  createPortalRequest,
  findOrCreateContact,
  replyToPortalRequest,
} from "@/lib/portal-write";

import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/en";

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
  await sendPortalMagicLink(t, tenant, contact, "/help/requests");
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

  const { ticket } = await createPortalRequest({
    tenantId: tenant.id,
    contact,
    subject,
    body,
    type,
    priority,
    customFields: moduleValue ? { module: moduleValue } : {},
    files: formData.getAll("files").filter((f): f is File => f instanceof File),
  });
  const number = ticket.number;

  if (!session) {
    // Not signed in: magic link to follow up on the request (PT-04 specs).
    await sendPortalMagicLink(t, tenant, contact, `/help/requests/${number}`);
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

  await replyToPortalRequest({
    tenantId: session.tenant.id,
    contact: session.contact,
    ticket,
    body,
    files: formData.getAll("files").filter((f): f is File => f instanceof File),
  });
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
