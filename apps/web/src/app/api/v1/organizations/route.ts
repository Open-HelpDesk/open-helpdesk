/**
 * /api/v1/organizations — list and create.
 *
 * `email_domains` is what attaches a contact to a company automatically at
 * ingestion, so an integration that manages companies elsewhere can keep that
 * mapping in step rather than having agents retype it.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, organizations } from "@openhelpdesk/db";
import {
  apiError,
  apiJson,
  apiList,
  readJson,
  readDomains,
  readPage,
  serializeOrganization,
  withApi,
} from "@/lib/api";


export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const { limit, cursor } = readPage(request);
    const filters = [eq(organizations.tenantId, tenant.id)];
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(organizations.id, cursor));
    }
    const rows = await db
      .select()
      .from(organizations)
      .where(and(...filters))
      .orderBy(asc(organizations.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return apiList(page.map(serializeOrganization), rows.length > limit ? page.at(-1)!.id : null);
  });
}

export async function POST(request: NextRequest) {
  return withApi(request, "write", async ({ tenant }) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;

    const name = String(body.name ?? "").trim();
    if (!name) return apiError(400, "invalid_name", "name is required.");

    const [created] = await db
      .insert(organizations)
      .values({
        tenantId: tenant.id,
        name: name.slice(0, 200),
        emailDomains: readDomains(body.email_domains),
        sharedTickets: body.shared_tickets === true,
        notes: body.notes ? String(body.notes).slice(0, 2000) : null,
        customFields:
          body.custom_fields && typeof body.custom_fields === "object" && !Array.isArray(body.custom_fields)
            ? (body.custom_fields as Record<string, unknown>)
            : {},
      })
      .returning();

    return apiJson(serializeOrganization(created!), 201);
  });
}
