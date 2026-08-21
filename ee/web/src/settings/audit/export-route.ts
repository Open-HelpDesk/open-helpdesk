import { NextResponse, type NextRequest } from "next/server";
import { auditEvents, db } from "@openhelpdesk/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { apiAgent } from "@/lib/session";
import { entitlementsFor } from "@/lib/entitlements";
import { getT } from "@/i18n/server";

/** ST-12 — Export CSV du journal d'audit (plan Pro, Owner/Admin). */
export async function GET(request: NextRequest) {
  const t = await getT();
  const current = await apiAgent();
  if (!current) return new NextResponse(t("app.settings.dev.exportUnauthorized"), { status: 401 });
  const { tenant, agent } = current;
  if (agent.role !== "owner" && agent.role !== "admin") {
    return new NextResponse(t("app.settings.dev.exportForbidden"), { status: 403 });
  }
  if (!entitlementsFor(tenant.plan).auditLog) {
    return new NextResponse(t("app.settings.dev.exportProOnly"), { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const daysN = [7, 30, 90].includes(Number(params.get("days"))) ? Number(params.get("days")) : 30;
  const actor = params.get("actor");
  const action = params.get("action");
  const since = new Date(Date.now() - daysN * 24 * 3600 * 1000);

  const filters = [eq(auditEvents.tenantId, tenant.id), gte(auditEvents.createdAt, since)];
  if (actor) filters.push(eq(auditEvents.actorId, actor));
  if (action) filters.push(eq(auditEvents.action, action));

  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(...filters))
    .orderBy(desc(auditEvents.createdAt))
    .limit(5000);

  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [
    ["date", "actor_type", "actor_id", "action", "target_type", "target_id", "ip"].join(";"),
    ...rows.map((e) =>
      [
        e.createdAt.toISOString(),
        e.actorType,
        e.actorId ?? "",
        e.action,
        e.targetType ?? "",
        e.targetId ?? "",
        e.ip ?? "",
      ]
        .map(esc)
        .join(";"),
    ),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-${tenant.slug}-${daysN}j.csv"`,
    },
  });
}
