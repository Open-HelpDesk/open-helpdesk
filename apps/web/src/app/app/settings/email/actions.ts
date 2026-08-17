"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, mailboxes, teams } from "@openhelpdesk/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { requireManager } from "../guard";

/** ST-03 — Ajout d'une adresse de réception (transfert ou IMAP, jamais « fournie »). */
export async function addMailbox(formData: FormData) {
  const { tenant } = await requireManager();
  const address = String(formData.get("address") ?? "").trim().toLowerCase();
  const kind = formData.get("kind") === "imap" ? "imap" : "forwarding";
  const teamId = String(formData.get("defaultTeamId") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return;

  let defaultTeamId: string | null = null;
  if (teamId) {
    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.tenantId, tenant.id), eq(teams.id, teamId)));
    defaultTeamId = team?.id ?? null;
  }

  await db
    .insert(mailboxes)
    .values({ tenantId: tenant.id, address, kind, verified: false, defaultTeamId })
    .onConflictDoNothing();

  revalidatePath("/app/settings/email");
  redirect("/app/settings/email?saved=1");
}

export async function deleteMailbox(formData: FormData) {
  const { tenant } = await requireManager();
  const mailboxId = String(formData.get("mailboxId") ?? "");
  // L'adresse fournie du workspace n'est pas supprimable.
  await db
    .delete(mailboxes)
    .where(
      and(
        eq(mailboxes.tenantId, tenant.id),
        eq(mailboxes.id, mailboxId),
        ne(mailboxes.kind, "provided"),
      ),
    );
  revalidatePath("/app/settings/email");
}

/**
 * ST-03 — Section Envoi : nom d'expéditeur + signature globale, persistés sur la
 * mailbox principale (adresse fournie, sinon la plus ancienne ; créée au besoin).
 */
export async function saveSending(formData: FormData) {
  const { tenant } = await requireManager();
  const senderName = String(formData.get("senderName") ?? "").trim().slice(0, 120) || null;
  const signatureHtml = String(formData.get("signatureHtml") ?? "").trim().slice(0, 4000) || null;

  const rows = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.tenantId, tenant.id))
    .orderBy(asc(mailboxes.createdAt));
  const principal = rows.find((m) => m.kind === "provided") ?? rows[0];

  if (principal) {
    await db
      .update(mailboxes)
      .set({ senderName, signatureHtml })
      .where(eq(mailboxes.id, principal.id));
  } else {
    await db.insert(mailboxes).values({
      tenantId: tenant.id,
      address: `support@${tenant.slug}.open-helpdesk.com`,
      kind: "provided",
      verified: true,
      senderName,
      signatureHtml,
    });
  }

  revalidatePath("/app/settings/email");
  redirect("/app/settings/email?saved=1");
}

/** « Revérifier » — la vérification DNS réelle arrive avec le canal email managé. */
export async function recheckDns() {
  await requireManager();
  revalidatePath("/app/settings/email");
}
