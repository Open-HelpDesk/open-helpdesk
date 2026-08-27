/**
 * /api/v1/contacts — list and create.
 *
 * A contact is unique by email within a workspace (the same rule ingestion
 * uses), so creating one that already exists returns the existing row rather
 * than a duplicate — idempotent by email.
 */
import type { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { contacts, db } from "@openhelpdesk/db";
import { apiError, apiJson, readJson, serializeContact, withApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.tenantId, tenant.id))
      .orderBy(desc(contacts.createdAt))
      .limit(limit);
    return apiJson({ data: rows.map(serializeContact) });
  });
}

export async function POST(request: NextRequest) {
  return withApi(request, "write", async ({ tenant }) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) return apiError(400, "invalid_email", "email must be a valid address.");
    const name = body.name ? String(body.name).slice(0, 200) : null;
    const phone = body.phone ? String(body.phone).slice(0, 40) : null;

    const [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.email, email)));
    if (existing) return apiJson(serializeContact(existing), 200);

    const [created] = await db
      .insert(contacts)
      .values({ tenantId: tenant.id, email, name, phone })
      .returning();
    return apiJson(serializeContact(created!), 201);
  });
}
