"use server";

/**
 * SD-A1 — what an IT agent does to an access request. Every write goes through
 * the desk API, which checks the rules again and writes the audit line.
 */
import { revalidatePath } from "next/cache";
import { decideApproval, markProvisioned, remindApprover, revokeAccess } from "@/lib/desk";
import { attempt, requireDeskAgent, type DeskActionResult } from "@/lib/desk/it-guard";
import { personOfAgent } from "@/lib/desk/it-data";
import { getT } from "@/i18n/server";

function refresh() {
  revalidatePath("/app/desk", "layout");
}

export async function remindAction(requestId: string): Promise<DeskActionResult> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent();
    await remindApprover(tenant.id, requestId, actor);
    refresh();
    return undefined;
  });
}

/**
 * The agent decides as the application owner. The decision is taken by the
 * PERSON the agent is in the directory — the approver on file — never by the
 * agent's role: an agent who is not the owner cannot approve (rule 3).
 */
export async function decideAsOwnerAction(
  approvalId: string,
  decision: "approved" | "refused",
  comment: string | null,
): Promise<DeskActionResult<{ state: string }>> {
  return attempt(async () => {
    const { tenant, agent } = await requireDeskAgent();
    const me = await personOfAgent(tenant.id, agent.id);
    if (!me) {
      const t = await getT();
      throw new Error(t("desk.it.detail.noApprover"));
    }
    const res = await decideApproval(
      tenant.id,
      approvalId,
      decision,
      comment?.trim() || null,
      "web",
      { kind: "person", personId: me.id },
    );
    refresh();
    return res;
  });
}

export async function markProvisionedAction(jobId: string): Promise<DeskActionResult> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent();
    await markProvisioned(tenant.id, jobId, actor);
    refresh();
    return undefined;
  });
}

export async function revokeAction(grantId: string, reason: string): Promise<DeskActionResult> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent();
    const why = reason.trim();
    if (!why) {
      const t = await getT();
      throw new Error(t("desk.it.detail.revokeReason"));
    }
    await revokeAccess(tenant.id, grantId, why, actor);
    refresh();
    return undefined;
  });
}
