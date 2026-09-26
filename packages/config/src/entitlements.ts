/**
 * What the product is allowed to do — independent of any notion of an offer.
 *
 * A self-hosted install gets the full core set. A deployment driven by a
 * control plane receives its entitlements resolved onto the tenant row, and
 * falls back here when they are missing.
 */
export type Entitlements = {
  /** Agent ceiling — null: none. */
  maxAgents: number | null;
  /** Mailbox ceiling — null: none. */
  maxMailboxes: number | null;
  /** Total attachment storage in bytes — null: none. */
  maxStorageBytes: number | null;
  automations: boolean;
  sla: boolean;
  csat: boolean;
  reports: boolean;
  /** Assisted triage and summaries. */
  aiBasic: boolean;
  /** Full assistance: reply suggestions, tone rewriting. */
  aiFull: boolean;
  agentSso: boolean;
  customerSso: boolean;
  customDomain: boolean;
  auditLog: boolean;
  multiBrand: boolean;
  /*
   * Service desk (spec 19). One switch per module, so that the control plane
   * can move any of them between tiers without a deployment: which ones are
   * paid is a commercial decision, and it is expected to change. The console
   * edits these per plan; the product only reads them.
   */
  /** The module itself: directory, catalogue, requests, approvals, manual provisioning, portal. */
  serviceDesk: boolean;
  /** Employees in the directory — null: no ceiling. */
  maxDeskPeople: number | null;
  /** Inbound SCIM and the Entra ID / Google Workspace / outbound SCIM connectors. */
  deskConnectors: boolean;
  /** Licence optimisation: inactive seats, renewals, spend. */
  deskLicences: boolean;
  /** Hardware inventory. */
  deskHardware: boolean;
  /** Access review campaigns and the audit evidence export. */
  deskAccessReviews: boolean;
  /** Joiners and leavers: packs, scheduled offboarding. */
  deskLifecycle: boolean;
  /** Department budgets and the three budget modes. */
  deskBudgets: boolean;
  /** Separation-of-duties rules and the second approver on privileged roles. */
  deskGovernance: boolean;
  /** Shadow IT discovery. */
  deskShadowIt: boolean;
};

/**
 * The AGPL core, without limits: everything this repository implements outside
 * the ee/ directory, which carries a separate license (see ee/LICENSE).
 */
export const CORE_ENTITLEMENTS: Entitlements = {
  maxAgents: null,
  maxMailboxes: null,
  maxStorageBytes: null,
  automations: true,
  sla: true,
  csat: true,
  reports: true,
  aiBasic: false,
  aiFull: false,
  agentSso: false,
  customerSso: false,
  customDomain: false,
  auditLog: false,
  multiBrand: false,
  // D-SD1 (26/09): the request flow is AGPL core; automation and evidence are ee/.
  serviceDesk: true,
  maxDeskPeople: null,
  deskConnectors: false,
  deskLicences: false,
  deskHardware: true,
  deskAccessReviews: false,
  deskLifecycle: false,
  deskBudgets: false,
  deskGovernance: false,
  deskShadowIt: false,
};

/** The service desk entitlement keys, in display order — the console iterates them. */
export const DESK_ENTITLEMENT_KEYS = [
  "serviceDesk",
  "maxDeskPeople",
  "deskConnectors",
  "deskLicences",
  "deskHardware",
  "deskAccessReviews",
  "deskLifecycle",
  "deskBudgets",
  "deskGovernance",
  "deskShadowIt",
] as const satisfies ReadonlyArray<keyof Entitlements>;
