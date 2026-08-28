"use server";

import { sendAgentInvite } from "@/lib/agent-invite";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, mailboxes, tenants, users } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { requireManager } from "@/lib/session";
import { MAX_BRAND_BYTES, saveBrandAsset } from "@/lib/storage";

/**
 * Onboarding configures the workspace: it is restricted to Owner and Admin.
 *
 * `inviteTeam` inserts a member with the role read from the form, "admin"
 * included. Under `requireAgent`, any agent — or viewer — could therefore
 * invite themselves as an administrator at a second address, sign in there
 * (email sign-up is open and unverified) and get hold of everything
 * `requireManager` guards: the settings, the API keys, write access to the
 * knowledge base. The restriction placed on the KB was worth nothing as long
 * as this door stayed open.
 */

/**
 * Accepted logo formats — the same set as settings → general, deliberately: a
 * file that screen would take must not be refused here, and the upload goes
 * through the same saveBrandAsset. One rule, one writer.
 */
const LOGO_FORMATS = new Set(["image/png", "image/svg+xml", "image/jpeg", "image/webp"]);

/**
 * Step 1 — Identity: workspace name, logo, accent color (tenants.branding).
 *
 * The logo was a promise this action did not keep: the step announced "name,
 * logo, colour", drew a dashed box reading "drop a PNG or SVG file" that was a
 * plain div, and nothing here ever looked for a file.
 */
export async function saveIdentity(formData: FormData) {
  const { tenant } = await requireManager();
  const name = String(formData.get("name") ?? "").trim();
  const accentColor = String(formData.get("accentColor") ?? "").trim();

  const branding = { ...((tenant.branding ?? {}) as Record<string, unknown>) };
  if (/^#[0-9a-fA-F]{6}$/.test(accentColor)) branding.accentColor = accentColor;

  // The control offers a removal once a logo is in place — the step can be
  // returned to. Not reading the field would leave that button looking effective.
  if (formData.get("remove-logo") === "1") delete branding.logoUrl;

  // A refused file interrupts the step with a named reason, rather than saving
  // the rest and dropping the logo in silence.
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!LOGO_FORMATS.has(file.type)) redirect("/onboarding?step=1&error=logo-format");
    if (file.size > MAX_BRAND_BYTES) redirect("/onboarding?step=1&error=logo-size");
    branding.logoUrl = await saveBrandAsset(tenant.id, "logo", file);
  }

  await db
    .update(tenants)
    .set({
      ...(name ? { name } : {}),
      branding,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id));

  revalidatePath("/onboarding");
  redirect("/onboarding?step=2");
}

/**
 * Step 2 — Own address: registers a forwarding mailbox, same rules as
 * settings → email (ST-03). No verification action to call: the ingestion
 * flips `verified` on the first email that arrives through the redirect,
 * and the step shows the waiting state until then.
 */
export async function connectForwardingAddress(formData: FormData) {
  const { tenant } = await requireManager();
  const address = String(formData.get("address") ?? "")
    .trim()
    .toLowerCase();

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    await db
      .insert(mailboxes)
      .values({ tenantId: tenant.id, address, kind: "forwarding", verified: false })
      .onConflictDoNothing();
  }

  revalidatePath("/onboarding");
  redirect("/onboarding?step=2");
}

/**
 * Step 2 — Undo "connect my own address".
 *
 * Once a forwarding mailbox existed the step showed only its waiting state, with
 * no way back: the owner could neither correct a typo nor fall back to the
 * provided address, which is what left this screen feeling stuck. Removing it
 * brings back the form (or lets the owner simply move on with the provided
 * address, which is active from the start). Scoped to the forwarding kind — the
 * provided address is never deleted here.
 */
export async function removeForwardingAddress() {
  const { tenant } = await requireManager();
  await db
    .delete(mailboxes)
    .where(and(eq(mailboxes.tenantId, tenant.id), eq(mailboxes.kind, "forwarding")));
  revalidatePath("/onboarding");
  redirect("/onboarding?step=2");
}

/** Step 3 — Team: each email + role row creates an "invited" user. */
export async function inviteTeam(formData: FormData) {
  const { tenant } = await requireManager();
  const emails = formData.getAll("email").map((e) => String(e).trim().toLowerCase());
  const roles = formData.getAll("role").map((r) => String(r));

  // Nothing to send → stay on the step. Moving on without inviting is the
  // "Skip" link's job; the primary button advancing on an empty form read as
  // a success that never happened.
  if (!emails.some((e) => e.includes("@"))) redirect("/onboarding?step=3");

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    if (!email || !email.includes("@")) continue;
    const role = ["admin", "agent", "viewer"].includes(roles[i] ?? "")
      ? (roles[i] as "admin" | "agent" | "viewer")
      : "agent";
    const inserted = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email,
        name: email.split("@")[0] ?? email,
        role,
        status: "invited",
      })
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email });
    for (const row of inserted) {
      await sendAgentInvite(tenant, row);
    }
  }

  revalidatePath("/onboarding");
  redirect("/onboarding?step=4");
}
