import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@openhelpdesk/auth";
import { db, tenants, users } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";

export type CurrentAgent = {
  tenant: typeof tenants.$inferSelect;
  agent: typeof users.$inferSelect;
  sessionEmail: string;
};

type Resolution =
  | { status: "ok"; value: CurrentAgent }
  | { status: "anonymous" }
  | { status: "not-member" };

async function resolveAgent(): Promise<Resolution> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) return { status: "anonymous" };

  const slug = h.get("x-tenant-slug");
  if (!slug) throw new Error("Tenant not resolved by the middleware.");

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  if (!tenant) return { status: "anonymous" };

  const [agent] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, session.user.email)));

  if (!agent || agent.status === "disabled") return { status: "not-member" };

  return { status: "ok", value: { tenant, agent, sessionEmail: session.user.email } };
}

/** Pages: session + workspace membership, otherwise a redirect to /login. */
export async function requireAgent(): Promise<CurrentAgent> {
  const res = await resolveAgent();
  if (res.status === "anonymous") redirect("/login");
  if (res.status === "not-member") redirect("/login?error=not-a-member");
  return res.value;
}

/** API routes: same resolution, but null (→ 401) instead of a redirect. */
export async function apiAgent(): Promise<CurrentAgent | null> {
  const res = await resolveAgent();
  return res.status === "ok" ? res.value : null;
}

/**
 * Does the role carry workspace management?
 *
 * Owner and Admin, not Agent nor Viewer. The owner is above the administrator:
 * excluding them from what an administrator can do would make no sense. This is
 * the boundary the settings screens already use and, since this change, writing
 * in the knowledge base.
 */
export function isManager(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Guard for the management server actions. It THROWS rather than redirecting: an
 * action called by a role that has no right to it is an attempt, not a
 * navigation, and must fail loudly.
 */
export async function requireManager(): Promise<CurrentAgent> {
  const current = await requireAgent();
  if (!isManager(current.agent.role)) {
    const { getT } = await import("@/i18n/server");
    const t = await getT();
    throw new Error(t("app.settings.shell.managerOnly"));
  }
  return current;
}
