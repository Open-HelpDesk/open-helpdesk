"use server";

import { providedMailboxAddress } from "@openhelpdesk/config";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auditEvents, db, emailSettings, mailboxes, teams, ticketForms } from "@openhelpdesk/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { decryptSecrets, encryptSecrets, secretHint } from "@openhelpdesk/crypto";
import { sendTenantEmail, transportFor, verifyImapMailbox } from "@openhelpdesk/mail";
import { getT } from "@/i18n/server";
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
  redirect("/app/settings/email?tab=reception&saved=1");
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
      address: providedMailboxAddress(tenant.slug),
      kind: "provided",
      verified: true,
      senderName,
      signatureHtml,
    });
  }

  revalidatePath("/app/settings/email");
  redirect("/app/settings/email?saved=2");
}

/** « Revérifier » — la vérification DNS réelle arrive avec le canal email managé. */
export async function recheckDns() {
  await requireManager();
  revalidatePath("/app/settings/email");
}

/* ---------- Configuration du fournisseur d'envoi (par workspace) ---------- */

const PROVIDERS = new Set(["console", "smtp", "resend", "brevo", "mailjet"]);

/** Enregistre le fournisseur et ses identifiants (secrets chiffrés au repos). */
export async function saveEmailProvider(formData: FormData) {
  const { tenant, agent } = await requireManager();
  const t = await getT();
  const provider = String(formData.get("provider") ?? "console");
  if (!PROVIDERS.has(provider)) return;

  const secret = String(formData.get("secret") ?? "").trim();
  const secret2 = String(formData.get("secret2") ?? "").trim();

  const [existing] = await db
    .select()
    .from(emailSettings)
    .where(eq(emailSettings.tenantId, tenant.id));

  // Secrets : conservés si les champs sont laissés vides (ils ne sont jamais réaffichés).
  let encryptedSecrets = existing?.encryptedSecrets ?? null;
  let hint = existing?.secretHint ?? null;
  if (secret) {
    const secrets: Record<string, string> =
      provider === "smtp"
        ? { password: secret }
        : provider === "mailjet"
          ? { apiKey: secret, apiSecret: secret2 }
          : { apiKey: secret };
    encryptedSecrets = encryptSecrets(secrets);
    hint = secretHint(secret);
  } else if (provider === "mailjet" && secret2 && encryptedSecrets) {
    // Seule la clé privée change.
    const current = decryptSecrets(encryptedSecrets);
    encryptedSecrets = encryptSecrets({ ...current, apiSecret: secret2 });
  }

  const port = Number(formData.get("smtpPort") ?? 0);
  const values = {
    provider: provider as "console" | "smtp" | "resend" | "brevo" | "mailjet",
    fromName: String(formData.get("fromName") ?? "").trim().slice(0, 120) || null,
    fromAddress: String(formData.get("fromAddress") ?? "").trim().toLowerCase() || null,
    replyTo: String(formData.get("replyTo") ?? "").trim().toLowerCase() || null,
    smtpHost: String(formData.get("smtpHost") ?? "").trim() || null,
    smtpPort: Number.isFinite(port) && port > 0 && port < 65536 ? port : null,
    smtpSecure: formData.get("smtpSecure") === "true",
    smtpUser: String(formData.get("smtpUser") ?? "").trim() || null,
    encryptedSecrets,
    secretHint: hint,
    // Toute modification de configuration invalide le dernier test.
    testStatus: "untested" as const,
    testError: null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(emailSettings).set(values).where(eq(emailSettings.id, existing.id));
  } else {
    await db.insert(emailSettings).values({ tenantId: tenant.id, ...values });
  }

  await db.insert(auditEvents).values({
    tenantId: tenant.id,
    actorType: "user",
    actorId: agent.id,
    action: t("app.settings.email.auditProviderConfigured", { provider }),
    targetType: "email_settings",
  });

  revalidatePath("/app/settings/email");
  redirect("/app/settings/email?saved=1");
}

/** Test de connexion : vérifie la configuration enregistrée sans envoyer d'email. */
export async function testEmailConnection() {
  const { tenant } = await requireManager();
  const t = await getT();
  const [row] = await db
    .select()
    .from(emailSettings)
    .where(eq(emailSettings.tenantId, tenant.id));

  let result: { ok: boolean; detail: string };
  if (!row || row.provider === "console") {
    result = {
      ok: false,
      detail: t("app.settings.email.connectionNoProvider"),
    };
  } else {
    const transport = transportFor(row);
    result = transport.verify
      ? await transport.verify()
      : { ok: true, detail: t("app.settings.email.connectionNoVerify") };
  }

  if (row) {
    await db
      .update(emailSettings)
      .set({
        testStatus: result.ok ? "ok" : "failed",
        testError: result.ok ? null : result.detail.slice(0, 1000),
        lastTestedAt: new Date(),
      })
      .where(eq(emailSettings.id, row.id));
  }

  revalidatePath("/app/settings/email");
}

