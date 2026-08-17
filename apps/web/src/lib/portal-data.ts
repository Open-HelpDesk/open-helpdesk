/** Requêtes du portail client (PT) et de la KB publique. */
import {
  attachments,
  contactOrganizations,
  contacts,
  db,
  kbArticles,
  kbCategories,
  organizations,
  orgAdminGrants,
  orgSsoConnections,
  tickets,
  ticketFields,
  ticketMessages,
  users,
  verifiedDomains,
} from "@openhelpdesk/db";
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/** Libellés client — jamais le vocabulaire interne (PT-05). */
export const PORTAL_STATUS_LABELS: Record<string, string> = {
  new: "En cours",
  open: "En cours",
  waiting: "En attente de votre réponse",
  on_hold: "En cours",
  resolved: "Résolue",
  closed: "Fermée",
};

/* ---------- KB (PT-01/02/03) ---------- */

/** Catégories racines avec compteur d'articles (sections incluses). */
export async function listPublishedCategories(tenantId: string) {
  const all = await db
    .select()
    .from(kbCategories)
    .where(eq(kbCategories.tenantId, tenantId))
    .orderBy(asc(kbCategories.position), asc(kbCategories.name));
  const counts = await db
    .select({ categoryId: kbArticles.categoryId, n: count() })
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.status, "published")))
    .groupBy(kbArticles.categoryId);

  // Les articles d'une section comptent pour sa catégorie racine.
  const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
  const totals = new Map<string, number>();
  for (const c of counts) {
    if (!c.categoryId) continue;
    const root = parentOf.get(c.categoryId) ?? c.categoryId;
    totals.set(root, (totals.get(root) ?? 0) + c.n);
  }
  return all
    .filter((c) => !c.parentId)
    .map((c) => ({ ...c, articleCount: totals.get(c.id) ?? 0 }));
}

/** PT-02 — catégorie + sections (accordéons) + articles + autres catégories (sidebar). */
export async function getCategoryWithSections(tenantId: string, slug: string) {
  const all = await db
    .select()
    .from(kbCategories)
    .where(eq(kbCategories.tenantId, tenantId))
    .orderBy(asc(kbCategories.position), asc(kbCategories.name));
  const category = all.find((c) => c.slug === slug && !c.parentId);
  if (!category) return null;
  const sections = all.filter((c) => c.parentId === category.id);
  const ids = [category.id, ...sections.map((s) => s.id)];
  const articles = await db
    .select({
      title: kbArticles.title,
      slug: kbArticles.slug,
      bodyHtml: kbArticles.bodyHtml,
      categoryId: kbArticles.categoryId,
    })
    .from(kbArticles)
    .where(
      and(
        eq(kbArticles.tenantId, tenantId),
        inArray(kbArticles.categoryId, ids),
        eq(kbArticles.status, "published"),
      ),
    )
    .orderBy(asc(kbArticles.title));
  return {
    category,
    sections: sections.map((s) => ({
      ...s,
      articles: articles.filter((a) => a.categoryId === s.id),
    })),
    directArticles: articles.filter((a) => a.categoryId === category.id),
    allCategories: all.filter((c) => !c.parentId),
  };
}

/** PT-03 — article publié + fil d'Ariane (racine/section) + articles liés. */
export async function getPublishedArticle(tenantId: string, slug: string) {
  const [article] = await db
    .select()
    .from(kbArticles)
    .where(
      and(
        eq(kbArticles.tenantId, tenantId),
        eq(kbArticles.slug, slug),
        eq(kbArticles.status, "published"),
      ),
    );
  if (!article) return null;

  let section: typeof kbCategories.$inferSelect | null = null;
  let root: typeof kbCategories.$inferSelect | null = null;
  if (article.categoryId) {
    const [cat] = await db
      .select()
      .from(kbCategories)
      .where(and(eq(kbCategories.tenantId, tenantId), eq(kbCategories.id, article.categoryId)));
    if (cat?.parentId) {
      section = cat;
      const [parent] = await db
        .select()
        .from(kbCategories)
        .where(and(eq(kbCategories.tenantId, tenantId), eq(kbCategories.id, cat.parentId)));
      root = parent ?? null;
    } else {
      root = cat ?? null;
    }
  }

  const related = article.categoryId
    ? await db
        .select({ title: kbArticles.title, slug: kbArticles.slug })
        .from(kbArticles)
        .where(
          and(
            eq(kbArticles.tenantId, tenantId),
            eq(kbArticles.categoryId, article.categoryId),
            eq(kbArticles.status, "published"),
            ne(kbArticles.id, article.id),
          ),
        )
        .limit(3)
    : [];
  return { article, related, section, root };
}

