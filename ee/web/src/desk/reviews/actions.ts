"use server";

/**
 * SD-A4 — the writes of the access review screen. Opening and closing a
 * campaign are an administrator's decision; a line's Keep / Revoke and a
 * reminder can come from any agent working the campaign. The rules (a
 * reviewer never reviews their own access, revocations run at closing) live
 * in ee/desk, not here.
 */
import { revalidatePath } from "next/cache";
import "@/lib/desk";
import { closeAccessReview, decideReviewItem, openAccessReview, remindReviewer } from "@openhelpdesk/ee-desk";
import { deskAction } from "../shared/server";

const PATH = "/app/desk/reviews";
const SCOPES = ["all", "sensitive", "privileged"] as const;
const REVIEWERS = ["managers", "owners", "both"] as const;

export async function openReviewAction(input: {
  name: string;
  frameworks: string[];
  dueOn: string;
  scope: string;
  reviewers: string;
}) {
  return deskAction("deskAccessReviews", { managerOnly: true }, async ({ tenant, actor, t }) => {
    const name = input.name.trim();
    if (!name) throw new Error(t("desk.ee.rev.nameRequired"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) throw new Error(t("desk.ee.rev.dueRequired"));
    const scope = SCOPES.find((s) => s === input.scope) ?? "sensitive";
    const reviewers = REVIEWERS.find((s) => s === input.reviewers) ?? "managers";
    const id = await openAccessReview(
      tenant.id,
      { name, frameworks: input.frameworks.filter(Boolean), dueOn: input.dueOn, scope, reviewers },
      actor,
    );
    revalidatePath(PATH);
    return { id };
  });
}

export async function decideItemAction(itemId: string, decision: "keep" | "revoke") {
  return deskAction("deskAccessReviews", {}, async ({ tenant, actor }) => {
    await decideReviewItem(tenant.id, itemId, decision === "revoke" ? "revoke" : "keep", actor);
    revalidatePath(PATH);
    return {};
  });
}

export async function remindReviewerAction(reviewId: string, reviewerPersonId: string) {
  return deskAction("deskAccessReviews", {}, async ({ tenant, actor }) => {
    await remindReviewer(tenant.id, reviewId, reviewerPersonId, actor);
    return {};
  });
}

export async function closeReviewAction(reviewId: string) {
  return deskAction("deskAccessReviews", { managerOnly: true }, async ({ tenant, actor }) => {
    const res = await closeAccessReview(tenant.id, reviewId, actor);
    revalidatePath(PATH);
    return res;
  });
}
