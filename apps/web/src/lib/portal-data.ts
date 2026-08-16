/** Requêtes du portail client (PT) et de la KB publique. */
import {
  attachments,
  contactOrganizations,
  db,
  kbArticles,
  kbCategories,
  organizations,
  tickets,
  ticketMessages,
} from "@openhelpdesk/db";
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";

/** Libellés client — jamais le vocabulaire interne (PT-05). */
export const PORTAL_STATUS_LABELS: Record<string, string> = {
  new: "En cours",
  open: "En cours",
  waiting: "En attente de votre réponse",
  on_hold: "En cours",
  resolved: "Résolue",
  closed: "Clôturée",
};

export async function listPublishedCategories(tenantId: string) {
  const categories = await db
    .select()
    .from(kbCategories)
    .where(and(eq(kbCategories.tenantId, tenantId), isNull(kbCategories.parentId)))
    .orderBy(asc(kbCategories.position), asc(kbCategories.name));
  const counts = await db
    .select({ categoryId: kbArticles.categoryId, n: count() })
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.status, "published")))
    .groupBy(kbArticles.categoryId);
  const countByCategory = new Map(counts.map((c) => [c.categoryId, c.n]));
  return categories.map((c) => ({ ...c, articleCount: countByCategory.get(c.id) ?? 0 }));
}

export async function getCategoryWithArticles(tenantId: string, slug: string) {
  const [category] = await db
    .select()
    .from(kbCategories)
    .where(and(eq(kbCategories.tenantId, tenantId), eq(kbCategories.slug, slug)));
  if (!category) return null;
  const articles = await db
    .select({
      title: kbArticles.title,
      slug: kbArticles.slug,
      bodyHtml: kbArticles.bodyHtml,
    })
    .from(kbArticles)
    .where(
      and(
        eq(kbArticles.tenantId, tenantId),
        eq(kbArticles.categoryId, category.id),
        eq(kbArticles.status, "published"),
      ),
    )
    .orderBy(asc(kbArticles.title));
  return { category, articles };
}

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
        .limit(4)
    : [];
  return { article, related };
}

export async function searchArticles(tenantId: string, q: string, limit = 8) {
  // Chaque terme doit apparaître (titre ou corps) — bascule vers Postgres FTS ensuite.
  const terms = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 6);
  if (terms.length === 0) return [];
  return db
    .select({ title: kbArticles.title, slug: kbArticles.slug })
    .from(kbArticles)
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
}

export async function popularArticles(tenantId: string, limit = 6) {
  return db
    .select({ title: kbArticles.title, slug: kbArticles.slug, viewCount: kbArticles.viewCount })
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.status, "published")))
    .orderBy(desc(kbArticles.viewCount), asc(kbArticles.title))
    .limit(limit);
}

/** Demandes du contact + celles de son organisation si le partage est accordé (PT-05). */
export async function listContactRequests(tenantId: string, contactId: string, scope: "mine" | "organization") {
  if (scope === "mine") {
    return db
      .select({
        number: tickets.number,
        subject: tickets.subject,
        status: tickets.status,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(
        and(eq(tickets.tenantId, tenantId), eq(tickets.requesterId, contactId), isNull(tickets.deletedAt)),
      )
      .orderBy(desc(tickets.updatedAt))
      .limit(50);
  }
  // Organisations du contact avec partage activé
  const orgs = await db
    .select({ id: organizations.id })
    .from(contactOrganizations)
    .innerJoin(organizations, eq(organizations.id, contactOrganizations.organizationId))
    .where(and(eq(contactOrganizations.contactId, contactId), eq(organizations.sharedTickets, true)));
  if (orgs.length === 0) return [];
  return db
    .select({
      number: tickets.number,
      subject: tickets.subject,
      status: tickets.status,
      updatedAt: tickets.updatedAt,
    })
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

  return { ticket, messages, attachmentsByMessage };
}