/** Recherche plein-texte simple avec catégorie racine (typeahead PT-01, déflexion PT-04). */
export async function searchArticles(tenantId: string, q: string, limit = 8) {
  // Chaque terme doit apparaître (titre ou corps) — bascule vers Postgres FTS ensuite.
  const terms = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 6);
  if (terms.length === 0) return [];
  const parent = alias(kbCategories, "parent");
  const rows = await db
    .select({
      title: kbArticles.title,
      slug: kbArticles.slug,
      categoryName: kbCategories.name,
      parentName: parent.name,
    })
    .from(kbArticles)
    .leftJoin(kbCategories, eq(kbCategories.id, kbArticles.categoryId))
    .leftJoin(parent, eq(parent.id, kbCategories.parentId))
    .where(
      and(
        eq(kbArticles.tenantId, tenantId),
        eq(kbArticles.status, "published"),
        ...terms.map((t) =>
          or(ilike(kbArticles.title, `%${t}%`), ilike(kbArticles.bodyHtml, `%${t}%`)),
        ),
      ),
    )
    .limit(limit);
  return rows.map((r) => ({
    title: r.title,
    slug: r.slug,
    category: r.parentName ?? r.categoryName ?? null,
  }));
}

export async function popularArticles(tenantId: string, limit = 5) {
  return db
    .select({ title: kbArticles.title, slug: kbArticles.slug, viewCount: kbArticles.viewCount })
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.status, "published")))
    .orderBy(desc(kbArticles.viewCount), asc(kbArticles.title))
    .limit(limit);
}

/** Options réelles du champ « Module concerné » (ticketFields key=module) — PT-04. */
export async function getModuleOptions(tenantId: string): Promise<string[]> {
  const [field] = await db
    .select({ options: ticketFields.options })
    .from(ticketFields)
    .where(and(eq(ticketFields.tenantId, tenantId), eq(ticketFields.key, "module")));
  return Array.isArray(field?.options)
    ? (field.options as unknown[]).filter((o): o is string => typeof o === "string")
    : [];
}

/* ---------- Demandes (PT-05/06) ---------- */

export type PortalRequestRow = {
  number: number;
  subject: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  lastMessage: { authorType: string; authorName: string | null; createdAt: Date } | null;
  messageCount: number;
};

