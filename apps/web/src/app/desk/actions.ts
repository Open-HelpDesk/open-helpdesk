"use server";

/**
 * Employee portal writes (spec 19 — SD-E1, E2, M1). Every one of them:
 *  - re-resolves the signed-in employee (a server action is a public endpoint);
 *  - checks the employee owns what they act on;
 *  - writes through the desk API only, as `{ kind: "person" }`, which is what
 *    the journal names.
 * They return plain results for the client to toast; messages are rendered
 * client-side from keys, so nothing here depends on the language.
 */
import { revalidatePath } from "next/cache";
import {
  cancelAccessRequest,
  createDelegation,
  decideApproval,
  deleteDelegation,
  previewCircuit,
  setAbsence,
  reportHardwareProblem,
  requestNewTool,
  returnAccess,
  submitAccessRequest,
  type Actor,
  type CircuitPreview,
} from "@/lib/desk";
import {
  approvalStatus,
  currentDelegationIds,
  isDelegationCandidate,
  ownDelegation,
  ownsGrant,
  ownsHardware,
  ownsRequest,
  previewContext,
  tenantToday,
} from "@/lib/desk/portal-data";
import { requireEmployee } from "./session";

export type ActionError =
  | "generic"
  | "justification"
  | "blocked"
  | "withdrawn"
  | "decided"
  | "not_yours"
  | "empty"
  | "invalid_date"
  | "delegate";

export type DrawerPreview = {
  preview: CircuitPreview;
  /** Person id → name, for every approver of the preview. */
  names: Record<string, string>;
  connectorName: string | null;
  /** Name of the auto-approval group, when `autoRule` is `group:<id>`. */
  autoGroupName: string | null;
  managerId: string | null;
};

const actorOf = (personId: string): Actor => ({ kind: "person", personId });

function logFailure(what: string, err: unknown) {
  console.error(`[desk portal] ${what} failed:`, err);
}

/** The drawer's circuit preview for one tier — names resolved, nothing decided. */
export async function previewAccessAction(
  appId: string,
  tierId: string,
): Promise<{ ok: true; data: DrawerPreview } | { ok: false; error: ActionError }> {
  const viewer = await requireEmployee();
  try {
    const preview = await previewCircuit(viewer.tenantId, viewer.person.id, appId, tierId);
    const ids = preview.steps
      .flatMap((s) => [s.approverPersonId, s.onBehalfOfPersonId])
      .filter((x): x is string => !!x);
    const ctx = await previewContext(viewer.tenantId, appId, ids, preview.autoRule);
    return {
      ok: true,
      data: {
        preview,
        names: ctx.names,
        connectorName: ctx.connectorName,
        autoGroupName: ctx.autoGroupName,
        managerId: viewer.person.managerId,
      },
    };
  } catch (err) {
    logFailure("previewCircuit", err);
    return { ok: false, error: "generic" };
  }
}

export async function submitAccessAction(input: {
  appId: string;
  tierId: string;
  durationDays: number | null;
  justification: string;
  extendsGrantId?: string | null;
}): Promise<
  | { ok: true; ticketNumber: number; state: string; firstApprover: string | null; automatic: boolean }
  | { ok: false; error: ActionError }
> {
  const viewer = await requireEmployee();
  const { tenantId, person } = viewer;
  const justification = input.justification.trim();
  try {
    if (input.extendsGrantId && !(await ownsGrant(tenantId, person.id, input.extendsGrantId))) {
      return { ok: false, error: "not_yours" };
    }
    // The server recomputes the circuit: what the drawer showed is advice,
    // this is the rule.
    const preview = await previewCircuit(tenantId, person.id, input.appId, input.tierId);
    if (preview.blocked) return { ok: false, error: "blocked" };
    if (preview.justificationRequired && !justification) return { ok: false, error: "justification" };
    if (!preview.durations.includes(input.durationDays)) return { ok: false, error: "generic" };
    const result = await submitAccessRequest(
      tenantId,
      {
        personId: person.id,
        appId: input.appId,
        tierId: input.tierId,
        durationDays: input.durationDays,
        justification: justification || null,
        source: "portal",
        extendsGrantId: input.extendsGrantId ?? null,
      },
      actorOf(person.id),
    );
    const firstId = preview.steps[0]?.approverPersonId ?? null;
    const ctx = firstId ? await previewContext(tenantId, input.appId, [firstId]) : null;
    revalidatePath("/desk", "layout");
    return {
      ok: true,
      ticketNumber: result.ticketNumber,
      state: result.state,
      firstApprover: firstId ? (ctx?.names[firstId] ?? null) : null,
      automatic: preview.provisioning.automatic,
    };
  } catch (err) {
    logFailure("submitAccessRequest", err);
    return { ok: false, error: "generic" };
  }
}

export async function cancelRequestAction(requestId: string): Promise<{ ok: boolean; error?: ActionError }> {
  const viewer = await requireEmployee();
  if (!(await ownsRequest(viewer.tenantId, viewer.person.id, requestId))) return { ok: false, error: "not_yours" };
  try {
    await cancelAccessRequest(viewer.tenantId, requestId, actorOf(viewer.person.id));
    revalidatePath("/desk", "layout");
    return { ok: true };
  } catch (err) {
    logFailure("cancelAccessRequest", err);
    return { ok: false, error: "generic" };
  }
}

