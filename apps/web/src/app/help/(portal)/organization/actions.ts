"use server";

/**
 * PT-08 — actions de l'administration d'organisation (réservées aux contacts
 * porteurs d'un orgAdminGrant) : domaines vérifiés (DNS TXT), partage des
 * demandes, persistance minimale de la connexion SSO (le flux OIDC réel
 * arrive au Lot 5b).
 */
import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, organizations, orgSsoConnections, verifiedDomains } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { DOMAIN_VERIFICATION_TXT_PREFIX, PUBLIC_EMAIL_DOMAINS } from "@openhelpdesk/config";
import { getPortalContact } from "@/lib/portal-auth";
import { getOrgAdminOrg, getOrgSsoConnection } from "@/lib/portal-data";

async function requireOrgAdmin() {
  const session = await getPortalContact();
  if (!session) redirect("/help/login");
  const org = await getOrgAdminOrg(session.tenant.id, session.contact.id);
  if (!org) redirect("/help");
  return { session, org };
}

/** Nom de domaine plausible : étiquettes alphanumériques + tirets, au moins un point. */
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** « + Ajouter un domaine » : format + refus des domaines grand public + unicité tenant. */
export async function addOrgDomain(formData: FormData) {
  const { session, org } = await requireOrgAdmin();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  const fail = (error: string): never =>
    redirect(`/help/organization?tab=domains&error=${error}&domain=${encodeURIComponent(domain)}`);

  if (!DOMAIN_RE.test(domain)) fail("invalid");
  if ((PUBLIC_EMAIL_DOMAINS as readonly string[]).includes(domain)) fail("public");
  const [existing] = await db
    .select({ id: verifiedDomains.id })
    .from(verifiedDomains)
    .where(and(eq(verifiedDomains.tenantId, session.tenant.id), eq(verifiedDomains.domain, domain)));
  if (existing) fail("exists");

  await db.insert(verifiedDomains).values({
    tenantId: session.tenant.id,
    organizationId: org.id,
    domain,
    verificationToken: randomBytes(16).toString("hex"),
  });
  revalidatePath("/help/organization");
  redirect("/help/organization?tab=domains");
}

/** « Vérifier maintenant » : cherche ohd-verify={token} dans les TXT du domaine. */
export async function verifyOrgDomain(formData: FormData) {
  const { session, org } = await requireOrgAdmin();
  const id = String(formData.get("id") ?? "");
  const [row] = await db
    .select()
    .from(verifiedDomains)
    .where(
      and(
        eq(verifiedDomains.id, id),
        eq(verifiedDomains.tenantId, session.tenant.id),
        eq(verifiedDomains.organizationId, org.id),
      ),
    );
  if (!row) redirect("/help/organization?tab=domains");

  let found = false;
  try {
    const records = (await resolveTxt(row.domain)).map((chunks) => chunks.join(""));
    const expected = `${DOMAIN_VERIFICATION_TXT_PREFIX}${row.verificationToken}`;
    found = records.some((r) => r.trim() === expected || r.includes(expected));
  } catch {
    found = false; // NXDOMAIN, timeout… : traité comme un échec de vérification
  }

  await db
    .update(verifiedDomains)
    .set(
      found
        ? { status: "verified", failCount: 0, lastCheckedAt: new Date() }
        : { status: "failed", failCount: row.failCount + 1, lastCheckedAt: new Date() },
    )
    .where(eq(verifiedDomains.id, row.id));
  revalidatePath("/help/organization");
  redirect("/help/organization?tab=domains");
}

/** Toggle « Demandes visibles par toute l'organisation » (organizations.sharedTickets). */
export async function toggleOrgSharing() {
  const { session, org } = await requireOrgAdmin();
  await db
    .update(organizations)
    .set({ sharedTickets: !org.sharedTickets })
    .where(and(eq(organizations.id, org.id), eq(organizations.tenantId, session.tenant.id)));
  revalidatePath("/help/organization");
  redirect("/help/organization?tab=members");
}

const PROVIDER_PROTOCOLS = {
  entra: "oidc",
  google: "oidc",
  okta: "oidc",
  generic: "saml",
} as const;
type SsoProviderKey = keyof typeof PROVIDER_PROTOCOLS;

/**
 * « Tester la connexion » (PT-08) : persistance minimale — la connexion est
 * enregistrée en statut "pending", rien n'est activé tant que le test réel
 * (Lot 5b) n'a pas abouti.
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
          // TODO chiffrement KMS (Lot 5b) — en attendant, JSON encodé base64, jamais renvoyé en clair.
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

/** Bandeau d'activation : bascule pending ↔ disabled (l'activation réelle attend le test, Lot 5b). */
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
