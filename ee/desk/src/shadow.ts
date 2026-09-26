import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { deskApps, deskConnectors, shadowFindings, withTenant } from "@openhelpdesk/db";
import { createApp, type Actor } from "@openhelpdesk/desk";
import { DeskEeError, requireEntitlement } from "./gov/entitlements";
import { journal } from "./gov/audit";
import { connectorOfKind } from "./connectors/store";
import { listOAuthGrants, riskOfScopes } from "./gov/google-reports";

/* ---------------- Shadow IT (deskShadowIt) ---------------- */

const DAY = 86_400_000;
/** How far back a discovery run reads the OAuth grant events. */
const DISCOVERY_WINDOW_DAYS = 30;

function slugOf(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "app"
  );
}

/**
 * - `added`: the tool enters the catalogue HIDDEN with one approval level —
 *   the admin configures its circuit before anyone can request it. An app with
 *   the same slug already in the catalogue is reused, not duplicated.
 * - `blocked`: journaled. Revoking the users' OAuth tokens at the IdP is NOT
 *   automated in V1 (spec §6 A8: a destructive write on the customer's IdP);
 *   the journal line says so when a Google or Entra connector exists.
 * - `ignored`: journaled, nothing else.
 */
export async function setShadowStatus(tenantId: string, findingId: string, status: "added" | "blocked" | "ignored", actor: Actor): Promise<void> {
  const finding = await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskShadowIt");
    const [f] = await tx
      .select()
      .from(shadowFindings)
      .where(and(eq(shadowFindings.tenantId, tenantId), eq(shadowFindings.id, findingId)))
      .limit(1);
    if (!f) throw new DeskEeError("finding_not_found", "Unknown finding");
    return f;
  });
  if (finding.status === status) return;

  let appId: string | null = null;
  if (status === "added") {
    const slug = slugOf(finding.name);
    const existing = await withTenant(tenantId, async (tx) => {
      const [a] = await tx
        .select({ id: deskApps.id })
        .from(deskApps)
        .where(and(eq(deskApps.tenantId, tenantId), eq(deskApps.slug, slug), isNull(deskApps.deletedAt)))
        .limit(1);
      return a?.id ?? null;
    });
    appId =
      existing ??
      (await createApp(
        tenantId,
        {
          name: finding.name,
          slug,
          category: "Other",
          description: "",
          iconKey: finding.iconKey,
          visible: false,
          approvalLevels: 1,
        },
        actor,
      ));
  }

  await withTenant(tenantId, async (tx) => {
    let tokenRevocation: "not_automated" | null = null;
    if (status === "blocked") {
      const [idp] = await tx
        .select({ id: deskConnectors.id })
        .from(deskConnectors)
        .where(and(eq(deskConnectors.tenantId, tenantId), inArray(deskConnectors.kind, ["google", "entra"])))
        .limit(1);
      if (idp) tokenRevocation = "not_automated";
    }
    await tx.update(shadowFindings).set({ status }).where(eq(shadowFindings.id, findingId));
    await journal(tx, tenantId, actor, "desk.shadow.status_changed", { type: "shadow_finding", id: findingId }, {
      before: { status: finding.status },
      after: { status, name: finding.name, domain: finding.domain, appId, tokenRevocation },
    });
  });
}

/**
 * Worker: pulls OAuth grants (Google Admin Reports, "token" activity) and
 * upserts findings. Without a Google connector holding a service account and
 * an admin to impersonate, nothing is read and nothing is invented: found = 0.
 * Entra sign-in logs and expenses are not read in V1.
 */
export async function discoverShadowIt(tenantId: string): Promise<{ found: number }> {
  await withTenant(tenantId, (tx) => requireEntitlement(tx, tenantId, "deskShadowIt"));
  const google = await connectorOfKind(tenantId, "google");
  const adminEmail = typeof google?.settings.adminEmail === "string" ? google.settings.adminEmail : null;
  if (!google || !adminEmail || !google.secrets.serviceAccountJson || google.status === "disabled") return { found: 0 };

  const grants = await listOAuthGrants(google.secrets.serviceAccountJson, adminEmail, new Date(Date.now() - DISCOVERY_WINDOW_DAYS * DAY));
  const byClient = new Map<string, { name: string; users: Set<string>; scopes: Set<string>; lastAt: Date }>();
  for (const g of grants) {
    let entry = byClient.get(g.clientId);
    if (!entry) byClient.set(g.clientId, (entry = { name: g.appName, users: new Set(), scopes: new Set(), lastAt: g.at }));
    entry.users.add(g.userEmail);
    for (const s of g.scopes) entry.scopes.add(s);
    if (g.at > entry.lastAt) entry.lastAt = g.at;
  }

  return withTenant(tenantId, async (tx) => {
    const catalogue = await tx
      .select({ name: deskApps.name })
      .from(deskApps)
      .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt)));
    const known = new Set(catalogue.map((a) => a.name.trim().toLowerCase()));
    let found = 0;
    for (const [clientId, e] of byClient) {
      // Already in the catalogue: not shadow. Google's own clients: not a third party.
      if (known.has(e.name.trim().toLowerCase()) || /^google\b/i.test(e.name)) continue;
      const { risk, reason } = riskOfScopes([...e.scopes]);
      // Google reports no domain for an OAuth client: the client id is the stable key.
      const domain = `oauth:${clientId}`;
      await tx
        .insert(shadowFindings)
        .values({
          tenantId,
          name: e.name,
          domain,
          source: "google_oauth",
          users: e.users.size,
          risk,
          riskReason: reason,
          lastSeenAt: e.lastAt,
        })
        .onConflictDoUpdate({
          target: [shadowFindings.tenantId, shadowFindings.domain],
          set: { name: e.name, users: e.users.size, risk, riskReason: reason, lastSeenAt: sql`greatest(${shadowFindings.lastSeenAt}, excluded.last_seen_at)` },
        });
      found++;
    }
    await journal(tx, tenantId, { kind: "system" }, "desk.shadow.discovered", { type: "desk_connector", id: google.id }, {
      after: { source: "google_oauth", events: grants.length, found },
    });
    return { found };
  });
}