/** Envoi réel d'un email de test à l'agent connecté — apparaît dans le journal. */
export async function sendEmailTest() {
  const { tenant, agent } = await requireManager();
  const t = await getT();

  const result = await sendTenantEmail({
    tenantId: tenant.id,
    to: agent.email,
    kind: "test",
    immediate: true,
    subject: t("app.settings.email.testEmailSubject", { name: tenant.name }),
    text: t("app.settings.email.testEmailBody", {
      agent: agent.name,
      workspace: tenant.name,
    }),
  });

  const [row] = await db
    .select({ id: emailSettings.id })
    .from(emailSettings)
    .where(eq(emailSettings.tenantId, tenant.id));
  if (row) {
    await db
      .update(emailSettings)
      .set({
        testStatus: result.sent ? "ok" : "failed",
        testError: result.sent
          ? null
          : (result.error ?? t("app.settings.email.sendFailed")).slice(0, 1000),
        lastTestedAt: new Date(),
      })
      .where(eq(emailSettings.id, row.id));
  }

  revalidatePath("/app/settings/email");
}


/* ---------- Adresses : création/édition unifiée (transfert + IMAP) ---------- */

/** Crée ou met à jour une adresse de réception. Le mot de passe IMAP est chiffré. */
export async function saveMailbox(formData: FormData) {
  const { tenant } = await requireManager();
  const mailboxId = String(formData.get("mailboxId") ?? "");
  const address = String(formData.get("address") ?? "").trim().toLowerCase();
  const kind = formData.get("kind") === "imap" ? ("imap" as const) : ("forwarding" as const);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return;

  const [existing] = mailboxId
    ? await db
        .select()
        .from(mailboxes)
        .where(and(eq(mailboxes.tenantId, tenant.id), eq(mailboxes.id, mailboxId)))
    : [];
  if (mailboxId && !existing) return;
  if (existing?.kind === "provided") return; // l'adresse fournie ne se modifie pas ici

  const teamRaw = String(formData.get("defaultTeamId") ?? "");
  let defaultTeamId: string | null = null;
  if (teamRaw) {
    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.tenantId, tenant.id), eq(teams.id, teamRaw)));
    defaultTeamId = team?.id ?? null;
  }
  const formRaw = String(formData.get("formId") ?? "");
  let formId: string | null = null;
  if (formRaw) {
    const [form] = await db
      .select({ id: ticketForms.id })
      .from(ticketForms)
      .where(and(eq(ticketForms.tenantId, tenant.id), eq(ticketForms.id, formRaw)));
    formId = form?.id ?? null;
  }

  const imapPassword = String(formData.get("imapPassword") ?? "").trim();
  const port = Number(formData.get("imapPort") ?? 0);
  const imap =
    kind === "imap"
      ? {
          imapHost: String(formData.get("imapHost") ?? "").trim() || null,
          imapPort: Number.isFinite(port) && port > 0 && port < 65536 ? port : null,
          imapSecure: formData.get("imapSecure") !== "false",
          imapUser: String(formData.get("imapUser") ?? "").trim() || null,
          encryptedSecrets: imapPassword
            ? encryptSecrets({ password: imapPassword })
            : (existing?.encryptedSecrets ?? null),
        }
      : {
          imapHost: null,
          imapPort: null,
          imapSecure: true,
          imapUser: null,
          encryptedSecrets: null,
        };

  const values = {
    address,
    kind,
    defaultTeamId,
    formId,
    ...imap,
    // Un changement de configuration remet la vérification à zéro.
    verified: false,
    syncError: null,
  };

  if (existing) {
    await db.update(mailboxes).set(values).where(eq(mailboxes.id, existing.id));
  } else {
    await db
      .insert(mailboxes)
      .values({ tenantId: tenant.id, ...values })
      .onConflictDoNothing();
  }

  revalidatePath("/app/settings/email");
  redirect("/app/settings/email?tab=reception&saved=1");
}

/** Bouton « Tester » d'une adresse IMAP : connexion réelle, statut mis à jour. */
export async function verifyMailbox(formData: FormData) {
  const { tenant } = await requireManager();
  const mailboxId = String(formData.get("mailboxId") ?? "");
  const [row] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.tenantId, tenant.id), eq(mailboxes.id, mailboxId)));
  if (!row || row.kind !== "imap") return;

  const result = await verifyImapMailbox(row);
  await db
    .update(mailboxes)
    .set({
      verified: result.ok,
      lastSyncAt: new Date(),
      syncError: result.ok ? null : result.detail.slice(0, 500),
    })
    .where(eq(mailboxes.id, row.id));

  revalidatePath("/app/settings/email");
}
