"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, kbArticles, kbCategories } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
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

export async function saveArticle(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const articleId = String(formData.get("articleId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const publish = formData.get("intent") === "publish";
  if (!title || !body || !categoryId) return;

  if (articleId) {
    await db
      .update(kbArticles)
      .set({
        title,
        categoryId,
        bodyHtml: body,
        updatedAt: new Date(),
        ...(publish ? { status: "published" as const, publishedAt: new Date() } : {}),
      })
      .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, articleId)));
    revalidatePath("/app/kb");
    redirect(`/app/kb?cat=${categoryId}`);
  }

  // Slug unique par tenant : suffixe numérique en cas de collision.
  const base = slugify(title) || `article-${Date.now()}`;
  let slug = base;
  for (let i = 2; i < 20; i++) {
    const [existing] = await db
      .select({ id: kbArticles.id })
      .from(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.slug, slug)));
    if (!existing) break;
    slug = `${base}-${i}`;
  }

  await db.insert(kbArticles).values({
    tenantId: tenant.id,
    categoryId,
    title,
    slug,
    bodyHtml: body,
    authorId: agent.id,
    status: publish ? "published" : "draft",
    publishedAt: publish ? new Date() : null,
  });
  revalidatePath("/app/kb");
  redirect(`/app/kb?cat=${categoryId}`);
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
