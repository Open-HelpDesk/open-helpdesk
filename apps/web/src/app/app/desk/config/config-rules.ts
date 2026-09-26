/**
 * SD-A9 — what the configuration screen may store, spelled out at runtime.
 *
 * DeskConfig's unions exist only for the compiler; a server action receives
 * whatever the network sends. Each leaf lists the values a control can
 * produce, and a patch carrying anything else is refused whole — a forged
 * request cannot store a value no control offers.
 */
import { DEFAULT_DESK_CONFIG, type DeskConfig } from "@openhelpdesk/desk";
import { validSiemUrl } from "./siem";

type Rule = readonly (string | number)[] | "boolean" | "person" | "url" | "notif";

export const CONFIG_RULES: { [S in keyof DeskConfig]: { [K in keyof DeskConfig[S]]: Rule } } = {
  directory: {
    syncEveryMinutes: [15, 60, 1440],
    deprovision: ["disable_then_delete", "disable", "delete"],
    deleteAfterDays: [30, 90],
  },
  approvals: {
    remindAfterHours: [4, 24],
    escalateAfterHours: [24, 48, 72],
    whenAbsent: ["manager_of_manager", "app_owner"],
    privilegedSecondApprover: "boolean",
    enforceSod: "boolean",
  },
  budgets: { mode: ["alert", "finance", "block"], period: ["monthly", "yearly"], financePersonId: "person" },
  access: { defaultTemporaryDays: [30, 90, 180], expiryReminderDays: [3, 7, 14], revokeOnExpiry: "boolean" },
  reviews: {
    frequency: ["quarterly", "half_yearly", "yearly"],
    scope: ["all", "sensitive", "privileged"],
    reviewers: ["managers", "owners", "both"],
    whenUnanswered: ["escalate", "revoke"],
  },
  notifications: Object.fromEntries(Object.keys(DEFAULT_DESK_CONFIG.notifications).map((k) => [k, "notif"])) as {
    [K in keyof DeskConfig["notifications"]]: Rule;
  },
  lifecycle: {
    onboardingLeadDays: [1, 3, 5],
    reserveHardware: "boolean",
    offboardingAt: ["immediately", "end_of_last_day", "midnight"],
    mailForwardDays: [30, 90, 180],
    driveTransferTo: ["manager", "manager_of_manager"],
    returnLabel: "boolean",
  },
  compliance: { retentionYears: [1, 5, 10], autoEvidence: "boolean", siemWebhookUrl: "url" },
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function valid(rule: Rule, value: unknown): boolean {
  if (rule === "boolean") return typeof value === "boolean";
  if (rule === "person") return value === null || (typeof value === "string" && UUID_RE.test(value));
  if (rule === "url") return value === null || (typeof value === "string" && validSiemUrl(value) !== null);
  if (rule === "notif") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const v = value as Record<string, unknown>;
    return Object.keys(v).length === 3 && ["chat", "email", "portal"].every((c) => typeof v[c] === "boolean");
  }
  return rule.includes(value as string | number);
}

/** The patch, cleaned — or null when any part of it is not something the screen can send. */
export function sanitizeConfigPatch(patch: unknown): Record<string, Record<string, unknown>> | null {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return null;
  const clean: Record<string, Record<string, unknown>> = {};
  for (const [section, fields] of Object.entries(patch)) {
    const rules = (CONFIG_RULES as Record<string, Record<string, Rule>>)[section];
    if (!rules || typeof fields !== "object" || fields === null || Array.isArray(fields)) return null;
    for (const [key, value] of Object.entries(fields)) {
      const rule = Object.hasOwn(rules, key) ? rules[key] : undefined;
      if (!rule || !valid(rule, value)) return null;
      (clean[section] ??= {})[key] = rule === "url" && typeof value === "string" ? value.trim() : value;
    }
  }
  return Object.keys(clean).length ? clean : null;
}
