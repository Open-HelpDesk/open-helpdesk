/**
 * Connectors (deskConnectors): the configuration screen's writes, the
 * connection test, and the last-sign-in synchronisation. The provisioning
 * itself lives in extensions/provisioning.ts (the core calls it).
 *
 * Secrets are encrypted with @openhelpdesk/crypto and never leave this
 * module in clear: the audit line names which secret keys changed, not their
 * values.
 */
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { decryptSecrets, encryptSecrets } from "@openhelpdesk/crypto";
import { accessGrants, deskApps, deskConnectors, people, withTenant } from "@openhelpdesk/db";
import type { Actor } from "@openhelpdesk/desk";
import { entraCheck, entraConfig, entraLastSignIns } from "./connectors/entra";
import { googleCheck, googleConfig, googleLastLogins } from "./connectors/google";
import { ConnectorError } from "./connectors/http";
import { checkScimApp } from "./connectors/scim-out";
import { audit, hasDeskConnectors } from "./connectors/shared";
import { appScimToken, loadConnector, recordRun } from "./connectors/store";

/* ---------------- Connectors (deskConnectors) ---------------- */

export type ConnectorInput = {
  kind: "entra" | "google" | "scim";
  name: string;
  settings: Record<string, unknown>;
  /** Only the secrets being changed; omitted keys are kept. */
  secrets?: Record<string, string>;
};

async function requireEntitlement(tenantId: string): Promise<void> {
  if (!(await hasDeskConnectors(tenantId))) throw new Error("deskConnectors entitlement required");
}

export async function saveConnector(tenantId: string, input: ConnectorInput & { id?: string }, actor: Actor): Promise<string> {
  await requireEntitlement(tenantId);
  if (!["entra", "google", "scim"].includes(input.kind)) throw new Error(`Unknown connector kind ${input.kind}`);
  const name = input.name.trim();
  if (!name) throw new Error("A connector needs a name");
  const changedKeys = Object.keys(input.secrets ?? {});

  return withTenant(tenantId, async (tx) => {
    const now = new Date();
    if (input.id) {
      const [existing] = await tx.select().from(deskConnectors).where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, input.id)));
      if (!existing) throw new Error("Connector not found");
      if (existing.kind !== input.kind) throw new Error("A connector's kind cannot change");
      // Merge: omitted keys are kept, an empty string clears one.
      const merged: Record<string, string> = { ...decryptSecrets(existing.secrets) };
      for (const [k, v] of Object.entries(input.secrets ?? {})) {
        if (v === "") delete merged[k];
        else merged[k] = v;
      }
      const settingsChanged = JSON.stringify(existing.settings ?? {}) !== JSON.stringify(input.settings ?? {});
      await tx
        .update(deskConnectors)
        .set({
          name,
          settings: input.settings ?? {},
          secrets: Object.keys(merged).length ? encryptSecrets(merged) : null,
          // A changed connection is unproven until tested again (claims must be true).
          ...(settingsChanged || changedKeys.length ? { status: "pending" as const, lastError: null } : {}),
          updatedAt: now,
        })
        .where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, input.id)));
      await audit(
        tx,
        tenantId,
        actor,
        "desk.connector.updated",
        { type: "desk_connector", id: input.id },
        { name: existing.name, settings: existing.settings },
        { name, settings: input.settings ?? {}, secretsChanged: changedKeys },
      );
      return input.id;
    }
    const secrets = Object.fromEntries(Object.entries(input.secrets ?? {}).filter(([, v]) => v !== ""));
    const [row] = await tx
      .insert(deskConnectors)
      .values({
        tenantId,
        kind: input.kind,
        name,
        settings: input.settings ?? {},
        secrets: Object.keys(secrets).length ? encryptSecrets(secrets) : null,
        status: "pending",
      })
      .returning({ id: deskConnectors.id });
    await audit(tx, tenantId, actor, "desk.connector.created", { type: "desk_connector", id: row!.id }, null, {
      kind: input.kind,
      name,
      settings: input.settings ?? {},
      secretsChanged: changedKeys,
    });
    return row!.id;
  });
}

