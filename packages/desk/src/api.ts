/**
 * The core service desk API — the only way screens and jobs write desk data.
 *
 * Every function:
 *  - runs inside `withTenant(tenantId, …)` (RLS) unless given a `tx`;
 *  - checks the `serviceDesk` entitlement where it writes;
 *  - writes one `audit_events` row per transition (doctrine rule 1);
 *  - returns plain serialisable data (screens pass it to client components).
 *
 * Reads for screens may be written next to the screens (apps/web/src/lib/desk);
 * writes must go through here.
 */
import * as catalogue from "./catalogue";
import * as directory from "./directory";
import * as grants from "./grants";
import * as hardware from "./hardware";
import * as provisioning from "./provisioning";
import * as requests from "./requests";
import * as settings from "./settings";
import * as sweeps from "./sweeps";
import type { Actor, CircuitPreview, DecisionChannel } from "./types";
import type { DeskConfig } from "./config";

/* ---------------- Directory ---------------- */

export type PersonInput = {
  email: string;
  name: string;
  title?: string | null;
  department?: string | null;
  /** Manager by email (CSV, SCIM) — resolved to managerId. */
  managerEmail?: string | null;
  startsOn?: string | null;
  leavesOn?: string | null;
  externalId?: string | null;
  source?: "scim" | "csv" | "entra" | "google" | "manual";
};

/** Creates or updates a person AND its paired contact. Returns the person id. */
export async function upsertPerson(tenantId: string, input: PersonInput, actor: Actor): Promise<{ personId: string; created: boolean }> {
  return directory.upsertPerson(tenantId, input, actor);
}

export type CsvImportReport = { created: number; updated: number; errors: Array<{ line: number; message: string }> };

/** Columns: email, name, title, department, manager_email, starts_on, leaves_on. Resolves managers in a second pass. */
export async function importPeopleCsv(tenantId: string, csv: string, actor: Actor): Promise<CsvImportReport> {
  return directory.importPeopleCsv(tenantId, csv, actor);
}

export async function setManager(tenantId: string, personId: string, managerId: string | null, actor: Actor): Promise<void> {
  return directory.setManager(tenantId, personId, managerId, actor);
}

export async function setAbsence(tenantId: string, personId: string, absentUntil: string | null, actor: Actor): Promise<void> {
  return directory.setAbsence(tenantId, personId, absentUntil, actor);
}

export async function createDelegation(tenantId: string, fromPersonId: string, toPersonId: string, startsOn: string, endsOn: string, actor: Actor): Promise<string> {
  return directory.createDelegation(tenantId, fromPersonId, toPersonId, startsOn, endsOn, actor);
}

export async function deleteDelegation(tenantId: string, delegationId: string, actor: Actor): Promise<void> {
  return directory.deleteDelegation(tenantId, delegationId, actor);
}

/** The person behind a portal contact — null when the contact is a customer, not an employee. */
export async function personForContact(tenantId: string, contactId: string): Promise<{ id: string; name: string; department: string | null; isManager: boolean } | null> {
  return directory.personForContact(tenantId, contactId);
}

/* ---------------- Catalogue ---------------- */

export type AppInput = {
  name: string;
  slug?: string;
  category: string;
  description?: string;
  iconKey?: string | null;
  color?: string | null;
  ownerPersonId?: string | null;
  approvalLevels?: 0 | 1 | 2;
  maxDurationDays?: number | null;
  visible?: boolean;
  connectorId?: string | null;
  scimBaseUrl?: string | null;
  scimToken?: string | null;
  seatsPurchased?: number | null;
  renewsOn?: string | null;
};

export async function createApp(tenantId: string, input: AppInput, actor: Actor): Promise<string> {
  return catalogue.createApp(tenantId, input, actor);
}

export async function updateApp(tenantId: string, appId: string, patch: Partial<AppInput>, actor: Actor): Promise<void> {
  return catalogue.updateApp(tenantId, appId, patch, actor);
}

export type TierInput = { id?: string; name: string; monthlyCostCents: number; privileged?: boolean; externalGroup?: string | null };

export async function setTiers(tenantId: string, appId: string, tiers: TierInput[], actor: Actor): Promise<void> {
  return catalogue.setTiers(tenantId, appId, tiers, actor);
}

export async function setAutoGroups(tenantId: string, appId: string, groupIds: string[], actor: Actor): Promise<void> {
  return catalogue.setAutoGroups(tenantId, appId, groupIds, actor);
}

export async function archiveApp(tenantId: string, appId: string, actor: Actor): Promise<void> {
  return catalogue.archiveApp(tenantId, appId, actor);
}

/** Computed groups `everyone` and `department:<name>` kept in sync with the directory. */
export async function ensureComputedGroups(tenantId: string): Promise<void> {
  return directory.ensureComputedGroups(tenantId);
}

/* ---------------- Requests ---------------- */

export async function previewCircuit(tenantId: string, personId: string, appId: string, tierId: string): Promise<CircuitPreview> {
  return requests.previewCircuit(tenantId, personId, appId, tierId);
}

