/**
 * The approval circuit, as a pure function (spec 19 §3.1, §4 rules 2–3, §7).
 *
 * Deterministic and database-free on purpose: the rule decides, never the
 * model, and a rule an auditor must be able to read is a rule a unit test must
 * be able to pin. `previewCircuit` and `submitAccessRequest` load the inputs
 * and call this; ee/ extensions are merged afterwards.
 */
import type { DeskConfig } from "./config";
import type { CircuitStep } from "./types";

export type CircuitPerson = {
  id: string;
  managerId: string | null;
  /** YYYY-MM-DD — absent while today ≤ absentUntil. */
  absentUntil: string | null;
  status: "active" | "leaving" | "departed" | "suspended";
};

export type CoreCircuitInput = {
  requester: CircuitPerson;
  app: { ownerPersonId: string | null; approvalLevels: number; maxDurationDays: number | null };
  /** Auto-approval groups of the app, in a stable order. */
  autoGroupIds: string[];
  /** Groups the requester belongs to. */
  requesterGroupIds: string[];
  /** Everybody the resolution may walk through (managers, owners, delegates). */
  people: Map<string, CircuitPerson>;
  /** Active delegations today: absent person → delegate. */
  delegations: Map<string, string>;
  whenAbsent: DeskConfig["approvals"]["whenAbsent"];
  /** YYYY-MM-DD in the tenant time zone. */
  today: string;
  /** Extension of a temporary grant: always at least a manager (design SD-E2). */
  minLevels?: number;
};

export type CoreCircuit = {
  effectiveLevels: number;
  autoRule: string | null;
  steps: CircuitStep[];
  blocked: string | null;
  durations: Array<number | null>;
};

/** Allowed durations: unlimited → permanent/90/30, 90 → 90/30, 30 → 30. */
export function durationsFor(maxDurationDays: number | null): Array<number | null> {
  if (maxDurationDays === null || maxDurationDays <= 0) return [null, 90, 30];
  return [maxDurationDays, ...[90, 30].filter((d) => d < maxDurationDays)];
}

function unavailable(p: CircuitPerson | undefined, today: string): boolean {
  if (!p) return true;
  if (p.status === "departed" || p.status === "suspended") return true;
  return p.absentUntil !== null && p.absentUntil >= today;
}

type Resolved = { approverPersonId: string | null; onBehalfOfPersonId: string | null };

/**
 * Who actually approves in place of `candidateId`.
 *
 *  - never the requester (rule 3): the step goes up to the candidate's manager;
 *  - an absent candidate hands over to their active delegate, otherwise to
 *    `whenAbsent` (their own manager, or the app owner);
 *  - `onBehalfOfPersonId` names the first absent person passed over.
 */
function resolveApprover(input: CoreCircuitInput, candidateId: string | null): Resolved {
  const { people, requester, today } = input;
  let current = candidateId;
  let onBehalf: string | null = null;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) break; // a cycle in the org chart: nobody can approve
    seen.add(current);
    const person = people.get(current);
    if (current === requester.id) {
      // Rule 3 — the requester is never their own approver: one level up.
      current = person?.managerId ?? null;
      continue;
    }
    if (!unavailable(person, today)) return { approverPersonId: current, onBehalfOfPersonId: onBehalf };
    onBehalf ??= current;
    const delegate = input.delegations.get(current);
    if (delegate && delegate !== requester.id && !seen.has(delegate) && !unavailable(people.get(delegate), today)) {
      return { approverPersonId: delegate, onBehalfOfPersonId: onBehalf };
    }
    if (input.whenAbsent === "app_owner" && input.app.ownerPersonId && !seen.has(input.app.ownerPersonId)) {
      current = input.app.ownerPersonId;
      continue;
    }
    current = person?.managerId ?? null;
  }
  return { approverPersonId: null, onBehalfOfPersonId: onBehalf };
}

export function computeCoreCircuit(input: CoreCircuitInput): CoreCircuit {
  const levels = Math.max(0, Math.min(2, input.app.approvalLevels));
  let effectiveLevels = levels;
  let autoRule: string | null = null;
  if (levels === 0) {
    autoRule = "level0";
  } else {
    const mine = new Set(input.requesterGroupIds);
    const group = input.autoGroupIds.find((g) => mine.has(g));
    if (group) {
      effectiveLevels = 0;
      autoRule = `group:${group}`;
    }
  }
  if (input.minLevels && effectiveLevels < input.minLevels) {
    effectiveLevels = Math.min(2, input.minLevels);
    autoRule = null;
  }

  const steps: CircuitStep[] = [];
  let blocked: string | null = null;
  if (effectiveLevels >= 1) {
    const manager = resolveApprover(input, input.requester.managerId);
    if (effectiveLevels >= 2) {
      const owner = resolveApprover(input, input.app.ownerPersonId);
      if (manager.approverPersonId && manager.approverPersonId === owner.approverPersonId) {
        // The manager is also the owner: one approval covers both steps.
        steps.push({ step: "manager", ...manager, mergedSteps: ["manager", "owner"] });
      } else {
        steps.push({ step: "manager", ...manager, mergedSteps: [] });
        steps.push({ step: "owner", ...owner, mergedSteps: [] });
      }
    } else {
      steps.push({ step: "manager", ...manager, mergedSteps: [] });
    }
    const missing = steps.find((st) => !st.approverPersonId);
    if (missing) {
      blocked = missing.step === "owner" ? "no_owner" : "no_manager";
    }
  }

  return {
    effectiveLevels: steps.length,
    autoRule: steps.length === 0 ? autoRule : null,
    steps,
    blocked,
    durations: durationsFor(input.app.maxDurationDays),
  };
}

/** The request state while `step` is the pending one. */
export function stateForStep(step: CircuitStep["step"]): "awaiting_manager" | "awaiting_owner" | "awaiting_extra" {
  if (step === "manager") return "awaiting_manager";
  if (step === "owner") return "awaiting_owner";
  return "awaiting_extra";
}
