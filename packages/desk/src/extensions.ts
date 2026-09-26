/**
 * The seam between the AGPL core and ee/.
 *
 * The core never imports ee code. Instead, the applications (apps/web,
 * apps/worker) register the ee implementation at start-up with
 * `registerDeskExtensions(eeDeskExtensions)` — see ee/desk. Without it, every
 * hook below is absent and the core behaves as the AGPL edition: manual
 * provisioning only, no budget, no separation of duties, no second approver.
 *
 * Hooks are ALSO gated by entitlements inside ee/desk: registering them does
 * not by itself open a feature the tenant has not paid for.
 */
import type { Tx } from "@openhelpdesk/db";
import type { BudgetCheck, CircuitStep, ConnectorKind, Provisioner } from "./types";
import type { DeskConfig } from "./config";

export type CircuitContext = {
  tx: Tx;
  tenantId: string;
  config: DeskConfig;
  person: { id: string; department: string | null; managerId: string | null };
  app: { id: string; ownerPersonId: string | null; approvalLevels: number };
  tier: { id: string; privileged: boolean; monthlyCostCents: number };
  /** The core steps already computed (manager, owner, merged). */
  steps: CircuitStep[];
};

export type CircuitExtension = {
  extraSteps: CircuitStep[];
  budget: BudgetCheck | null;
  sodConflict: { ruleId: string; reason: string } | null;
  blocked: string | null;
};

export interface DeskExtensions {
  /** Budget, SoD, privileged second approver (deskBudgets, deskGovernance). */
  extendCircuit?(ctx: CircuitContext): Promise<CircuitExtension>;
  /** The automatic provisioner for a connector kind, or null (deskConnectors). */
  provisionerFor?(tenantId: string, kind: ConnectorKind): Promise<Provisioner | null>;
  /** Is the connector attached to this app healthy right now? */
  connectorHealthy?(tx: Tx, tenantId: string, connectorId: string): Promise<boolean>;
}

let registered: DeskExtensions = {};

export function registerDeskExtensions(ext: DeskExtensions): void {
  registered = ext;
}

export function deskExtensions(): DeskExtensions {
  return registered;
}
