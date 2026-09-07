/**
 * /api/v1/kb/articles — list and create.
 *
 * An article created here lands as a draft unless the caller asks otherwise:
 * publishing puts text in front of customers, and that should be a deliberate
 * act rather than the default of a script.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, kbArticles, kbCategories } from "@openhelpdesk/db";
import {
  apiError,
  apiJson,
  apiList,
  readJson,
  readPage,
  serializeArticle,
  slugify,
  withApi,
} from "@/lib/api";


export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const url = new URL(request.url);
    const { limit, cursor } = readPage(request);
    const filters = [eq(kbArticles.tenantId, tenant.id)];

    const status = url.searchParams.get("status");
    if (status) {
      if (status !== "draft" && status !== "published") {
        return apiError(400, "invalid_status", 'status must be "draft" or "published".');
      }
      filters.push(eq(kbArticles.status, status));
    }
    const category = url.searchParams.get("category_id");
    if (category) filters.push(eq(kbArticles.categoryId, category));
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(kbArticles.id, cursor));
    }

    const rows = await db
      .select()
      .from(kbArticles)
      .where(and(...filters))
      .orderBy(asc(kbArticles.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return apiList(page.map(serializeArticle), rows.length > limit ? page.at(-1)!.id : null);
  });
}

export async function POST(request: NextRequest) {
  return withApi(request, "write", async ({ tenant }) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;

    const title = String(body.title ?? "").trim();
    if (!title) return apiError(400, "invalid_title", "title is required.");
    const categoryId = body.category_id ? String(body.category_id) : null;
    if (!categoryId) return apiError(400, "invalid_category", "category_id is required.");
    const [category] = await db
      .select({ id: kbCategories.id })
      .from(kbCategories)
      .where(and(eq(kbCategories.tenantId, tenant.id), eq(kbCategories.id, categoryId)));
    if (!category) return apiError(400, "invalid_category", "category_id is not a category of this workspace.");

    const status = body.status === "published" ? "published" : "draft";
    const slug = slugify(body.slug ? String(body.slug) : title) || `article-${Date.now()}`;
    const [clash] = await db
      .select({ id: kbArticles.id })
      .from(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.slug, slug)));
    if (clash) return apiError(409, "slug_taken", "Another article already uses that slug.");

    const [created] = await db
      .insert(kbArticles)
      .values({
        tenantId: tenant.id,
        categoryId,
        title: title.slice(0, 300),
        slug,
        bodyHtml: body.body_html ? String(body.body_html) : "",
        status,
        publishedAt: status === "published" ? new Date() : null,
      })
      .returning();
    return apiJson(serializeArticle(created!), 201);
  });
}
