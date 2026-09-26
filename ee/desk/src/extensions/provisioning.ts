/**
 * Automatic provisioning: Entra ID, Google Workspace, outbound SCIM (deskConnectors).
 *
 * `provisionerFor` hands the core a Provisioner for a connector kind — only
 * when the tenant holds `deskConnectors`; otherwise null, and the core falls
 * back to a manual IT task. Every call, successful or not, writes one line to
 * the connector's run log and updates its health; a failure is rethrown so
 * the core turns the job into a manual task (never silent).
 */
import { and, eq } from "drizzle-orm";
import { deskConnectors } from "@openhelpdesk/db";
import type { ConnectorKind, DeskExtensions, ProvisionInput, Provisioner } from "@openhelpdesk/desk";
import { entraAddMember, entraConfig, entraRemoveMember } from "../connectors/entra";
import { googleAddMember, googleConfig, googleRemoveMember } from "../connectors/google";
import { ConnectorError } from "../connectors/http";
import { scimProvisioner } from "../connectors/scim-out";
import { hasDeskConnectors } from "../connectors/shared";
import { connectorOfKind, loadConnector, recordRun, type LoadedConnector } from "../connectors/store";

type Action = keyof Provisioner;

const DONE: Record<Action, string> = {
  create: "account created for",
  update: "account updated for",
  disable: "account deactivated for",
  delete: "account deleted for",
};

async function connectorFor(input: ProvisionInput, kind: ConnectorKind): Promise<LoadedConnector | null> {
  const byId = input.connectorId ? await loadConnector(input.tenantId, input.connectorId) : null;
  if (byId && byId.kind === kind) return byId;
  return connectorOfKind(input.tenantId, kind);
}

function required(c: LoadedConnector | null, kind: ConnectorKind): LoadedConnector {
  if (!c) throw new ConnectorError(`No ${kind} connector is configured`, "connector");
  return c;
}

/** The per-kind work, given the loaded connector. */
const IMPL: Record<Exclude<ConnectorKind, "manual">, (c: LoadedConnector | null) => Provisioner> = {
  scim: () => scimProvisioner,
  entra: (c) => {
    const cfg = () => entraConfig(required(c, "entra"));
    return {
      create: async (input) => ({ externalAccountId: await entraAddMember(cfg(), input) }),
      update: async (input) => {
        await entraAddMember(cfg(), input);
      },
      disable: (input) => entraRemoveMember(cfg(), input),
      delete: (input) => entraRemoveMember(cfg(), input),
    };
  },
  google: (c) => {
    const cfg = () => googleConfig(required(c, "google"));
    return {
      create: async (input) => ({ externalAccountId: await googleAddMember(cfg(), input) }),
      update: async (input) => {
        await googleAddMember(cfg(), input);
      },
      disable: (input) => googleRemoveMember(cfg(), input),
      delete: (input) => googleRemoveMember(cfg(), input),
    };
  },
};

function detail(input: ProvisionInput, kind: ConnectorKind): string {
  return kind === "scim" ? input.app.name : `${input.app.name} · ${input.tier.name}`;
}

export function loggedProvisioner(kind: Exclude<ConnectorKind, "manual">): Provisioner {
  const run =
    <A extends Action>(action: A) =>
    async (input: ProvisionInput): Promise<Awaited<ReturnType<Provisioner[A]>>> => {
      const connector = await connectorFor(input, kind);
      const label = detail(input, kind);
      try {
        const out = (await (IMPL[kind](connector)[action] as (i: ProvisionInput) => Promise<unknown>)(input)) as Awaited<ReturnType<Provisioner[A]>>;
        await recordRun(input.tenantId, connector?.id ?? null, "ok", `${label}: ${DONE[action]} ${input.person.name}`);
        return out;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const level = err instanceof ConnectorError && err.scope === "item" ? "warn" : "err";
        await recordRun(input.tenantId, connector?.id ?? null, level, `${label}: ${action} failed for ${input.person.name} — ${message}`).catch(() => {});
        throw err;
      }
    };
  return { create: run("create"), update: run("update"), disable: run("disable"), delete: run("delete") };
}

export const provisioningExtensions: Pick<DeskExtensions, "provisionerFor" | "connectorHealthy"> = {
  async provisionerFor(tenantId, kind) {
    if (kind === "manual") return null;
    if (!(await hasDeskConnectors(tenantId))) return null;
    return loggedProvisioner(kind);
  },

  /** Healthy = the tenant may use connectors AND the last run or test succeeded. */
  async connectorHealthy(tx, tenantId, connectorId) {
    if (!(await hasDeskConnectors(tenantId, tx))) return false;
    const [row] = await tx
      .select({ status: deskConnectors.status, kind: deskConnectors.kind })
      .from(deskConnectors)
      .where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, connectorId)));
    return !!row && row.kind !== "manual" && row.status === "connected";
  },
};
