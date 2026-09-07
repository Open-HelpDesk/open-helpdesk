/**
 * /api/v1/kb/articles/{id} — read, update, delete.
 *
 * Moving an article to `published` stamps `published_at` once: a second
 * publish must not rewrite the date the customers first saw it.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, kbArticles, kbCategories } from "@openhelpdesk/db";
import { apiError, apiJson, readJson, serializeArticle, slugify, withApi } from "@/lib/api";

async function load(tenantId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db
    .select()
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.id, id)));
  return row ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "read", async ({ tenant }) => {
    const { id } = await params;
    const row = await load(tenant.id, id);
    if (!row) return apiError(404, "not_found", "No article with that id.");
    return apiJson(serializeArticle(row));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "write", async ({ tenant }) => {
    const { id } = await params;
    const row = await load(tenant.id, id);
    if (!row) return apiError(404, "not_found", "No article with that id.");

    const body = await readJson(request);
    if (body instanceof Response) return body;

    const patch: Partial<typeof kbArticles.$inferInsert> = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return apiError(400, "invalid_title", "title cannot be empty.");
      patch.title = title.slice(0, 300);
    }
    if (body.body_html !== undefined) patch.bodyHtml = String(body.body_html);
    if (body.category_id !== undefined) {
      const categoryId = String(body.category_id);
      const [category] = await db
        .select({ id: kbCategories.id })
        .from(kbCategories)
        .where(and(eq(kbCategories.tenantId, tenant.id), eq(kbCategories.id, categoryId)));
      if (!category) {
        return apiError(400, "invalid_category", "category_id is not a category of this workspace.");
      }
      patch.categoryId = categoryId;
    }
    if (body.slug !== undefined) {
      const slug = slugify(String(body.slug));
      if (!slug) return apiError(400, "invalid_slug", "slug cannot be empty.");
      if (slug !== row.slug) {
        const [clash] = await db
          .select({ id: kbArticles.id })
          .from(kbArticles)
          .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.slug, slug)));
        if (clash) return apiError(409, "slug_taken", "Another article already uses that slug.");
      }
      patch.slug = slug;
    }
    if (body.status !== undefined) {
      const status = String(body.status);
      if (status !== "draft" && status !== "published") {
        return apiError(400, "invalid_status", 'status must be "draft" or "published".');
      }
      patch.status = status;
      // Stamped once, on the first publication only.
      if (status === "published" && !row.publishedAt) patch.publishedAt = new Date();
    }
    if (Object.keys(patch).length === 0) return apiJson(serializeArticle(row));
    patch.updatedAt = new Date();

    const [updated] = await db
      .update(kbArticles)
      .set(patch)
      .where(eq(kbArticles.id, row.id))
      .returning();
    return apiJson(serializeArticle(updated!));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "write", async ({ tenant }) => {
    const { id } = await params;
    const row = await load(tenant.id, id);
    if (!row) return apiError(404, "not_found", "No article with that id.");
    await db.delete(kbArticles).where(eq(kbArticles.id, row.id));
    return new Response(null, { status: 204 });
  });
}
