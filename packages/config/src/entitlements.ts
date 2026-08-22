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
};
