"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, kbArticles, kbCategories } from "@openhelpdesk/db";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { requireManager } from "@/lib/session";

/**
 * Écrire dans la base de connaissances est réservé à Owner et Admin (AG-10).
 *
 * Un article publié est du contenu public, servi sur le portail client : le
 * modifier ou le supprimer engage la marque du tenant. Consulter reste ouvert à
 * toute l'équipe — les agents citent les articles dans leurs réponses.
 *
 * Chaque action refait le contrôle. L'interface masque déjà les commandes à qui
 * n'y a pas droit, mais une server action est une URL : elle ne peut pas
 * s'appuyer sur ce que l'écran affiche.
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
 * AG-10 — Enregistrer un article.
 * « Brouillon » sur un article publié → draftBodyHtml (badge « MODIFICATIONS NON
 * PUBLIÉES ») ; « Publier » → bodyHtml remplacé et brouillon effacé.
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
  const { tenant } = await requireManager();
  const articleId = String(formData.get("articleId") ?? "");
  if (!articleId) return;
  await db
    .delete(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, articleId)));
  revalidatePath("/app/kb");
  redirect("/app/kb");
}

/** Renomme une catégorie ou une section. Le slug suit, l'identifiant ne bouge pas. */
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
 * Supprime une catégorie — seulement si elle est vide.
 *
 * Rien n'est supprimé en cascade : `kb_articles.category_id` référence la
 * catégorie sans `ON DELETE`, si bien qu'une suppression forcée échouerait sur
 * une erreur Postgres brute. Surtout, effacer une catégorie ne doit pas emporter
 * des articles publiés que personne n'a demandé à retirer du portail. On refuse
 * donc en disant ce qui bloque, et l'écran renvoie vers le contenu à déplacer.
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
    redirect(`/app/kb?cat=${id}&erreur=categorie-non-vide&n=${blocking}`);
  }

  await db
    .delete(kbCategories)
    .where(and(eq(kbCategories.tenantId, tenant.id), eq(kbCategories.id, id)));
  revalidatePath("/app/kb");
  redirect("/app/kb");
}