export async function testConnector(tenantId: string, connectorId: string, actor: Actor): Promise<{ ok: boolean; ms: number; message: string }> {
  await requireEntitlement(tenantId);
  const connector = await loadConnector(tenantId, connectorId);
  if (!connector) throw new Error("Connector not found");
  const started = Date.now();
  let ok = false;
  let message: string;
  let level: "ok" | "warn" | "err" = "err";

  try {
    if (connector.kind === "entra") {
      message = await entraCheck(entraConfig(connector));
      ok = true;
    } else if (connector.kind === "google") {
      message = await googleCheck(googleConfig(connector));
      ok = true;
    } else {
      // Outbound SCIM holds one token per application: test each one attached.
      const apps = await withTenant(tenantId, (tx) =>
        tx
          .select({ name: deskApps.name, base: deskApps.scimBaseUrl, token: deskApps.scimToken })
          .from(deskApps)
          .where(and(eq(deskApps.tenantId, tenantId), eq(deskApps.connectorId, connectorId), isNull(deskApps.deletedAt))),
      );
      const configured = apps.filter((a) => a.base && a.token);
      if (configured.length === 0) {
        message = "No application with a SCIM URL and token uses this connector yet";
        level = "warn";
      } else {
        const failures: string[] = [];
        for (const a of configured) {
          try {
            await checkScimApp(a.base!, appScimToken(a.token)!, a.name);
          } catch (err) {
            failures.push(err instanceof Error ? err.message : String(err));
          }
        }
        ok = failures.length === 0;
        message = ok ? `${configured.length} application${configured.length > 1 ? "s" : ""} reachable` : failures.join("; ");
      }
    }
    if (ok) level = "ok";
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
    level = err instanceof ConnectorError && err.scope === "item" ? "warn" : "err";
  }

  const ms = Date.now() - started;
  await recordRun(tenantId, connectorId, level, `Connection test: ${message}`);
  await withTenant(tenantId, (tx) => audit(tx, tenantId, actor, "desk.connector.tested", { type: "desk_connector", id: connectorId }, null, { ok, ms, message }));
  return { ok, ms, message };
}

export async function deleteConnector(tenantId: string, connectorId: string, actor: Actor): Promise<void> {
  await requireEntitlement(tenantId);
  await withTenant(tenantId, async (tx) => {
    const [existing] = await tx.select().from(deskConnectors).where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, connectorId)));
    if (!existing) throw new Error("Connector not found");
    // Apps keep existing: their connector_id is set null by the foreign key, so
    // they fall back to manual provisioning instead of claiming automation.
    await tx.delete(deskConnectors).where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, connectorId)));
    await audit(tx, tenantId, actor, "desk.connector.deleted", { type: "desk_connector", id: connectorId }, { kind: existing.kind, name: existing.name }, null);
  });
}

const LOOKBACK_DAYS = 30;

/** Pulls sign-in activity and fills access_grants.lastSeenAt (Entra sign-in logs, Google reports). */
export async function syncLastSeen(tenantId: string): Promise<{ updated: number }> {
  if (!(await hasDeskConnectors(tenantId))) return { updated: 0 };
  const connectors = await withTenant(tenantId, (tx) =>
    tx
      .select({ id: deskConnectors.id })
      .from(deskConnectors)
      .where(and(eq(deskConnectors.tenantId, tenantId), or(eq(deskConnectors.kind, "entra"), eq(deskConnectors.kind, "google")))),
  );
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  let updated = 0;

  for (const { id } of connectors) {
    const connector = await loadConnector(tenantId, id);
    if (!connector) continue;
    let forConnector = 0;
    try {
      const apps = await withTenant(tenantId, (tx) =>
        tx
          .select({ id: deskApps.id, name: deskApps.name })
          .from(deskApps)
          .where(and(eq(deskApps.tenantId, tenantId), eq(deskApps.connectorId, id), isNull(deskApps.deletedAt))),
      );
      for (const app of apps) {
        const seen =
          connector.kind === "entra"
            ? await entraLastSignIns(entraConfig(connector), app.name, since)
            : await googleLastLogins(googleConfig(connector), app.name, since);
        if (seen.size === 0) continue;
        forConnector += await withTenant(tenantId, async (tx) => {
          const grants = await tx
            .select({ id: accessGrants.id, email: people.email, lastSeenAt: accessGrants.lastSeenAt })
            .from(accessGrants)
            .innerJoin(people, eq(people.id, accessGrants.personId))
            .where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.appId, app.id), isNull(accessGrants.revokedAt)));
          let n = 0;
          for (const g of grants) {
            const at = seen.get(g.email.toLowerCase());
            if (!at || (g.lastSeenAt && g.lastSeenAt >= at)) continue;
            await tx
              .update(accessGrants)
              .set({ lastSeenAt: at })
              .where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.id, g.id), or(isNull(accessGrants.lastSeenAt), lt(accessGrants.lastSeenAt, at))));
            n++;
          }
          return n;
        });
      }
      await recordRun(tenantId, id, "ok", `Sign-in activity synchronised: ${forConnector} access${forConnector === 1 ? "" : "es"} updated`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordRun(tenantId, id, err instanceof ConnectorError && err.scope === "item" ? "warn" : "err", `Sign-in activity: ${message}`);
    }
    updated += forConnector;
  }
  return { updated };
}

