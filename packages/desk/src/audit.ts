/**
 * The desk's journal: `audit_events`, the product's one journal (spec 19 §8).
 *
 * Doctrine rule 1 — one decision, one trace — is written here. Every line
 * carries in `after` what it takes to render it later (names frozen at the
 * time of the decision), so a screen never has to re-join five tables to say
 * "Approved by Paul Mercier (manager and owner)", and the line still reads
 * right after the approver has left.
 *
 * `action` is a stable key (`desk.request.submitted`…), not a sentence:
 * `deskAuditLine` maps it to an i18n key of the `domain` area, and
 * `describeDeskAudit` renders it with the screen's translate function.
 */
import { auditEvents, type Tx } from "@openhelpdesk/db";
import type { DeskDomainKey, DeskTranslate } from "./i18n";
import { actorColumns, actorName } from "./internal";
import type { Actor } from "./types";

export type DeskTargetType =
  | "access_request"
  | "access_grant"
  | "desk_app"
  | "person"
  | "hardware"
  | "desk_settings"
  | "provisioning_job"
  | "delegation"
  | "people_group"
  | "desk_connector"
  | "lifecycle_plan";

export const DESK_AUDIT_ACTIONS = [
  "desk.request.submitted",
  "desk.request.auto_approved",
  "desk.request.notified",
  "desk.request.cancelled",
  "desk.approval.approved",
  "desk.approval.refused",
  "desk.approval.reminded",
  "desk.approval.escalated",
  "desk.provisioning.manual_task",
  "desk.provisioning.done",
  "desk.provisioning.done_manually",
  "desk.provisioning.failed",
  "desk.grant.direct",
  "desk.grant.extended",
  "desk.grant.returned",
  "desk.grant.revoked",
  "desk.grant.expired",
  "desk.grant.expiry_notified",
  "desk.person.created",
  "desk.person.updated",
  "desk.person.manager_set",
  "desk.person.absence_set",
  "desk.person.suspended",
  "desk.person.reactivated",
  "desk.person.departed",
  "desk.group.created",
  "desk.group.updated",
  "desk.group.deleted",
  "desk.connector.created",
  "desk.connector.updated",
  "desk.connector.tested",
  "desk.connector.deleted",
  "desk.scim_token.rotated",
  "desk.delegation.created",
  "desk.delegation.deleted",
  "desk.directory.imported",
  "desk.app.created",
  "desk.app.updated",
  "desk.app.tiers_set",
  "desk.app.auto_groups_set",
  "desk.app.archived",
  "desk.hardware.created",
  "desk.hardware.updated",
  "desk.hardware.assigned",
  "desk.hardware.problem_reported",
  "desk.hardware.imported",
  "desk.tool.requested",
  "desk.config.updated",
  // Written by ee/desk (its own `journal`), rendered here with the rest.
  "desk.budget.set",
  "desk.licences.reclaimed",
  "desk.lifecycle.scheduled",
  "desk.lifecycle.cancelled",
  "desk.lifecycle.executed",
  "desk.lifecycle.task_done",
  "desk.lifecycle.task_reopened",
  "desk.pack.set",
  "desk.review.opened",
  "desk.review.decided",
  "desk.review.reminded",
  "desk.review.closed",
  "desk.shadow.discovered",
  "desk.shadow.status_changed",
  "desk.sod_rule.created",
  "desk.sod_rule.updated",
  "desk.sod_rule.deleted",
] as const;
export type DeskAuditAction = (typeof DESK_AUDIT_ACTIONS)[number];

/** Writes one journal line. `after.actor` is filled with the actor's name unless given. */
export async function writeDeskAudit(
  tx: Tx,
  tenantId: string,
  actor: Actor,
  action: DeskAuditAction,
  target: { type: DeskTargetType; id: string | null },
  after: Record<string, unknown> = {},
  before?: Record<string, unknown> | null,
): Promise<void> {
  const { actorType, actorId } = actorColumns(actor);
  const payload = "actor" in after ? after : { ...after, actor: await actorName(tx, actor) };
  await tx.insert(auditEvents).values({
    tenantId,
    actorType,
    actorId,
    action,
    targetType: target.type,
    targetId: target.id,
    before: before ?? null,
    after: payload,
  });
}

