/**
 * Soumission du widget (ST-09) — multipart : email, subject, body, files.
 * Crée contact + ticket (canal widget) + message + pièces jointes, déclenche
 * triggers et SLA, puis redirige vers la confirmation de l'iframe.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  contactOrganizations,
  contacts,
  db,
  nextTicketNumber,
  organizations,
  tickets,
  ticketMessages,
} from "@openhelpdesk/db";
import { and, arrayContains, eq } from "drizzle-orm";
import { onTicketCreated } from "@openhelpdesk/rules";
import { getPortalTenant } from "@/lib/portal-auth";
import { saveUploadedFiles } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const tenant = await getPortalTenant();
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!email.includes("@") || !subject || !body) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 422 });
  }

  let [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.email, email)));
  if (contact?.blocked) {
    // Même réponse que le succès — pas d'oracle.
    return NextResponse.redirect(new URL("/widget?sent=1", request.url), 303);
  }
  const domain = email.split("@")[1] ?? "";
  const [org] = domain
    ? await db
        .select()
        .from(organizations)
        .where(
          and(eq(organizations.tenantId, tenant.id), arrayContains(organizations.emailDomains, [domain])),
        )
    : [];
  if (!contact) {
    [contact] = await db.insert(contacts).values({ tenantId: tenant.id, email }).returning();
    if (contact && org) {
      await db.insert(contactOrganizations).values({
        tenantId: tenant.id,
        contactId: contact.id,
        organizationId: org.id,
      });
    }
  }

  const number = await nextTicketNumber(tenant.id);
  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId: tenant.id,
      number,
      subject,
      status: "new",
      channel: "widget",
      requesterId: contact!.id,
      organizationId: org?.id ?? null,
    })
    .returning();
  const [message] = await db
    .insert(ticketMessages)
    .values({
      tenantId: tenant.id,
      ticketId: ticket!.id,
      kind: "public_reply",
      authorType: "contact",
      authorId: contact!.id,
      bodyText: body,
      source: "widget",
    })
    .returning();

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length > 0 && message) {
    await saveUploadedFiles(tenant.id, message.id, files);
  }

  await onTicketCreated(tenant.id, ticket!.id);
  return NextResponse.redirect(new URL("/widget?sent=1", request.url), 303);
}