export type SubmitInput = {
  personId: string;
  appId: string;
  tierId: string;
  durationDays: number | null;
  justification: string | null;
  source?: "portal" | "slack" | "teams" | "api";
  extendsGrantId?: string | null;
};

/** Creates the ticket (type access_request) + request + approval rows, or auto-approves and queues provisioning. */
export async function submitAccessRequest(tenantId: string, input: SubmitInput, actor: Actor): Promise<{ requestId: string; ticketNumber: number; state: string }> {
  return requests.submitAccessRequest(tenantId, input, actor);
}

/** Approve or refuse a pending approval. Advances the circuit; the last approval queues provisioning. */
export async function decideApproval(
  tenantId: string,
  approvalId: string,
  decision: "approved" | "refused",
  comment: string | null,
  via: DecisionChannel,
  actor: Actor,
): Promise<{ state: string }> {
  return requests.decideApproval(tenantId, approvalId, decision, comment, via, actor);
}

export async function cancelAccessRequest(tenantId: string, requestId: string, actor: Actor): Promise<void> {
  return requests.cancelAccessRequest(tenantId, requestId, actor);
}

export async function remindApprover(tenantId: string, requestId: string, actor: Actor): Promise<void> {
  return requests.remindApprover(tenantId, requestId, actor);
}

/** IT ticks a manual provisioning task: the grant becomes active. */
export async function markProvisioned(tenantId: string, jobId: string, actor: Actor): Promise<void> {
  return provisioning.markProvisioned(tenantId, jobId, actor);
}

/* ---------------- Grants ---------------- */

/** The employee gives an access back — the seat returns to the pool. */
export async function returnAccess(tenantId: string, grantId: string, actor: Actor): Promise<void> {
  return grants.returnAccess(tenantId, grantId, actor);
}

export async function revokeAccess(tenantId: string, grantId: string, reason: string, actor: Actor): Promise<void> {
  return grants.revokeAccess(tenantId, grantId, reason, actor);
}

/** Direct assignment by an agent: bypasses the circuit, and says so in the journal. */
export async function directGrant(
  tenantId: string,
  personId: string,
  appId: string,
  tierId: string,
  durationDays: number | null,
  actor: Actor,
  /** Additive: `onboarding` when an arrival plan grants its pack (ee lifecycle). */
  opts?: { source?: "direct" | "onboarding" },
): Promise<string> {
  return grants.directGrant(tenantId, personId, appId, tierId, durationDays, actor, opts);
}

/* ---------------- Hardware (core) ---------------- */

export type HardwareInput = {
  tag: string;
  model: string;
  type: string;
  serial?: string | null;
  assignedPersonId?: string | null;
  status?: "assigned" | "in_stock" | "in_repair" | "to_recover" | "retired";
  warrantyEndsOn?: string | null;
  purchasedOn?: string | null;
  costCents?: number | null;
};

export async function upsertHardware(tenantId: string, input: HardwareInput & { id?: string }, actor: Actor): Promise<string> {
  return hardware.upsertHardware(tenantId, input, actor);
}

/** Columns: tag, model, type, serial, assigned_email, status, warranty_ends_on. */
export async function importHardwareCsv(tenantId: string, csv: string, actor: Actor): Promise<CsvImportReport> {
  return hardware.importHardwareCsv(tenantId, csv, actor);
}

/** Creates a ticket for IT ("Report a problem"). */
export async function reportHardwareProblem(tenantId: string, hardwareId: string, personId: string, message: string): Promise<{ ticketNumber: number }> {
  return hardware.reportHardwareProblem(tenantId, hardwareId, personId, message);
}

/** "Demander un nouvel outil": a regular ticket of type tool_request. */
export async function requestNewTool(tenantId: string, personId: string, name: string, why: string): Promise<{ ticketNumber: number }> {
  return hardware.requestNewTool(tenantId, personId, name, why);
}

/* ---------------- Settings ---------------- */

export async function getDeskConfig(tenantId: string): Promise<DeskConfig> {
  return settings.getDeskConfig(tenantId);
}

export async function updateDeskConfig(tenantId: string, patch: DeepPartial<DeskConfig>, actor: Actor): Promise<DeskConfig> {
  return settings.updateDeskConfig(tenantId, patch, actor);
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/* ---------------- Jobs (apps/worker) ---------------- */

/** Runs due provisioning jobs through the registered provisioner; failure → manual task, never silent. */
export async function runProvisioningJobs(limit?: number): Promise<{ done: number; failed: number; manual: number }> {
  return provisioning.runProvisioningJobs(limit);
}

/** Reminds approvers after remindAfterHours, escalates after escalateAfterHours. */
export async function sweepApprovalReminders(): Promise<{ reminded: number; escalated: number }> {
  return sweeps.sweepApprovalReminders();
}

/** Notifies before expiry, revokes on expiry (access.revokeOnExpiry). */
export async function sweepGrantExpiries(): Promise<{ notified: number; revoked: number }> {
  return sweeps.sweepGrantExpiries();
}
