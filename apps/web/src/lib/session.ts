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

/**
 * Le rôle porte-t-il la gestion de l'espace de travail ?
 *
 * Owner et Admin, pas Agent ni Viewer. Le propriétaire est au-dessus de
 * l'administrateur : l'exclure de ce que peut faire un administrateur n'aurait
 * pas de sens. C'est la frontière qu'emploient déjà les écrans de réglages et,
 * depuis ce changement, l'écriture dans la base de connaissances.
 */
export function isManager(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Garde des server actions de gestion. Elle LÈVE plutôt que de rediriger : une
 * action appelée par un rôle qui n'y a pas droit est une tentative, pas une
 * navigation, et doit échouer bruyamment.
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
