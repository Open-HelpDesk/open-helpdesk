/**
 * SD-A4 — the reads behind the access review screen.
 *
 * The campaign shown is the open one (at most one at a time); without it the
 * screen offers to open one, and names the last closed campaign so its
 * evidence stays one click away.
 *
 * Signals are recomputed from the data rather than trusted from the item row:
 * "leaving" from the person's leave date, "unused" from a KNOWN last sign-in
 * older than the application's threshold. The stored `signal` is only a
 * fallback when neither can be computed.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  accessGrants,
  accessReviewItems,
  accessReviews,
  deskAppTiers,
  deskApps,
  people,
  withTenant,
} from "@openhelpdesk/db";
import { daysSince } from "../shared/format";

export type ReviewItem = {
  id: string;
  personName: string;
  appName: string;
  appIconKey: string | null;
  appColor: string | null;
  tierName: string;
  lastSeenAt: string | null;
  decision: "pending" | "keep" | "revoke";
  decidedAt: string | null;
  signal:
    | { kind: "leaving"; on: string }
    | { kind: "unused"; days: number }
    | { kind: "other"; text: string }
    | null;
};

export type Reviewer = {
  personId: string | null;
  name: string;
  department: string | null;
  total: number;
  done: number;
};

export type ReviewCampaign = {
  id: string;
  name: string;
  frameworks: string[];
  state: "draft" | "open" | "closed";
  opensOn: string;
  dueOn: string;
  scope: string;
  total: number;
  done: number;
  revokes: number;
  reviewers: Reviewer[];
};

export type ReviewData =
  | { campaign: null; lastClosed: { id: string; name: string; closedAt: string | null } | null }
  | { campaign: ReviewCampaign; selected: Reviewer | null; items: ReviewItem[] };

export async function loadReview(tenantId: string, reviewerParam: string | undefined, now = new Date()): Promise<ReviewData> {
  return withTenant(tenantId, async (tx) => {
    const [campaign] = await tx
      .select()
      .from(accessReviews)
      .where(and(eq(accessReviews.tenantId, tenantId), inArray(accessReviews.state, ["open", "draft"])))
      .orderBy(desc(accessReviews.createdAt))
      .limit(1);

    if (!campaign) {
      const [last] = await tx
        .select({ id: accessReviews.id, name: accessReviews.name, closedAt: accessReviews.closedAt })
        .from(accessReviews)
        .where(and(eq(accessReviews.tenantId, tenantId), eq(accessReviews.state, "closed")))
        .orderBy(desc(accessReviews.closedAt))
        .limit(1);
      return {
        campaign: null,
        lastClosed: last ? { id: last.id, name: last.name, closedAt: last.closedAt?.toISOString() ?? null } : null,
      };
    }

    const grantee = alias(people, "grantee");
    const reviewer = alias(people, "reviewer");
    const rows = await tx
      .select({
        id: accessReviewItems.id,
        decision: accessReviewItems.decision,
        decidedAt: accessReviewItems.decidedAt,
        signal: accessReviewItems.signal,
        signalDetail: accessReviewItems.signalDetail,
        reviewerId: accessReviewItems.reviewerPersonId,
        reviewerName: reviewer.name,
        reviewerDept: reviewer.department,
        personName: grantee.name,
        leavesOn: grantee.leavesOn,
        appName: deskApps.name,
        appIconKey: deskApps.iconKey,
        appColor: deskApps.color,
        inactiveAfterDays: deskApps.inactiveAfterDays,
        tierName: deskAppTiers.name,
        lastSeenAt: accessGrants.lastSeenAt,
      })
      .from(accessReviewItems)
      .innerJoin(accessGrants, eq(accessGrants.id, accessReviewItems.grantId))
      .innerJoin(grantee, eq(grantee.id, accessGrants.personId))
      .innerJoin(deskApps, eq(deskApps.id, accessGrants.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
      .leftJoin(reviewer, eq(reviewer.id, accessReviewItems.reviewerPersonId))
      .where(and(eq(accessReviewItems.tenantId, tenantId), eq(accessReviewItems.reviewId, campaign.id)))
      .orderBy(grantee.name, deskApps.name);

    const byReviewer = new Map<string, Reviewer>();
    for (const r of rows) {
      const key = r.reviewerId ?? "none";
      const cur =
        byReviewer.get(key) ??
        ({ personId: r.reviewerId, name: r.reviewerName ?? "", department: r.reviewerDept, total: 0, done: 0 } satisfies Reviewer);
      cur.total += 1;
      if (r.decision !== "pending") cur.done += 1;
      byReviewer.set(key, cur);
    }
    const reviewers = [...byReviewer.values()].sort((a, b) => a.name.localeCompare(b.name));
    const selected =
      reviewers.find((r) => (r.personId ?? "none") === reviewerParam) ??
      reviewers.find((r) => r.done < r.total) ??
      reviewers[0] ??
      null;

    const today = now.toISOString().slice(0, 10);
    const items: ReviewItem[] = rows
      .filter((r) => selected && (r.reviewerId ?? null) === selected.personId)
      .map((r) => {
        let signal: ReviewItem["signal"] = null;
        if (r.leavesOn && r.leavesOn >= today) signal = { kind: "leaving", on: r.leavesOn };
        else if (r.lastSeenAt && daysSince(r.lastSeenAt, now) > r.inactiveAfterDays)
          signal = { kind: "unused", days: daysSince(r.lastSeenAt, now) };
        else if (r.signal && r.signalDetail) signal = { kind: "other", text: r.signalDetail };
        return {
          id: r.id,
          personName: r.personName,
          appName: r.appName,
          appIconKey: r.appIconKey,
          appColor: r.appColor,
          tierName: r.tierName,
          lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
          decision: r.decision,
          decidedAt: r.decidedAt?.toISOString() ?? null,
          signal,
        };
      });

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        frameworks: campaign.frameworks,
        state: campaign.state,
        opensOn: campaign.opensOn,
        dueOn: campaign.dueOn,
        scope: campaign.scope,
        total: rows.length,
        done: rows.filter((r) => r.decision !== "pending").length,
        revokes: rows.filter((r) => r.decision === "revoke").length,
        reviewers,
      },
      selected,
      items,
    };
  });
}
