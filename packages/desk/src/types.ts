/**
 * Shared vocabulary of the service desk (spec 19). Every package and screen
 * speaks these types; changing one is a contract change between agents.
 */

/** Who did something — written verbatim into audit_events.actor_type/actor_id. */
export type Actor =
  | { kind: "agent"; userId: string }
  | { kind: "person"; personId: string }
  | { kind: "rule"; rule: string }
  | { kind: "scim" }
  | { kind: "system" };

export type ConnectorKind = "entra" | "google" | "scim" | "manual";
export type ApprovalStepName = "manager" | "owner" | "privileged" | "finance";
export type DecisionChannel = "web" | "portal" | "slack" | "teams" | "email" | "rule" | "api";

export type AccessRequestState =
  | "awaiting_manager"
  | "awaiting_owner"
  | "awaiting_extra"
  | "provisioning"
  | "active"
  | "refused"
  | "cancelled"
  | "provisioning_failed";

/** One step of the approval circuit, as previewed to the requester and stored. */
export type CircuitStep = {
  step: ApprovalStepName;
  /** null when nobody can approve (no manager on file) — the request cannot be sent. */
  approverPersonId: string | null;
  /** The absent manager this step was delegated from / escalated past. */
  onBehalfOfPersonId: string | null;
  /** A single approval covering several steps: manager who is also the owner. */
  mergedSteps: ApprovalStepName[];
};

export type BudgetMode = "alert" | "finance" | "block";

export type BudgetCheck = {
  department: string;
  spendCents: number;
  budgetCents: number;
  /** > 0 when approving would exceed the budget. */
  overCents: number;
  mode: BudgetMode;
};

/** What the drawer of SD-E1 shows, and what submission re-computes server-side. */
export type CircuitPreview = {
  /** 0 = auto-approved (no human step). */
  effectiveLevels: number;
  /** e.g. `level0` or `group:<groupId>` — why no human is needed. */
  autoRule: string | null;
  steps: CircuitStep[];
  provisioning: {
    kind: ConnectorKind;
    /** True when a healthy connector will create the account (spec rule 5). */
    automatic: boolean;
  };
  budget: BudgetCheck | null;
  sodConflict: { ruleId: string; reason: string } | null;
  /** A reason the request cannot be sent at all (no manager, SoD, budget "block"). */
  blocked: string | null;
  /** Allowed durations in days; null in the list = permanent. */
  durations: Array<number | null>;
  justificationRequired: boolean;
};

/** Input handed to an automatic provisioner (ee connectors). */
export type ProvisionInput = {
  tenantId: string;
  connectorId: string | null;
  app: { id: string; slug: string; name: string; scimBaseUrl: string | null; scimToken: string | null };
  tier: { id: string; name: string; externalGroup: string | null };
  person: { id: string; email: string; name: string; externalId: string | null; department: string | null };
  /** Set on disable/delete, and on update. */
  externalAccountId: string | null;
};

export interface Provisioner {
  create(input: ProvisionInput): Promise<{ externalAccountId: string }>;
  update(input: ProvisionInput): Promise<void>;
  disable(input: ProvisionInput): Promise<void>;
  delete(input: ProvisionInput): Promise<void>;
}
