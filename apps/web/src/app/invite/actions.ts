"use server";

/**
 * Acceptation d'une invitation d'agent (ST-02) : le jeton HMAC prouve le
 * contrôle de l'adresse — l'identité Better Auth est créée avec l'email déjà
 * marqué vérifié, puis la ligne app.users passe invited → active. C'est la
 * SEULE transition invited → active du produit.
 */
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@openhelpdesk/auth";
import { authUsers, db, users } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { getTenantFromHeaders } from "@/lib/tenant";
import { verifyInviteToken } from "@/lib/invite-token";

export async function acceptInvite(formData: FormData) {
  const tenant = await getTenantFromHeaders();
  if (!tenant) redirect("/login");

  const token = String(formData.get("token") ?? "");
  const userId = verifyInviteToken(tenant.id, token);
  if (!userId) redirect(`/invite/${encodeURIComponent(token)}?error=invalid`);

  const [invited] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.id, userId)));
  if (!invited) redirect(`/invite/${encodeURIComponent(token)}?error=invalid`);
  if (invited.status === "active") redirect("/login?accepted=1");
  if (invited.status === "disabled") redirect("/login?error=not-a-member");

  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || invited.name;
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) redirect(`/invite/${encodeURIComponent(token)}?error=password`);

  try {
    await auth.api.signUpEmail({
      body: { email: invited.email, password, name },
    });
  } catch (err) {
    // Identité déjà existante (agent d'un autre workspace) : l'invitation
    // reste valable, l'activation suffit — il se connectera avec son mot de
    // passe habituel. Toute autre erreur est réelle.
    if (!(err instanceof APIError && err.status === "UNPROCESSABLE_ENTITY")) {
      console.error("[invite] création d'identité impossible :", err);
      redirect(`/invite/${encodeURIComponent(token)}?error=failed`);
    }
  }

  // Le clic sur le lien d'invitation vaut vérification de l'adresse.
  await db
    .update(authUsers)
    .set({ emailVerified: true })
    .where(eq(authUsers.email, invited.email));
  await db
    .update(users)
    .set({ status: "active", name })
    .where(and(eq(users.tenantId, tenant.id), eq(users.id, invited.id)));

  redirect("/login?accepted=1");
}

/** Session OAuth déjà ouverte sur la bonne adresse : activation directe. */
export async function activateFromSession(token: string): Promise<void> {
  const tenant = await getTenantFromHeaders();
  if (!tenant) return;
  const userId = verifyInviteToken(tenant.id, token);
  if (!userId) return;
  const { headers } = await import("next/headers");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return;
  const [invited] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.id, userId)));
  if (!invited || invited.status !== "invited") return;
  if (invited.email !== session.user.email) return;
  await db
    .update(users)
    .set({ status: "active" })
    .where(and(eq(users.tenantId, tenant.id), eq(users.id, invited.id)));
}
