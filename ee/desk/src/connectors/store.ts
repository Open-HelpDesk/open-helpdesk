/**
 * Connector rows: loading them with their secrets decrypted, and writing
 * what they did — one `desk_connector_runs` line per run, and the status,
 * `lastOkAt`, `lastError` the configuration screen shows.
 */
import { and, asc, eq } from "drizzle-orm";
import { decryptSecret, decryptSecrets } from "@openhelpdesk/crypto";
import { deskConnectorRuns, deskConnectors, withTenant } from "@openhelpdesk/db";
import type { ConnectorKind } from "@openhelpdesk/desk";

export type LoadedConnector = {
  id: string;
  tenantId: string;
  kind: ConnectorKind;
  name: string;
  status: string;
  settings: Record<string, unknown>;
  secrets: Record<string, string>;
};

type Row = typeof deskConnectors.$inferSelect;

function loaded(row: Row): LoadedConnector {
  return {
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind,
    name: row.name,
    status: row.status,
    settings: (row.settings as Record<string, unknown> | null) ?? {},
    secrets: decryptSecrets(row.secrets),
  };
}

export async function loadConnector(tenantId: string, connectorId: string): Promise<LoadedConnector | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(deskConnectors).where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, connectorId)));
    return row ? loaded(row) : null;
  });
}

/** The tenant's connector of a kind — the oldest, when several exist. */
export async function connectorOfKind(tenantId: string, kind: ConnectorKind): Promise<LoadedConnector | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(deskConnectors)
      .where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.kind, kind)))
      .orderBy(asc(deskConnectors.createdAt))
      .limit(1);
    return row ? loaded(row) : null;
  });
}

export type RunLevel = "ok" | "warn" | "err";

/**
 * One line of the "last runs" list, and the connector's health with it:
 * `ok` → connected, `err` → error (with the message), `warn` → unchanged.
 */
export async function recordRun(tenantId: string, connectorId: string | null, level: RunLevel, message: string): Promise<void> {
  if (!connectorId) return;
  const now = new Date();
  await withTenant(tenantId, async (tx) => {
    await tx.insert(deskConnectorRuns).values({ tenantId, connectorId, level, message: message.slice(0, 500) });
    const patch: Partial<Row> =
      level === "ok"
        ? { status: "connected", lastOkAt: now, lastRunAt: now, lastError: null, updatedAt: now }
        : level === "err"
          ? { status: "error", lastRunAt: now, lastError: message.slice(0, 500), updatedAt: now }
          : { lastRunAt: now, updatedAt: now };
    await tx.update(deskConnectors).set(patch).where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, connectorId)));
  });
}

/**
 * The application's outbound SCIM token. The catalogue screen hands the core
 * whatever the admin typed; if it arrives encrypted (`v1.…` from
 * @openhelpdesk/crypto) it is decrypted here, otherwise used as stored.
 */
export function appScimToken(stored: string | null): string | null {
  if (!stored) return null;
  if (/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(stored)) return decryptSecret(stored) ?? stored;
  return stored;
}
