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

/**
 * Session Better Auth + appartenance au workspace courant (app.users, par email).
 * Redirige vers /login sans session ; jette si l'identité n'est pas membre du tenant.
 */
export async function requireAgent(): Promise<CurrentAgent> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect("/login");

  const slug = h.get("x-tenant-slug");
  if (!slug) throw new Error("Tenant non résolu par le middleware.");

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  if (!tenant) redirect("/login");

  const [agent] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, session.user.email)));

  if (!agent || agent.status === "disabled") {
    // Identité valide mais pas membre de CE workspace.
    redirect("/login?error=not-a-member");
  }

  return { tenant, agent, sessionEmail: session.user.email };
}
