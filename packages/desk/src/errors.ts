/**
 * Typed failures of the desk API.
 *
 * Screens catch these and render `desk.domain.error.<code>` (or the entitlement
 * locked state). A message is never shown as-is: it is English, for logs.
 */
import type { Entitlements } from "@openhelpdesk/config";

export class DeskError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "DeskError";
    this.code = code;
  }
  /** The i18n key a screen renders for this error (area `domain`). */
  get i18nKey(): string {
    return `desk.domain.error.${this.code}`;
  }
}

/** The tenant does not have the entitlement this write needs. */
export class DeskEntitlementError extends DeskError {
  readonly entitlement: keyof Entitlements;
  constructor(entitlement: keyof Entitlements, message?: string) {
    super("entitlement", message ?? `The workspace does not have the ${entitlement} entitlement`);
    this.name = "DeskEntitlementError";
    this.entitlement = entitlement;
  }
}

/** Something referenced does not exist in this tenant (or is archived). */
export class DeskNotFoundError extends DeskError {
  constructor(what: string) {
    super("not_found", `${what} not found`);
    this.name = "DeskNotFoundError";
  }
}

/** The actor may not do this (not the approver, not the requester, not an agent…). */
export class DeskForbiddenError extends DeskError {
  constructor(code = "forbidden", message?: string) {
    super(code, message);
    this.name = "DeskForbiddenError";
  }
}

/** The input or the current state refuses the operation. `code` is stable. */
export class DeskValidationError extends DeskError {
  constructor(code: string, message?: string) {
    super(code, message);
    this.name = "DeskValidationError";
  }
}

/** Every stable error code, for screens that map them (desk.domain.error.<code>). */
export const DESK_ERROR_CODES = [
  "entitlement",
  "not_found",
  "forbidden",
  "not_approver",
  "not_requester",
  "agent_only",
  "self_approval",
  "not_current_step",
  "invalid_state",
  "blocked",
  "justification_required",
  "duplicate_request",
  "active_grant",
  "tier_mismatch",
  "tier_in_use",
  "invalid_email",
  "invalid_date",
  "invalid_input",
  "manager_cycle",
  "people_limit",
  "duplicate_tag",
] as const;
export type DeskErrorCode = (typeof DESK_ERROR_CODES)[number];