/* ---------------- Rendering ---------------- */

type P = Record<string, unknown>;
type Line = { key: DeskDomainKey; params: Record<string, string | number> };

const CONNECTOR_NAMES: Record<string, string> = { entra: "Entra ID", google: "Google Workspace", scim: "SCIM" };

function s(v: unknown, fallback = "—"): string {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}
function n(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}
function len(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

/** Two decimals, as `LocaleFormat.amount` would — the fallback when the caller gives no formatter. */
const plainAmount = (units: number) => units.toFixed(2);

/** The screen's `t.fmt` (apps/web's Translate and `domainT` both carry one), when it has one. */
function amountOf(t: DeskTranslate): ((units: number) => string) | undefined {
  const fmt = (t as unknown as { fmt?: { amount?: (units: number) => string } }).fmt;
  return typeof fmt?.amount === "function" ? (units) => fmt.amount!(units) : undefined;
}

/** Brand names of connectors are not translated; "manual" is. */
export function connectorLabel(kind: string | null | undefined): string | null {
  return kind ? (CONNECTOR_NAMES[kind] ?? null) : null;
}

function approvalKey(p: P): DeskDomainKey {
  if (p.byAgent) return "desk.domain.audit.approvedByAgent";
  if (p.onBehalf) return "desk.domain.audit.approvedDelegated";
  if (p.merged) return "desk.domain.audit.approvedMerged";
  switch (p.step) {
    case "owner":
      return "desk.domain.audit.approvedOwner";
    case "privileged":
      return "desk.domain.audit.approvedPrivileged";
    case "finance":
      return "desk.domain.audit.approvedFinance";
    default:
      return "desk.domain.audit.approvedManager";
  }
}

/**
 * The i18n key and parameters of a journal line — for screens that render
 * with their own `t`. Dates are passed through `formatDate` (the screen's
 * `t.fmt`), never printed raw; amounts (stored in cents) through
 * `formatAmount` (`t.fmt.amount`), the currency sign staying in the sentence.
 * Unknown actions return null.
 */
export function deskAuditLine(
  action: string,
  after: unknown,
  formatDate: (iso: string) => string = (d) => d,
  before?: unknown,
  formatAmount: (units: number) => string = plainAmount,
): Line | null {
  const p = (after && typeof after === "object" ? after : {}) as P;
  const b = (before && typeof before === "object" ? before : {}) as P;
  const actor = s(p.actor);
  const date = (v: unknown) => (typeof v === "string" && v ? formatDate(v) : "—");
  const cents = (v: unknown) => formatAmount(n(v) / 100);
  switch (action as DeskAuditAction) {
    case "desk.request.submitted":
      return { key: p.extension ? "desk.domain.audit.requestExtensionCreated" : "desk.domain.audit.requestCreated", params: { actor } };
    case "desk.request.auto_approved":
      return p.group
        ? { key: "desk.domain.audit.autoApprovedGroup", params: { group: s(p.group) } }
        : { key: "desk.domain.audit.autoApprovedLevel0", params: {} };
    case "desk.request.notified": {
      const key: DeskDomainKey =
        p.step === "owner"
          ? "desk.domain.audit.notifiedOwner"
          : p.step === "manager"
            ? "desk.domain.audit.notifiedManager"
            : "desk.domain.audit.notifiedOther";
      return { key, params: { approver: s(p.approver) } };
    }
    case "desk.request.cancelled":
      return { key: "desk.domain.audit.cancelled", params: { actor } };
    case "desk.approval.approved":
      return { key: approvalKey(p), params: { actor, approver: s(p.approver), onBehalf: s(p.onBehalf) } };
    case "desk.approval.refused":
      return p.byAgent
        ? { key: "desk.domain.audit.refusedByAgent", params: { actor, approver: s(p.approver) } }
        : { key: "desk.domain.audit.refused", params: { actor } };
    case "desk.approval.reminded":
      return p.automatic
        ? { key: "desk.domain.audit.remindedAuto", params: { approver: s(p.approver) } }
        : { key: "desk.domain.audit.remindedBy", params: { approver: s(p.approver), actor } };
    case "desk.approval.escalated":
      return p.approver
        ? { key: "desk.domain.audit.escalated", params: { approver: s(p.approver), previous: s(p.previous), hours: n(p.hours) } }
        : { key: "desk.domain.audit.escalatedToIt", params: { previous: s(p.previous), hours: n(p.hours) } };
    case "desk.provisioning.manual_task": {
      const removal = p.action === "disable" || p.action === "delete";
      if (p.reason === "connector_unavailable")
        return { key: removal ? "desk.domain.audit.removalTaskConnectorDown" : "desk.domain.audit.creationTaskConnectorDown", params: { connector: s(connectorLabel(s(p.connector, ""))) } };
      return { key: removal ? "desk.domain.audit.removalTask" : "desk.domain.audit.creationTask", params: {} };
    }
    case "desk.provisioning.done": {
      const connector = s(connectorLabel(s(p.connector, "")));
      const key: DeskDomainKey =
        p.action === "disable"
          ? "desk.domain.audit.accountDisabled"
          : p.action === "delete"
            ? "desk.domain.audit.accountDeleted"
            : "desk.domain.audit.accountCreated";
      return { key, params: { connector } };
    }
    case "desk.provisioning.done_manually":
      return { key: p.action === "create" || p.action === "update" ? "desk.domain.audit.accountCreatedManually" : "desk.domain.audit.accountRemovedManually", params: { actor } };
    case "desk.provisioning.failed":
      return { key: "desk.domain.audit.provisioningFailed", params: { connector: s(connectorLabel(s(p.connector, ""))), error: s(p.error) } };
    case "desk.grant.direct":
      if (p.source === "onboarding") return { key: "desk.domain.audit.onboardingGrant", params: { actor, person: s(p.person), app: s(p.app) } };
      return { key: "desk.domain.audit.directGrant", params: { actor, person: s(p.person), app: s(p.app) } };
    case "desk.grant.extended":
      return p.date
        ? { key: "desk.domain.audit.extended", params: { app: s(p.app), date: date(p.date) } }
        : { key: "desk.domain.audit.extendedPermanent", params: { app: s(p.app) } };
    case "desk.grant.returned":
      return { key: "desk.domain.audit.returned", params: { actor, app: s(p.app) } };
    case "desk.grant.revoked":
      return p.reason
        ? { key: "desk.domain.audit.revokedWithReason", params: { actor, app: s(p.app), person: s(p.person), reason: s(p.reason) } }
        : { key: "desk.domain.audit.revoked", params: { actor, app: s(p.app), person: s(p.person) } };
    case "desk.grant.expired":
      return { key: "desk.domain.audit.expired", params: { app: s(p.app), person: s(p.person), date: date(p.date) } };
    case "desk.grant.expiry_notified":
      return { key: "desk.domain.audit.expiryNotified", params: { person: s(p.person), app: s(p.app), date: date(p.date) } };
    case "desk.person.created":
      return { key: "desk.domain.audit.personCreated", params: { name: s(p.name), actor } };
    case "desk.person.updated":
      // SCIM's email change carries only the new address.
      return { key: "desk.domain.audit.personUpdated", params: { name: s(p.name ?? p.email ?? b.name), actor } };
    case "desk.person.manager_set":
      return p.manager
        ? { key: "desk.domain.audit.managerSet", params: { name: s(p.name), manager: s(p.manager) } }
        : { key: "desk.domain.audit.managerCleared", params: { name: s(p.name) } };
    case "desk.person.absence_set":
      return p.until
        ? { key: "desk.domain.audit.absenceSet", params: { name: s(p.name), date: date(p.until) } }
        : { key: "desk.domain.audit.absenceCleared", params: { name: s(p.name) } };
    case "desk.person.suspended":
      return { key: "desk.domain.audit.personSuspended", params: {} };
    case "desk.person.reactivated":
      return { key: "desk.domain.audit.personReactivated", params: {} };
    case "desk.person.departed":
      return { key: "desk.domain.audit.personDeparted", params: {} };
    case "desk.group.created":
      return { key: "desk.domain.audit.groupCreated", params: { name: s(p.name) } };
    case "desk.group.updated":
      return { key: "desk.domain.audit.groupUpdated", params: { name: s(p.name ?? b.name) } };
    case "desk.group.deleted":
      return { key: "desk.domain.audit.groupDeleted", params: { name: s(p.name ?? b.name) } };
    case "desk.connector.created":
      return { key: "desk.domain.audit.connectorCreated", params: { name: s(p.name) } };
    case "desk.connector.updated":
      return { key: "desk.domain.audit.connectorUpdated", params: { name: s(p.name ?? b.name) } };
    case "desk.connector.deleted":
      return { key: "desk.domain.audit.connectorDeleted", params: { name: s(p.name ?? b.name) } };
    case "desk.connector.tested":
      return p.ok
        ? { key: "desk.domain.audit.connectorTestOk", params: { ms: n(p.ms) } }
        : { key: "desk.domain.audit.connectorTestFailed", params: { message: s(p.message) } };
    case "desk.scim_token.rotated":
      return { key: "desk.domain.audit.scimTokenRotated", params: { suffix: s(p.suffix) } };
    case "desk.delegation.created":
      return { key: "desk.domain.audit.delegationCreated", params: { from: s(p.from), to: s(p.to), date: date(p.endsOn) } };
    case "desk.delegation.deleted":
      return { key: "desk.domain.audit.delegationDeleted", params: { from: s(p.from), to: s(p.to) } };
    case "desk.directory.imported":
      return { key: "desk.domain.audit.directoryImported", params: { created: n(p.created), updated: n(p.updated), errors: n(p.errors) } };
    case "desk.app.created":
      return { key: "desk.domain.audit.appCreated", params: { app: s(p.app), actor } };
    case "desk.app.updated":
      return { key: "desk.domain.audit.appUpdated", params: { app: s(p.app), actor } };
    case "desk.app.tiers_set":
      return { key: "desk.domain.audit.appTiersSet", params: { app: s(p.app), actor } };
    case "desk.app.auto_groups_set":
      return { key: "desk.domain.audit.appAutoGroupsSet", params: { app: s(p.app), actor } };
    case "desk.app.archived":
      return { key: "desk.domain.audit.appArchived", params: { app: s(p.app), actor } };
    case "desk.hardware.created":
      return { key: "desk.domain.audit.hardwareCreated", params: { tag: s(p.tag), model: s(p.model) } };
    case "desk.hardware.updated":
      return { key: "desk.domain.audit.hardwareUpdated", params: { tag: s(p.tag) } };
    case "desk.hardware.assigned":
      return p.person
        ? { key: "desk.domain.audit.hardwareAssigned", params: { tag: s(p.tag), person: s(p.person) } }
        : { key: "desk.domain.audit.hardwareUnassigned", params: { tag: s(p.tag) } };
    case "desk.hardware.problem_reported":
      return { key: "desk.domain.audit.hardwareProblem", params: { tag: s(p.tag), person: s(p.person) } };
    case "desk.hardware.imported":
      return { key: "desk.domain.audit.hardwareImported", params: { created: n(p.created), updated: n(p.updated), errors: n(p.errors) } };
    case "desk.tool.requested":
      return { key: "desk.domain.audit.toolRequested", params: { name: s(p.name), person: s(p.person) } };
    case "desk.config.updated":
      return { key: "desk.domain.audit.configUpdated", params: { actor } };

    /* ---- ee/desk ---- */
    case "desk.budget.set": {
      const key: DeskDomainKey =
        p.period === "monthly" ? "desk.domain.audit.budgetSetMonthly" : p.period === "yearly" ? "desk.domain.audit.budgetSetYearly" : "desk.domain.audit.budgetSet";
      return { key, params: { department: s(p.department), amount: cents(p.amountCents), actor } };
    }
    case "desk.licences.reclaimed":
      return { key: "desk.domain.audit.licencesReclaimed", params: { count: n(p.revoked), app: s(p.app), amount: cents(p.yearlySavingCents), actor } };
    case "desk.lifecycle.scheduled":
      return {
        key: p.kind === "onboarding" ? "desk.domain.audit.onboardingScheduled" : "desk.domain.audit.offboardingScheduled",
        params: { person: s(p.person), date: date(p.executeAt), actor },
      };
    case "desk.lifecycle.cancelled": {
      const onboarding = p.kind === "onboarding";
      if (p.replaced) return { key: onboarding ? "desk.domain.audit.onboardingReplaced" : "desk.domain.audit.offboardingReplaced", params: {} };
      return { key: onboarding ? "desk.domain.audit.onboardingCancelled" : "desk.domain.audit.offboardingCancelled", params: { actor } };
    }
    case "desk.lifecycle.executed":
      return {
        key: p.kind === "onboarding" ? "desk.domain.audit.onboardingExecuted" : "desk.domain.audit.offboardingExecuted",
        params: { done: n(p.automaticDone), manual: n(p.manualOpen), failed: len(p.failures) },
      };
    case "desk.lifecycle.task_done":
      return { key: "desk.domain.audit.lifecycleTaskDone", params: { actor } };
    case "desk.lifecycle.task_reopened":
      return { key: "desk.domain.audit.lifecycleTaskReopened", params: { actor } };
    case "desk.pack.set":
      return { key: "desk.domain.audit.packSet", params: { department: s(p.department ?? b.department), count: len(p.appIds), actor } };
    case "desk.review.opened":
      return { key: "desk.domain.audit.reviewOpened", params: { name: s(p.name), count: n(p.items), date: date(p.dueOn), actor } };
    case "desk.review.decided": {
      const key: DeskDomainKey =
        p.decision === "keep" ? "desk.domain.audit.reviewKept" : p.decision === "revoke" ? "desk.domain.audit.reviewRevoke" : "desk.domain.audit.reviewDecided";
      // The demo seed names the reviewer, not the actor.
      return { key, params: { app: s(p.app), person: s(p.person), actor: s(p.actor ?? p.reviewer) } };
    }
    case "desk.review.reminded":
      return { key: "desk.domain.audit.reviewReminded", params: { reviewer: s(p.reviewer), count: n(p.pending), actor } };
    case "desk.review.closed":
      return { key: "desk.domain.audit.reviewClosed", params: { name: s(p.name), revoked: n(p.revoked), kept: n(p.kept), unanswered: n(p.unanswered), actor } };
    case "desk.shadow.discovered":
      return { key: "desk.domain.audit.shadowDiscovered", params: { count: n(p.found) } };
    case "desk.shadow.status_changed": {
      const params = { name: s(p.name), actor };
      switch (p.status) {
        case "added":
          return { key: "desk.domain.audit.shadowAdded", params };
        case "blocked":
          // Nothing revokes the tokens already issued: the line says so.
          return { key: p.tokenRevocation === "not_automated" ? "desk.domain.audit.shadowBlockedTokens" : "desk.domain.audit.shadowBlocked", params };
        case "ignored":
          return { key: "desk.domain.audit.shadowIgnored", params };
        default:
          return { key: "desk.domain.audit.shadowStatusChanged", params };
      }
    }
    case "desk.sod_rule.created":
      return { key: "desk.domain.audit.sodRuleCreated", params: { reason: s(p.reason), actor } };
    case "desk.sod_rule.updated": {
      const key: DeskDomainKey =
        b.enabled === true && p.enabled === false
          ? "desk.domain.audit.sodRuleDisabled"
          : b.enabled === false && p.enabled === true
            ? "desk.domain.audit.sodRuleEnabled"
            : "desk.domain.audit.sodRuleUpdated";
      return { key, params: { reason: s(p.reason ?? b.reason), actor } };
    }
    case "desk.sod_rule.deleted":
      return { key: "desk.domain.audit.sodRuleDeleted", params: { reason: s(p.reason ?? b.reason), actor } };
  }
  return null;
}

/**
 * A journal line as a sentence: "Request created by Inès Haddad",
 * "Approved by Paul Mercier (manager and owner) — “OK for Q4”".
 * Returns the raw action for an action this version does not know.
 */
export function describeDeskAudit(
  action: string,
  after: unknown,
  t: DeskTranslate,
  formatDate?: (iso: string) => string,
  /** audit_events.before — some lines (a deletion) only carry their name there. */
  before?: unknown,
  /** Amounts, in currency units; defaults to `t.fmt.amount` when `t` carries one. */
  formatAmount?: (units: number) => string,
): string {
  const line = deskAuditLine(action, after, formatDate, before, formatAmount ?? amountOf(t));
  if (!line) return action;
  const text = t(line.key, line.params);
  const comment = (after as P | null)?.comment;
  return typeof comment === "string" && comment.trim()
    ? t("desk.domain.audit.withComment", { line: text, comment: comment.trim() })
    : text;
}
