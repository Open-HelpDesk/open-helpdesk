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
  if (!slug) throw new Error("Tenant non résolu par le middleware.");

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  if (!tenant) return { status: "anonymous" };

  const [agent] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, session.user.email)));

  if (!agent || agent.status === "disabled") return { status: "not-member" };

  return { status: "ok", value: { tenant, agent, sessionEmail: session.user.email } };
}

/** Pages : session + appartenance au workspace, sinon redirection vers /login. */
export async function requireAgent(): Promise<CurrentAgent> {
  const res = await resolveAgent();
  if (res.status === "anonymous") redirect("/login");
  if (res.status === "not-member") redirect("/login?error=not-a-member");
  return res.value;
}

/** Routes API : même résolution, mais null (→ 401) au lieu d'une redirection. */
export async function apiAgent(): Promise<CurrentAgent | null> {
  const res = await resolveAgent();
  return res.status === "ok" ? res.value : null;
}
