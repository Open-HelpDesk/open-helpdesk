"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, kbArticles, kbCategories } from "@openhelpdesk/db";
import { and, eq, ne } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

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
  const { tenant } = await requireAgent();
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
 * AG-10 — Enregistrer un article.
 * « Brouillon » sur un article publié → draftBodyHtml (badge « MODIFICATIONS NON
 * PUBLIÉES ») ; « Publier » → bodyHtml remplacé et brouillon effacé.
 */
export async function saveArticle(formData: FormData) {
  const { tenant, agent } = await requireAgent();
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
      // Brouillon en cours sur un article publié.
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

  // Slug unique par tenant : suffixe numérique en cas de collision.
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
  const { tenant } = await requireAgent();
  const articleId = String(formData.get("articleId") ?? "");
  if (!articleId) return;
  await db
    .delete(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, articleId)));
  revalidatePath("/app/kb");
  redirect("/app/kb");
}
