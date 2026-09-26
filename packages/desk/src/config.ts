/**
 * The configuration screen (SD-A9) as data. Stored in desk_settings.config and
 * always read through `resolveDeskConfig`, so a setting added later keeps its
 * default on existing rows. Defaults are the design's (Service Desk.html, DEF).
 */
import type { BudgetMode } from "./types";

export type DeskConfig = {
  directory: {
    /** Sync frequency for API-based directory sources, in minutes. */
    syncEveryMinutes: 15 | 60 | 1440;
    /** What happens to an account at the IdP when a person departs. */
    deprovision: "disable_then_delete" | "disable" | "delete";
    deleteAfterDays: 30 | 90;
  };
  approvals: {
    remindAfterHours: 4 | 24;
    escalateAfterHours: 24 | 48 | 72;
    /** Who approves when the manager is absent and has no delegate. */
    whenAbsent: "manager_of_manager" | "app_owner";
    /** Privileged tiers need a second approver (deskGovernance). */
    privilegedSecondApprover: boolean;
    /** Enforce separation-of-duties rules (deskGovernance). */
    enforceSod: boolean;
  };
  budgets: {
    mode: BudgetMode;
    period: "monthly" | "yearly";
    /** The finance approver used by mode "finance". */
    financePersonId: string | null;
  };
  access: {
    defaultTemporaryDays: 30 | 90 | 180;
    expiryReminderDays: 3 | 7 | 14;
    revokeOnExpiry: boolean;
  };
  reviews: {
    frequency: "quarterly" | "half_yearly" | "yearly";
    scope: "all" | "sensitive" | "privileged";
    reviewers: "managers" | "owners" | "both";
    whenUnanswered: "escalate" | "revoke";
  };
  /** event × channel matrix. */
  notifications: Record<DeskNotificationEvent, Record<"chat" | "email" | "portal", boolean>>;
  lifecycle: {
    onboardingLeadDays: 1 | 3 | 5;
    reserveHardware: boolean;
    offboardingAt: "immediately" | "end_of_last_day" | "midnight";
    mailForwardDays: 30 | 90 | 180;
    driveTransferTo: "manager" | "manager_of_manager";
    returnLabel: boolean;
  };
  compliance: {
    retentionYears: 1 | 5 | 10;
    autoEvidence: boolean;
    /** Signed webhook receiving every desk audit event (SIEM). */
    siemWebhookUrl: string | null;
  };
};

export type DeskNotificationEvent =
  | "request_to_approve"
  | "request_decided"
  | "access_ready"
  | "access_expiring"
  | "review_opened"
  | "offboarding_scheduled"
  | "connector_error";

export const DEFAULT_DESK_CONFIG: DeskConfig = {
  directory: { syncEveryMinutes: 60, deprovision: "disable_then_delete", deleteAfterDays: 30 },
  approvals: {
    remindAfterHours: 24,
    escalateAfterHours: 48,
    whenAbsent: "manager_of_manager",
    privilegedSecondApprover: true,
    enforceSod: true,
  },
  budgets: { mode: "alert", period: "monthly", financePersonId: null },
  access: { defaultTemporaryDays: 90, expiryReminderDays: 7, revokeOnExpiry: true },
  reviews: { frequency: "quarterly", scope: "sensitive", reviewers: "managers", whenUnanswered: "escalate" },
  notifications: {
    request_to_approve: { chat: true, email: true, portal: true },
    request_decided: { chat: true, email: false, portal: true },
    access_ready: { chat: true, email: false, portal: true },
    access_expiring: { chat: true, email: true, portal: true },
    review_opened: { chat: true, email: true, portal: false },
    offboarding_scheduled: { chat: true, email: true, portal: false },
    connector_error: { chat: true, email: true, portal: false },
  },
  lifecycle: {
    onboardingLeadDays: 3,
    reserveHardware: true,
    offboardingAt: "end_of_last_day",
    mailForwardDays: 90,
    driveTransferTo: "manager",
    returnLabel: true,
  },
  compliance: { retentionYears: 5, autoEvidence: true, siemWebhookUrl: null },
};

type Plain = Record<string, unknown>;
function isPlain(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function merge<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined ? base : (over as T));
  const out: Plain = { ...base };
  for (const k of Object.keys(base)) {
    if (k in over) out[k] = merge((base as Plain)[k], over[k]);
  }
  return out as T;
}

/** Stored JSON → full config. Unknown keys are dropped, missing keys take their default. */
export function resolveDeskConfig(stored: unknown): DeskConfig {
  return merge(DEFAULT_DESK_CONFIG, stored);
}
