/** Requêtes des écrans Contacts (AG-07), Organisations (AG-08) et recherche (AG-06). */
import {
  contactOrganizations,
  contacts,
  db,
  organizations,
  tickets,
} from "@openhelpdesk/db";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

const OPEN_STATUSES = ["new", "open", "waiting", "on_hold"] as const;

/* ---------- Contacts ---------- */

export async function listContacts(tenantId: string, q?: string) {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      blocked: contacts.blocked,
      ticketCount: count(tickets.id),
      lastTicketAt: sql<string | null>`max(${tickets.createdAt})`,
    })
    .from(contacts)
    .leftJoin(
      tickets,
      and(eq(tickets.requesterId, contacts.id), eq(tickets.tenantId, tenantId)),
    )
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        q ? or(ilike(contacts.name, `%${q}%`), ilike(contacts.email, `%${q}%`)) : undefined,
      ),
    )
    .groupBy(contacts.id)
    .orderBy(asc(contacts.email))
    .limit(50);

  if (rows.length === 0) return rows.map((r) => ({ ...r, organizationName: null as string | null }));

  const ids = rows.map((r) => r.id);
  const orgLinks = await db
    .select({
      contactId: contactOrganizations.contactId,
      organizationName: organizations.name,
    })
    .from(contactOrganizations)
    .innerJoin(organizations, eq(organizations.id, contactOrganizations.organizationId))
    .where(inArray(contactOrganizations.contactId, ids));
  const orgByContact = new Map<string, string>();
  for (const l of orgLinks) if (!orgByContact.has(l.contactId)) orgByContact.set(l.contactId, l.organizationName);

  return rows.map((r) => ({ ...r, organizationName: orgByContact.get(r.id) ?? null }));
}

export async function getContact(tenantId: string, id: string) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, id)));
  if (!contact) return null;

  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(contactOrganizations)
    .innerJoin(organizations, eq(organizations.id, contactOrganizations.organizationId))
    .where(eq(contactOrganizations.contactId, id));

  const contactTickets = await db
    .select({
      number: tickets.number,
      subject: tickets.subject,
      status: tickets.status,
      priority: tickets.priority,
      updatedAt: tickets.updatedAt,
    })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.requesterId, id)))
    .orderBy(desc(tickets.updatedAt))
    .limit(20);

  return { contact, orgs, tickets: contactTickets };
}

/* ---------- Organisations ---------- */

export async function listOrganizations(tenantId: string, q?: string) {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      emailDomains: organizations.emailDomains,
      sharedTickets: organizations.sharedTickets,
      contactCount: sql<number>`count(distinct ${contactOrganizations.contactId})`.mapWith(Number),
      openTickets: sql<number>`count(distinct case when ${tickets.status} in ('new','open','waiting','on_hold') then ${tickets.id} end)`.mapWith(Number),
    })
    .from(organizations)
    .leftJoin(contactOrganizations, eq(contactOrganizations.organizationId, organizations.id))
    .leftJoin(
      tickets,
      and(eq(tickets.organizationId, organizations.id), eq(tickets.tenantId, tenantId)),
    )
    .where(
      and(
        eq(organizations.tenantId, tenantId),
        q ? ilike(organizations.name, `%${q}%`) : undefined,
      ),
    )
    .groupBy(organizations.id)
    .orderBy(asc(organizations.name))
    .limit(50);
}

export async function getOrganization(tenantId: string, id: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.tenantId, tenantId), eq(organizations.id, id)));
  if (!org) return null;

  const members = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      ticketCount: count(tickets.id),
    })
    .from(contactOrganizations)
    .innerJoin(contacts, eq(contacts.id, contactOrganizations.contactId))
    .leftJoin(
      tickets,
      and(eq(tickets.requesterId, contacts.id), eq(tickets.tenantId, tenantId)),
    )
    .where(eq(contactOrganizations.organizationId, id))
    .groupBy(contacts.id)
    .orderBy(asc(contacts.email));

  const orgTickets = await db
    .select({
      number: tickets.number,
      subject: tickets.subject,
      status: tickets.status,
      priority: tickets.priority,
      updatedAt: tickets.updatedAt,
      requesterId: tickets.requesterId,
    })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.organizationId, id)))
    .orderBy(desc(tickets.updatedAt))
    .limit(20);

  return { org, members, tickets: orgTickets };
}

/* ---------- Recherche globale (AG-06) ---------- */

export type SearchResults = {
  tickets: { number: number; subject: string; status: string }[];
  contacts: { id: string; name: string | null; email: string }[];
  organizations: { id: string; name: string }[];
};

/** ILIKE pour cette tranche ; bascule vers Postgres FTS avec la recherche avancée. */
export async function searchAll(tenantId: string, q: string): Promise<SearchResults> {
  const like = `%${q}%`;
  const asNumber = Number(q.replace(/^#/, ""));

  const [ticketRows, contactRows, orgRows] = await Promise.all([
    db
      .select({ number: tickets.number, subject: tickets.subject, status: tickets.status })
      .from(tickets)
      .where(
        and(
          eq(tickets.tenantId, tenantId),
          Number.isInteger(asNumber) && asNumber > 0
            ? or(ilike(tickets.subject, like), eq(tickets.number, asNumber))
            : ilike(tickets.subject, like),
        ),
      )
      .orderBy(desc(tickets.updatedAt))
      .limit(5),
    db
      .select({ id: contacts.id, name: contacts.name, email: contacts.email })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          or(ilike(contacts.name, like), ilike(contacts.email, like)),
        ),
      )
      .limit(5),
    db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(and(eq(organizations.tenantId, tenantId), ilike(organizations.name, like)))
      .limit(5),
  ]);

  return { tickets: ticketRows, contacts: contactRows, organizations: orgRows };
}