export async function returnAccessAction(grantId: string): Promise<{ ok: boolean; error?: ActionError }> {
  const viewer = await requireEmployee();
  if (!(await ownsGrant(viewer.tenantId, viewer.person.id, grantId))) return { ok: false, error: "not_yours" };
  try {
    await returnAccess(viewer.tenantId, grantId, actorOf(viewer.person.id));
    revalidatePath("/desk", "layout");
    return { ok: true };
  } catch (err) {
    logFailure("returnAccess", err);
    return { ok: false, error: "generic" };
  }
}

export async function reportHardwareAction(
  hardwareId: string,
  message: string,
): Promise<{ ok: true; ticketNumber: number } | { ok: false; error: ActionError }> {
  const viewer = await requireEmployee();
  const text = message.trim();
  if (!text) return { ok: false, error: "empty" };
  if (!(await ownsHardware(viewer.tenantId, viewer.person.id, hardwareId))) return { ok: false, error: "not_yours" };
  try {
    const { ticketNumber } = await reportHardwareProblem(viewer.tenantId, hardwareId, viewer.person.id, text);
    return { ok: true, ticketNumber };
  } catch (err) {
    logFailure("reportHardwareProblem", err);
    return { ok: false, error: "generic" };
  }
}

export async function requestToolAction(
  name: string,
  why: string,
): Promise<{ ok: true; ticketNumber: number } | { ok: false; error: ActionError }> {
  const viewer = await requireEmployee();
  if (!name.trim() || !why.trim()) return { ok: false, error: "empty" };
  try {
    const { ticketNumber } = await requestNewTool(viewer.tenantId, viewer.person.id, name.trim(), why.trim());
    return { ok: true, ticketNumber };
  } catch (err) {
    logFailure("requestNewTool", err);
    return { ok: false, error: "generic" };
  }
}

export async function decideAction(
  approvalId: string,
  decision: "approved" | "refused",
  comment: string,
): Promise<{ ok: true; state: string } | { ok: false; error: ActionError }> {
  const viewer = await requireEmployee();
  const status = await approvalStatus(viewer.tenantId, viewer.person.id, approvalId);
  // Withdrawn in the meantime: a clear message, not an error (spec SD-M1).
  if (status !== "actionable") {
    revalidatePath("/desk", "layout");
    return { ok: false, error: status };
  }
  try {
    const { state } = await decideApproval(
      viewer.tenantId,
      approvalId,
      decision,
      comment.trim() || null,
      "portal",
      actorOf(viewer.person.id),
    );
    revalidatePath("/desk", "layout");
    return { ok: true, state };
  } catch (err) {
    logFailure("decideApproval", err);
    return { ok: false, error: "generic" };
  }
}

/** An absence longer than this is a departure, not an absence. */
const MAX_ABSENCE_DAYS = 365;

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * SD-M1 — "Absence and delegation": the signed-in person is away from today
 * until `until`, and `delegateId` decides in their place meanwhile. Always on
 * the viewer's own behalf — the delegator is the session, never a parameter.
 *
 * The absence starts today: `people.absent_until` has no start date, so an
 * absence declared for later would already route requests away now.
 */
export async function startAbsenceAction(input: {
  until: string;
  delegateId: string;
}): Promise<{ ok: true } | { ok: false; error: ActionError }> {
  const viewer = await requireEmployee();
  const { tenantId, person } = viewer;
  const today = await tenantToday(tenantId);
  const until = input.until;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < today || until > addDaysIso(today, MAX_ABSENCE_DAYS)) {
    return { ok: false, error: "invalid_date" };
  }
  if (!(await isDelegationCandidate(tenantId, person.id, input.delegateId))) return { ok: false, error: "delegate" };
  const actor = actorOf(person.id);
  try {
    // One stand-in at a time: a new declaration replaces the previous one.
    for (const id of await currentDelegationIds(tenantId, person.id, today)) {
      await deleteDelegation(tenantId, id, actor);
    }
    await createDelegation(tenantId, person.id, input.delegateId, today, until, actor);
    await setAbsence(tenantId, person.id, until, actor);
    revalidatePath("/desk", "layout");
    return { ok: true };
  } catch (err) {
    logFailure("startAbsence", err);
    return { ok: false, error: "generic" };
  }
}

/** Back early: the delegation ends and the absence with it. */
export async function endAbsenceAction(delegationId: string | null): Promise<{ ok: boolean; error?: ActionError }> {
  const viewer = await requireEmployee();
  const { tenantId, person } = viewer;
  const actor = actorOf(person.id);
  try {
    if (delegationId) {
      // Only the person who gave a delegation ends it from here.
      if (!(await ownDelegation(tenantId, person.id, delegationId))) return { ok: false, error: "not_yours" };
      await deleteDelegation(tenantId, delegationId, actor);
    }
    await setAbsence(tenantId, person.id, null, actor);
    revalidatePath("/desk", "layout");
    return { ok: true };
  } catch (err) {
    logFailure("endAbsence", err);
    return { ok: false, error: "generic" };
  }
}
