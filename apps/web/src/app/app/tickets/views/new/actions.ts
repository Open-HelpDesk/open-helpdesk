"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { db, views } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { canDeleteView, countViewMatches, sanitizeViewConditions } from "@/lib/data";
import { INBOX_SORTS, type InboxSort } from "@/lib/format";

/**
 * newview — creating a saved view.
 *
 * The conditions arrive as JSON from the client form, so every one of them is
 * re-read here against the same whitelist the reader applies: a field or a value
 * the reader would ignore must not reach the row, or the view would promise a
 * filter it does not have.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Preview count for the builder — called from the client as the form changes. */
export async function previewViewCount(raw: unknown): Promise<number> {
  const { tenant } = await requireAgent();
  return countViewMatches(tenant.id, sanitizeViewConditions(raw));
}

export async function createView(formData: FormData) {
  const { tenant, agent } = await requireAgent();

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const shared = formData.get("shared") === "team" ? "team" : "private";
  const sortRaw = String(formData.get("sort") ?? "");
  const sort: InboxSort | null = (INBOX_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as InboxSort)
    : null;

  let parsed: unknown = [];
  try {
    parsed = JSON.parse(String(formData.get("conditions") ?? "[]"));
  } catch {
    parsed = [];
  }
  const conditions = sanitizeViewConditions(parsed);

  if (!name) redirect("/app/tickets/views/new?error=name");

  // Appended at the end of the rail rather than at the top: the views an agent
  // already knows keep their place.
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(views)
    .where(eq(views.tenantId, tenant.id));

  const [created] = await db
    .insert(views)
    .values({
      tenantId: tenant.id,
      name,
      ownerId: agent.id,
      shared,
      conditions,
      sort: sort ? { key: sort } : {},
      position: n,
    })
    .returning({ id: views.id });

  revalidatePath("/app/tickets");
  redirect(created ? `/app/tickets?tv=${created.id}` : "/app/tickets");
}

/** Deletes a saved view — its owner, or any manager for a shared one. */
export async function deleteView(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const id = String(formData.get("viewId") ?? "");
  if (!UUID.test(id)) redirect("/app/tickets");

  const [view] = await db
    .select({ ownerId: views.ownerId, shared: views.shared })
    .from(views)
    .where(and(eq(views.tenantId, tenant.id), eq(views.id, id)));
  if (!view) redirect("/app/tickets");

  if (!canDeleteView(view, agent)) redirect("/app/tickets");

  await db.delete(views).where(and(eq(views.tenantId, tenant.id), eq(views.id, id)));
  revalidatePath("/app/tickets");
  redirect("/app/tickets");
}