/** Demandes du contact + celles de son organisation si le partage est accordé (PT-05). */
export async function listContactRequests(
  tenantId: string,
  contactId: string,
  scope: "mine" | "organization",
): Promise<PortalRequestRow[]> {
  let rows: {
    id: string;
    number: number;
    subject: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
    closedAt: Date | null;
  }[] = [];
  const cols = {
    id: tickets.id,
    number: tickets.number,
    subject: tickets.subject,
    status: tickets.status,
    createdAt: tickets.createdAt,
    updatedAt: tickets.updatedAt,
    resolvedAt: tickets.resolvedAt,
    closedAt: tickets.closedAt,
  };
  if (scope === "mine") {
    rows = await db
      .select(cols)
      .from(tickets)
      .where(
        and(eq(tickets.tenantId, tenantId), eq(tickets.requesterId, contactId), isNull(tickets.deletedAt)),
      )
      .orderBy(desc(tickets.updatedAt))
      .limit(50);
  } else {
    // Organisations du contact avec partage activé
    const orgs = await db
      .select({ id: organizations.id })
      .from(contactOrganizations)
      .innerJoin(organizations, eq(organizations.id, contactOrganizations.organizationId))
      .where(and(eq(contactOrganizations.contactId, contactId), eq(organizations.sharedTickets, true)));
    if (orgs.length === 0) return [];
    rows = await db
      .select(cols)
      .from(tickets)
      .where(
        and(
          eq(tickets.tenantId, tenantId),
          inArray(tickets.organizationId, orgs.map((o) => o.id)),
          isNull(tickets.deletedAt),
        ),
      )
      .orderBy(desc(tickets.updatedAt))
      .limit(50);
  }
  if (rows.length === 0) return [];

  // Dernier message public par demande + auteur (« Réponse de Marie il y a 3 h »).
  const messages = await db
    .select({
      ticketId: ticketMessages.ticketId,
      authorType: ticketMessages.authorType,
      authorId: ticketMessages.authorId,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .where(
      and(
        eq(ticketMessages.tenantId, tenantId),
        inArray(ticketMessages.ticketId, rows.map((r) => r.id)),
        eq(ticketMessages.kind, "public_reply"),
      ),
    )
    .orderBy(desc(ticketMessages.createdAt));
  const lastByTicket = new Map<string, (typeof messages)[number]>();
  const countByTicket = new Map<string, number>();
  for (const m of messages) {
    countByTicket.set(m.ticketId, (countByTicket.get(m.ticketId) ?? 0) + 1);
    if (!lastByTicket.has(m.ticketId)) lastByTicket.set(m.ticketId, m);
  }
  const agentIds = [
    ...new Set(
      messages.filter((m) => m.authorType === "agent" && m.authorId).map((m) => m.authorId!),
    ),
  ];
  const agents = agentIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, agentIds)))
    : [];
  const agentName = new Map(agents.map((a) => [a.id, a.name]));

  return rows.map(({ id, ...r }) => {
    const last = lastByTicket.get(id) ?? null;
    return {
      ...r,
      lastMessage: last
        ? {
            authorType: last.authorType,
            authorName:
              last.authorType === "agent" && last.authorId
                ? (agentName.get(last.authorId) ?? null)
                : null,
            createdAt: last.createdAt,
          }
        : null,
      messageCount: countByTicket.get(id) ?? 0,
    };
  });
}

/** Le contact a-t-il accès à l'onglet organisation ? */
export async function hasSharedOrganization(contactId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(contactOrganizations)
    .innerJoin(organizations, eq(organizations.id, contactOrganizations.organizationId))
    .where(and(eq(contactOrganizations.contactId, contactId), eq(organizations.sharedTickets, true)))
    .limit(1);
  return Boolean(row);
}

/** Détail d'une demande — messages PUBLICS uniquement, jamais les notes internes (PT-06). */
export async function getContactRequest(tenantId: string, contactId: string, number: number) {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.number, number), isNull(tickets.deletedAt)));
  if (!ticket) return null;

  // Accès : demandeur, ou membre d'une organisation partagée propriétaire du ticket.
  let allowed = ticket.requesterId === contactId;
  if (!allowed && ticket.organizationId) {
    const [link] = await db
      .select({ id: organizations.id })
      .from(contactOrganizations)
      .innerJoin(organizations, eq(organizations.id, contactOrganizations.organizationId))
      .where(
        and(
          eq(contactOrganizations.contactId, contactId),
          eq(organizations.id, ticket.organizationId),
          eq(organizations.sharedTickets, true),
        ),
      );
    allowed = Boolean(link);
  }
  if (!allowed) return null;

  const messages = await db
    .select()
    .from(ticketMessages)
    .where(
      and(
        eq(ticketMessages.tenantId, tenantId),
        eq(ticketMessages.ticketId, ticket.id),
        eq(ticketMessages.kind, "public_reply"),
      ),
    )
    .orderBy(asc(ticketMessages.createdAt));

  const attachmentRows =
    messages.length > 0
      ? await db
          .select({
            id: attachments.id,
            messageId: attachments.messageId,
            filename: attachments.filename,
            sizeBytes: attachments.sizeBytes,
          })
          .from(attachments)
          .where(
            and(
              eq(attachments.tenantId, tenantId),
              inArray(attachments.messageId, messages.map((m) => m.id)),
            ),
          )
      : [];
  const attachmentsByMessage = new Map<string, typeof attachmentRows>();
  for (const a of attachmentRows) {
    if (!a.messageId) continue;
    attachmentsByMessage.set(a.messageId, [...(attachmentsByMessage.get(a.messageId) ?? []), a]);
  }

  // Noms des agents du fil (« Marie — Acme Support ») + demandeur (vue organisation).
  const agentIds = [
    ...new Set(
      messages.filter((m) => m.authorType === "agent" && m.authorId).map((m) => m.authorId!),
    ),
  ];
  const agents = agentIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, agentIds)))
    : [];
  const agentsById = new Map(agents.map((a) => [a.id, a.name]));
  const [requester] = await db
    .select({ id: contacts.id, name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, ticket.requesterId)));

  return { ticket, messages, attachmentsByMessage, agentsById, requester: requester ?? null };
}

