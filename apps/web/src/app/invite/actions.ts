"use server";

/**
 * Accepting an agent invitation (ST-02): the HMAC token proves control of the
 * address — the Better Auth identity is created with the email already marked
 * verified, then the app.users row moves invited → active. This is the ONLY
 * invited → active transition in the product.
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
    // Identity already exists (an agent from another workspace): the invitation
    // stays valid, activation is enough — they will sign in with their usual
    // password. Any other error is a real one.
    if (!(err instanceof APIError && err.status === "UNPROCESSABLE_ENTITY")) {
      console.error("[invite] could not create identity:", err);
      redirect(`/invite/${encodeURIComponent(token)}?error=failed`);
    }
  }

  // Clicking the invitation link counts as verification of the address.
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

/** OAuth session already open on the right address: direct activation. */
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
