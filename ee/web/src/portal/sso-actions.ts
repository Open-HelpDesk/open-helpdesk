"use server";

/**
 * PT-08 (EE) — SSO actions for the organization admin area: minimal persistence
 * of the connection (the real OIDC/SAML flow lands in Lot 5b).
 * See ee/LICENSE: this file is not covered by the repository's AGPL.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, orgSsoConnections } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { requireOrgAdmin } from "@/lib/portal-auth";
import { getOrgSsoConnection } from "./sso-data";

const PROVIDER_PROTOCOLS = {
  entra: "oidc",
  google: "oidc",
  okta: "oidc",
  generic: "saml",
} as const;
type SsoProviderKey = keyof typeof PROVIDER_PROTOCOLS;

/**
 * "Test the connection" (PT-08): minimal persistence — the connection is saved
 * with status "pending", nothing is enabled as long as the real test (Lot 5b)
 * has not succeeded.
 */
export async function saveSsoConnection(formData: FormData) {
  const { session, org } = await requireOrgAdmin();
  const providerRaw = String(formData.get("provider") ?? "entra");
  const provider: SsoProviderKey =
    providerRaw in PROVIDER_PROTOCOLS ? (providerRaw as SsoProviderKey) : "entra";
  const protocol = PROVIDER_PROTOCOLS[provider];
  const strictMode = formData.get("strict") === "on";
  const jitEnabled = formData.get("jit") === "on";

  const existing = await getOrgSsoConnection(session.tenant.id, org.id);
  let previous: Record<string, unknown> = {};
  if (existing) {
    try {
      previous = JSON.parse(Buffer.from(existing.encryptedConfig, "base64").toString("utf8"));
    } catch {
      previous = {};
    }
  }

  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  const config =
    protocol === "oidc"
      ? {
          // TODO KMS encryption (Lot 5b) — meanwhile base64-encoded JSON, never returned in clear.
          _todo: "chiffrement KMS",
          clientId: String(formData.get("clientId") ?? "").trim() || previous.clientId || "",
          clientSecret: clientSecret || previous.clientSecret || "",
          idpTenant: String(formData.get("idpTenant") ?? "").trim() || previous.idpTenant || "",
        }
      : {
          _todo: "chiffrement KMS",
          metadataUrl: String(formData.get("metadataUrl") ?? "").trim() || previous.metadataUrl || "",
        };
  const encryptedConfig = Buffer.from(JSON.stringify(config)).toString("base64");
  const secretHint = clientSecret ? clientSecret.slice(-4) : (existing?.secretHint ?? null);

  if (existing) {
    await db
      .update(orgSsoConnections)
      .set({
        protocol,
        provider,
        status: "pending",
        encryptedConfig,
        secretHint,
        strictMode,
        jitEnabled,
        updatedAt: new Date(),
      })
      .where(eq(orgSsoConnections.id, existing.id));
  } else {
    await db.insert(orgSsoConnections).values({
      tenantId: session.tenant.id,
      organizationId: org.id,
      protocol,
      provider,
      status: "pending",
      encryptedConfig,
      secretHint,
      strictMode,
      jitEnabled,
    });
  }
  revalidatePath("/help/organization");
  redirect(`/help/organization?tab=sso&provider=${provider}`);
}

/** Enablement banner: toggles pending ↔ disabled (real activation waits for the test, Lot 5b). */
export async function toggleSsoEnabled() {
  const { session, org } = await requireOrgAdmin();
  const existing = await getOrgSsoConnection(session.tenant.id, org.id);
  if (!existing) redirect("/help/organization?tab=sso");
  await db
    .update(orgSsoConnections)
    .set({
      status: existing.status === "disabled" ? "pending" : "disabled",
      updatedAt: new Date(),
    })
    .where(eq(orgSsoConnections.id, existing.id));
  revalidatePath("/help/organization");
  redirect("/help/organization?tab=sso");
}
