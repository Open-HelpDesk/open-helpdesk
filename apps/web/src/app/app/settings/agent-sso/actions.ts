"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { entitlementsFor } from "@/lib/entitlements";
import { requireManager } from "../guard";
import { getT } from "@/i18n/server";

export type AgentSsoConfig = {
  saml?: {
    enabled?: boolean;
    idp?: string;
    entityId?: string;
    ssoUrl?: string;
    certificate?: string;
    mapping?: { email?: string; firstName?: string; lastName?: string; role?: string; team?: string };
    rolesFromIdp?: boolean;
    enforcement?: "optional" | "verified_domains" | "all";
    sessionHours?: number;
    backupEmail?: string;
  };
  scim?: {
    enabled?: boolean;
    tokenHash?: string;
    tokenHint?: string;
    groups?: { group: string; team: string; role: string }[];
  };
};

async function requirePro() {
  const current = await requireManager();
  if (!entitlementsFor(current.tenant.plan).agentSso) {
    const t = await getT();
    throw new Error(t("app.settings.sso.agentProOnly"));
  }
  return current;
}

/** ST-13 — Formulaire SAML persistant dans tenants.agentSsoConfig (jsonb). */
export async function saveSamlConfig(formData: FormData) {
  const { tenant } = await requirePro();
  const config = ((tenant.agentSsoConfig as AgentSsoConfig) ?? {}) as AgentSsoConfig;

  const enforcementRaw = String(formData.get("enforcement") ?? "verified_domains");
  const sessionHours = Number(formData.get("sessionHours") ?? 8);

  const next: AgentSsoConfig = {
    ...config,
    saml: {
      enabled: formData.get("enabled") === "on",
      idp: String(formData.get("idp") ?? "other").slice(0, 30),
      entityId: String(formData.get("entityId") ?? "").trim().slice(0, 300),
      ssoUrl: String(formData.get("ssoUrl") ?? "").trim().slice(0, 500),
      certificate: String(formData.get("certificate") ?? "").trim().slice(0, 8000),
      mapping: {
        email: String(formData.get("m_email") ?? "user.email").trim().slice(0, 120),
        firstName: String(formData.get("m_firstName") ?? "").trim().slice(0, 120),
        lastName: String(formData.get("m_lastName") ?? "").trim().slice(0, 120),
        role: String(formData.get("m_role") ?? "").trim().slice(0, 120),
        team: String(formData.get("m_team") ?? "").trim().slice(0, 120),
      },
      rolesFromIdp: formData.get("rolesFromIdp") === "on",
      enforcement: ["optional", "verified_domains", "all"].includes(enforcementRaw)
        ? (enforcementRaw as "optional" | "verified_domains" | "all")
        : "verified_domains",
      sessionHours: [4, 8, 12, 24].includes(sessionHours) ? sessionHours : 8,
      backupEmail: String(formData.get("backupEmail") ?? "").trim().slice(0, 200),
    },
  };

  await db.update(tenants).set({ agentSsoConfig: next }).where(eq(tenants.id, tenant.id));
  revalidatePath("/app/settings/agent-sso");
  redirect("/app/settings/agent-sso?saved=1");
}

export type ScimTokenState = { token: string } | null;

/**
 * ST-13 — Jeton SCIM : stocké haché (SHA-256), suffixe affichable. Le jeton en
 * clair n'est renvoyé qu'une seule fois ; le régénérer interrompt la synchro.
 */
export async function regenerateScimToken(
  _prev: ScimTokenState,
  _formData: FormData,
): Promise<ScimTokenState> {
  const { tenant } = await requirePro();
  const config = ((tenant.agentSsoConfig as AgentSsoConfig) ?? {}) as AgentSsoConfig;

  const random = randomBytes(20).toString("hex");
  const token = `scim_live_${random}`;
  const next: AgentSsoConfig = {
    ...config,
    scim: {
      ...(config.scim ?? {}),
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tokenHint: `scim_live_••…${random.slice(-4)}`,
    },
  };

  await db.update(tenants).set({ agentSsoConfig: next }).where(eq(tenants.id, tenant.id));
  revalidatePath("/app/settings/agent-sso");
  return { token };
}

/** ST-13 — Activation SCIM + correspondance des groupes (éditable, jsonb). */
export async function saveScimGroups(formData: FormData) {
  const { tenant } = await requirePro();
  const config = ((tenant.agentSsoConfig as AgentSsoConfig) ?? {}) as AgentSsoConfig;

  const groups = formData.getAll("g_group").map(String);
  const teams = formData.getAll("g_team").map(String);
  const roles = formData.getAll("g_role").map(String);

  const rows: { group: string; team: string; role: string }[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!.trim().slice(0, 120);
    if (!group) continue;
    rows.push({
      group,
      team: (teams[i] ?? "").slice(0, 120),
      role: ["owner", "admin", "agent", "viewer"].includes(roles[i] ?? "") ? roles[i]! : "agent",
    });
  }

  const next: AgentSsoConfig = {
    ...config,
    scim: {
      ...(config.scim ?? {}),
      enabled: formData.get("scimEnabled") === "on",
      groups: rows.slice(0, 50),
    },
  };

  await db.update(tenants).set({ agentSsoConfig: next }).where(eq(tenants.id, tenant.id));
  revalidatePath("/app/settings/agent-sso");
  redirect("/app/settings/agent-sso?tab=scim&saved=1");
}
