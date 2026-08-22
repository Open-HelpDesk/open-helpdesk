"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, kbArticles, kbCategories } from "@openhelpdesk/db";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { requireManager } from "@/lib/session";

/**
 * Writing to the knowledge base is restricted to Owner and Admin (AG-10).
 *
 * A published article is public content, served on the customer portal: editing
 * or deleting it puts the tenant's brand on the line. Reading stays open to the
 * whole team — agents quote articles in their replies.
 *
 * Every action re-runs the check. The interface already hides the commands from
 * whoever is not entitled to them, but a server action is a URL: it cannot rely
 * on what the screen displays.
 */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export async function createCategory(formData: FormData) {
  const { tenant } = await requireManager();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await db.insert(kbCategories).values({
    tenantId: tenant.id,
    name,
    slug: slugify(name) || `categorie-${Date.now()}`,
  });
  revalidatePath("/app/kb");
}

/**
 * AG-10 — Save an article.
 * "Draft" on a published article → draftBodyHtml (badge "UNPUBLISHED
 * CHANGES"); "Publish" → bodyHtml replaced and draft cleared.
 */
export async function saveArticle(formData: FormData) {
  const { tenant, agent } = await requireManager();
  const articleId = String(formData.get("articleId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const seoTitle = String(formData.get("seoTitle") ?? "").trim();
  const publish = formData.get("intent") === "publish";
  if (!title || !body || !categoryId) return;

  if (articleId) {
    const [existing] = await db
      .select()
      .from(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, articleId)));
    if (!existing) return;

    let slug = existing.slug;
    if (slugInput) {
      const cleaned = slugify(slugInput.replace(/^\//, ""));
      if (cleaned && cleaned !== existing.slug) {
        const [taken] = await db
          .select({ id: kbArticles.id })
          .from(kbArticles)
          .where(
            and(
              eq(kbArticles.tenantId, tenant.id),
              eq(kbArticles.slug, cleaned),
              ne(kbArticles.id, articleId),
            ),
          );
        if (!taken) slug = cleaned;
      }
    }

    const seo = {
      ...((existing.seo ?? {}) as Record<string, unknown>),
      ...(seoTitle ? { title: seoTitle } : { title: undefined }),
    };

    const patch: Partial<typeof kbArticles.$inferInsert> = {
      title,
      categoryId,
      slug,
      seo,
      updatedAt: new Date(),
    };
    if (publish) {
      patch.bodyHtml = body;
      patch.draftBodyHtml = null;
      patch.status = "published";
      patch.publishedAt = existing.publishedAt ?? new Date();
    } else if (existing.status === "published") {
      // Draft in progress on a published article.
      patch.draftBodyHtml = body;
    } else {
      patch.bodyHtml = body;
    }

    await db
      .update(kbArticles)
      .set(patch)
      .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, articleId)));
    revalidatePath("/app/kb");
    redirect(`/app/kb/${articleId}`);
  }

  // Slug unique per tenant: numeric suffix on collision.
  const base = slugify(slugInput.replace(/^\//, "") || title) || `article-${Date.now()}`;
  let slug = base;
  for (let i = 2; i < 20; i++) {
    const [existing] = await db
      .select({ id: kbArticles.id })
      .from(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.slug, slug)));
    if (!existing) break;
    slug = `${base}-${i}`;
  }

  const [created] = await db
    .insert(kbArticles)
    .values({
      tenantId: tenant.id,
      categoryId,
      title,
      slug,
      bodyHtml: body,
      authorId: agent.id,
      status: publish ? "published" : "draft",
      publishedAt: publish ? new Date() : null,
      seo: seoTitle ? { title: seoTitle } : {},
    })
    .returning({ id: kbArticles.id });
  revalidatePath("/app/kb");
  redirect(`/app/kb/${created!.id}`);
}

export async function deleteArticle(formData: FormData) {
  const { tenant } = await requireManager();
  const articleId = String(formData.get("articleId") ?? "");
  if (!articleId) return;
  await db
    .delete(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, articleId)));
  revalidatePath("/app/kb");
  redirect("/app/kb");
}

/** Renames a category or a section. The slug follows, the id does not move. */
export async function renameCategory(formData: FormData) {
  const { tenant } = await requireManager();
  const id = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  await db
    .update(kbCategories)
    .set({ name, slug: slugify(name) || `categorie-${Date.now()}` })
    .where(and(eq(kbCategories.tenantId, tenant.id), eq(kbCategories.id, id)));
  revalidatePath("/app/kb");
}

/**
 * Deletes a category — only if it is empty.
 *
 * Nothing is deleted in cascade: `kb_articles.category_id` references the
 * category without `ON DELETE`, so a forced deletion would fail on a raw
 * Postgres error. Above all, erasing a category must not carry away published
 * articles nobody asked to pull from the portal. So we refuse, saying what is
 * blocking, and the screen points to the content that has to be moved.
 */
export async function deleteCategory(formData: FormData) {
  const { tenant } = await requireManager();
  const id = String(formData.get("categoryId") ?? "");
  if (!id) return;

  const [articles] = await db
    .select({ n: count() })
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.categoryId, id)));
  const [sections] = await db
    .select({ n: count() })
    .from(kbCategories)
    .where(and(eq(kbCategories.tenantId, tenant.id), eq(kbCategories.parentId, id)));

  const blocking = (articles?.n ?? 0) + (sections?.n ?? 0);
  if (blocking > 0) {
    redirect(`/app/kb?cat=${id}&error=category-not-empty&n=${blocking}`);
  }

  await db
    .delete(kbCategories)
    .where(and(eq(kbCategories.tenantId, tenant.id), eq(kbCategories.id, id)));
  revalidatePath("/app/kb");
  redirect("/app/kb");
}
