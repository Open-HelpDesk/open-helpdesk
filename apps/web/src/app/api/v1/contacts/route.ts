/**
 * /api/v1/contacts — list and create.
 *
 * A contact is unique by email within a workspace (the same rule ingestion
 * uses), so creating one that already exists returns the existing row rather
 * than a duplicate — idempotent by email.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { contacts, db } from "@openhelpdesk/db";
import {
  apiError,
  apiJson,
  apiList,
  readJson,
  readPage,
  serializeContact,
  withApi,
} from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const url = new URL(request.url);
    const { limit, cursor } = readPage(request);
    const filters = [eq(contacts.tenantId, tenant.id)];

    // Looking someone up by address is the commonest reason to call this at all.
    const email = url.searchParams.get("email");
    if (email) filters.push(eq(contacts.email, email.trim().toLowerCase()));

    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(contacts.id, cursor));
    }

    const rows = await db
      .select()
      .from(contacts)
      .where(and(...filters))
      .orderBy(asc(contacts.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return apiList(page.map(serializeContact), rows.length > limit ? page.at(-1)!.id : null);
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
