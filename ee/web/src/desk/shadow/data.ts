/**
 * SD-A8 — the reads behind the shadow IT screen: the findings, and the
 * sources that feed them with their last synchronisation.
 *
 * A source is either a connector that can report usage (Google Workspace →
 * OAuth grants, Entra ID → sign-in logs) or a source that only appears in
 * the findings themselves (expenses): the screen lists both, and says when
 * nothing is connected rather than showing an empty table as a clean bill.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { deskConnectors, shadowFindings, withTenant } from "@openhelpdesk/db";

export type ShadowSourceKey = "google_oauth" | "entra_signins" | "expenses" | string;

export type ShadowSource = {
  key: ShadowSourceKey;
  status: "ok" | "error" | "idle";
  lastSyncAt: string | null;
};

export type ShadowFinding = {
  id: string;
  name: string;
  domain: string;
  iconKey: string | null;
  source: ShadowSourceKey;
  users: number;
  monthlySpendCents: number | null;
  risk: "low" | "medium" | "high";
  riskReason: string | null;
  status: "new" | "added" | "blocked" | "ignored";
  lastSeenAt: string;
};

const RISK_ORDER = { high: 0, medium: 1, low: 2 } as const;

export async function loadShadow(tenantId: string): Promise<{ sources: ShadowSource[]; findings: ShadowFinding[] }> {
  return withTenant(tenantId, async (tx) => {
    const connectors = await tx
      .select({ kind: deskConnectors.kind, status: deskConnectors.status, lastRunAt: deskConnectors.lastRunAt, lastOkAt: deskConnectors.lastOkAt })
      .from(deskConnectors)
      .where(and(eq(deskConnectors.tenantId, tenantId), inArray(deskConnectors.kind, ["google", "entra"])));
    const rows = await tx
      .select()
      .from(shadowFindings)
      .where(eq(shadowFindings.tenantId, tenantId))
      .orderBy(desc(shadowFindings.users));

    const sources = new Map<string, ShadowSource>();
    for (const c of connectors) {
      const key = c.kind === "google" ? "google_oauth" : "entra_signins";
      const at = c.lastOkAt ?? c.lastRunAt;
      sources.set(key, {
        key,
        status: c.status === "connected" ? "ok" : c.status === "error" ? "error" : "idle",
        lastSyncAt: at?.toISOString() ?? null,
      });
    }
    // Sources that only exist through their findings (expenses import…).
    for (const f of rows) {
      const cur = sources.get(f.source);
      const seen = f.lastSeenAt.toISOString();
      if (!cur) sources.set(f.source, { key: f.source, status: "ok", lastSyncAt: seen });
      else if (!connectors.length && (!cur.lastSyncAt || cur.lastSyncAt < seen)) cur.lastSyncAt = seen;
    }

    const findings: ShadowFinding[] = rows
      .map((f) => ({
        id: f.id,
        name: f.name,
        domain: f.domain,
        iconKey: f.iconKey,
        source: f.source,
        users: f.users,
        monthlySpendCents: f.monthlySpendCents,
        risk: f.risk,
        riskReason: f.riskReason,
        status: f.status,
        lastSeenAt: f.lastSeenAt.toISOString(),
      }))
      .sort(
        (a, b) =>
          Number(a.status !== "new") - Number(b.status !== "new") ||
          RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
          b.users - a.users,
      );

    const order = ["google_oauth", "entra_signins", "expenses"];
    return {
      sources: [...sources.values()].sort((a, b) => {
        const ia = order.indexOf(a.key);
        const ib = order.indexOf(b.key);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      }),
      findings,
    };
  });
}