/* ---------- Administration d'organisation (PT-08) ---------- */

/** Organisation dont le contact est administrateur (orgAdminGrant), ou null. */
export async function getOrgAdminOrg(tenantId: string, contactId: string) {
  const [row] = await db
    .select({ org: organizations })
    .from(orgAdminGrants)
    .innerJoin(organizations, eq(organizations.id, orgAdminGrants.organizationId))
    .where(and(eq(orgAdminGrants.tenantId, tenantId), eq(orgAdminGrants.contactId, contactId)))
    .limit(1);
  return row?.org ?? null;
}

export type OrgMemberRow = {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  requestCount: number;
};

/** Collaborateurs de l'organisation, grants admin et nombre de demandes réels. */
export async function listOrgMembers(tenantId: string, organizationId: string): Promise<OrgMemberRow[]> {
  const members = await db
    .select({ id: contacts.id, name: contacts.name, email: contacts.email })
    .from(contactOrganizations)
    .innerJoin(contacts, eq(contacts.id, contactOrganizations.contactId))
    .where(
      and(
        eq(contactOrganizations.tenantId, tenantId),
        eq(contactOrganizations.organizationId, organizationId),
      ),
    )
    .orderBy(asc(contacts.name), asc(contacts.email));
  if (members.length === 0) return [];

  const grants = await db
    .select({ contactId: orgAdminGrants.contactId })
    .from(orgAdminGrants)
    .where(
      and(eq(orgAdminGrants.tenantId, tenantId), eq(orgAdminGrants.organizationId, organizationId)),
    );
  const adminIds = new Set(grants.map((g) => g.contactId));

  const counts = await db
    .select({ requesterId: tickets.requesterId, n: count() })
    .from(tickets)
    .where(
      and(
        eq(tickets.tenantId, tenantId),
        inArray(tickets.requesterId, members.map((m) => m.id)),
        isNull(tickets.deletedAt),
      ),
    )
    .groupBy(tickets.requesterId);
  const countByContact = new Map(counts.map((c) => [c.requesterId, c.n]));

  return members.map((m) => ({
    ...m,
    isAdmin: adminIds.has(m.id),
    requestCount: countByContact.get(m.id) ?? 0,
  }));
}

/** Domaines déclarés de l'organisation (vérifiés ou en attente). */
export async function listOrgDomains(tenantId: string, organizationId: string) {
  return db
    .select()
    .from(verifiedDomains)
    .where(
      and(eq(verifiedDomains.tenantId, tenantId), eq(verifiedDomains.organizationId, organizationId)),
    )
    .orderBy(asc(verifiedDomains.createdAt));
}

/** Connexion SSO de l'organisation (au plus une). */
export async function getOrgSsoConnection(tenantId: string, organizationId: string) {
  const [row] = await db
    .select()
    .from(orgSsoConnections)
    .where(
      and(
        eq(orgSsoConnections.tenantId, tenantId),
        eq(orgSsoConnections.organizationId, organizationId),
      ),
    );
  return row ?? null;
}
