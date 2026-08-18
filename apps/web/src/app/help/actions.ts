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

import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/fr";

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

async function sendMagicLinkEmail(
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
    subject: `Votre lien de connexion — ${tenant.name}`,
    text:
      `Bonjour,\n\nCliquez sur ce lien pour accéder à vos demandes (valable 15 minutes) :\n` +
      `${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n${tenant.name}`,
  });
}

/** PT-07 — envoi du lien magique. Le compte est créé implicitement. */
export async function requestMagicLink(formData: FormData) {
  const tenant = await getPortalTenant();
  if (!tenant) return;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return;
  const sentUrl = `/help/login?sent=1&e=${encodeURIComponent(email)}`;
  const contact = await findOrCreateContact(tenant.id, email);
  if (contact.blocked) {
    redirect(sentUrl); // même réponse — pas d'oracle sur les comptes bloqués
  }
  await sendMagicLinkEmail(tenant, contact, "/help/requests");
  redirect(sentUrl);
}

export async function portalSignOut() {
  const jar = await cookies();
  jar.delete(PORTAL_COOKIE);
  redirect("/help");
}

/**
 * Types de demande de PT-04. Le formulaire poste une clé stable ; `tickets.type`
 * reçoit le libellé dans la langue du tenant.
 *
 * C'est un champ libre, que les agents éditent aussi à la main et que le seed
 * remplit avec « Incident » : y écrire la clé afficherait « technical » dans
 * l'espace agent. Le libellé y est donc du contenu, au même titre que le sujet.
 */
const REQUEST_TYPE_KEYS: Record<string, MessageKey> = {
  technical: "newRequest.typeTechnical",
  billing: "newRequest.typeBilling",
  feature: "newRequest.typeFeature",
};
/** « Urgence » client → priorité interne. */
const URGENCY_TO_PRIORITY: Record<string, "low" | "normal" | "high"> = {
  low: "low",
  normal: "normal",
  high: "high",
};

/** PT-04 — soumission d'une demande. */
export async function submitRequest(formData: FormData) {
  const tenant = await getPortalTenant();
  if (!tenant) return;
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
    // Non connecté : lien magique de suivi vers la demande (specs PT-04).
    await sendMagicLinkEmail(tenant, contact, `/help/requests/${number}`);
  }
  redirect(
    session
      ? `/help/requests/${number}`
      : `/help/requests/submitted?n=${number}&e=${encodeURIComponent(email)}`,
  );
}

/** PT-06 — répondre sur sa demande (rouvre si résolue, côté moteur). */
export async function replyToRequest(formData: FormData) {
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

/** PT-06 — « Marquer comme résolue » / « Rouvrir ». */
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
 * PT-03 — « Cet article vous a-t-il aidé ? ». Le 👎 n'entraîne plus de redirection :
 * le bloc de vote client affiche le panneau « Créer une demande pré-remplie ».
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
