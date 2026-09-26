import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  accessGrants,
  accessReviewItems,
  accessReviews,
  deskAppTiers,
  deskApps,
  people,
  tenants,
  users,
  withTenant,
  type Tx,
} from "@openhelpdesk/db";
import { revokeAccess, type Actor } from "@openhelpdesk/desk";
import { DeskEeError, requireEntitlement } from "./gov/entitlements";
import { journal } from "./gov/audit";
import { firstInChain, loadDeskConfig, todayIso } from "./gov/common";
import { buildPdf, type PdfLine } from "./gov/pdf";

/* ---------------- Access reviews (deskAccessReviews) ---------------- */

const DAY = 86_400_000;
/** A seat unused for longer than this is flagged in the campaign. */
export const REVIEW_UNUSED_DAYS = 30;

type Scope = "all" | "sensitive" | "privileged";
type Reviewers = "managers" | "owners" | "both";

/**
 * Who reviews a grant. The schema holds ONE item per (campaign, grant), so
 * "both" cannot mean two reviews of the same line: it means the manager
 * reviews, and the app owner does when the manager cannot (none on file, the
 * holder themself, departed or absent). "owners" is the mirror image. In every
 * mode the holder never reviews their own access: the chain above takes over.
 */
async function reviewerFor(
  tx: Tx,
  tenantId: string,
  mode: Reviewers,
  holder: { id: string; managerId: string | null },
  ownerPersonId: string | null,
): Promise<string | null> {
  const excluded = new Set([holder.id]);
  const primary = mode === "owners" ? ownerPersonId : holder.managerId;
  const secondary = mode === "owners" ? holder.managerId : mode === "both" ? ownerPersonId : null;
  // Only the primary itself (not its chain) first, then the secondary, then the holder's chain.
  for (const start of [primary, secondary]) {
    if (!start) continue;
    const pick = await firstInChain(tx, tenantId, start, excluded);
    if (pick?.personId === start) return start;
  }
  const up = await firstInChain(tx, tenantId, holder.managerId ?? ownerPersonId, excluded);
  return up?.personId ?? null;
}

export async function openAccessReview(tenantId: string, input: { name: string; frameworks: string[]; dueOn: string; scope?: "all" | "sensitive" | "privileged"; reviewers?: "managers" | "owners" | "both" }, actor: Actor): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new DeskEeError("invalid_name", "A campaign needs a name");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn) || Number.isNaN(Date.parse(input.dueOn))) {
    throw new DeskEeError("invalid_due_on", "The due date must be YYYY-MM-DD");
  }
  return withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskAccessReviews");
    const config = await loadDeskConfig(tx, tenantId);
    const scope: Scope = input.scope ?? config.reviews.scope;
    const mode: Reviewers = input.reviewers ?? config.reviews.reviewers;
    const now = new Date();

    const conditions = [
      eq(accessGrants.tenantId, tenantId),
      isNull(accessGrants.revokedAt),
      isNull(deskApps.deletedAt),
      ne(people.status, "departed"),
    ];
    if (scope === "sensitive") conditions.push(eq(deskApps.approvalLevels, 2));
    if (scope === "privileged") conditions.push(eq(deskAppTiers.privileged, true));
    const grants = await tx
      .select({
        grantId: accessGrants.id,
        lastSeenAt: accessGrants.lastSeenAt,
        personId: people.id,
        managerId: people.managerId,
        leavesOn: people.leavesOn,
        ownerPersonId: deskApps.ownerPersonId,
      })
      .from(accessGrants)
      .innerJoin(people, eq(people.id, accessGrants.personId))
      .innerJoin(deskApps, eq(deskApps.id, accessGrants.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
      .where(and(...conditions))
      .orderBy(asc(people.name), asc(deskApps.name));

    const [review] = await tx
      .insert(accessReviews)
      .values({
        tenantId,
        name,
        frameworks: input.frameworks.map((f) => f.trim()).filter(Boolean),
        scope,
        reviewers: mode,
        state: "open",
        opensOn: todayIso(now),
        dueOn: input.dueOn,
      })
      .returning({ id: accessReviews.id });
    const reviewId = review!.id;

    const items = [];
    for (const g of grants) {
      const reviewerPersonId = await reviewerFor(tx, tenantId, mode, { id: g.personId, managerId: g.managerId }, g.ownerPersonId);
      let signal: string | null = null;
      let signalDetail: string | null = null;
      if (g.leavesOn) {
        signal = "leaving";
        signalDetail = g.leavesOn;
      } else if (g.lastSeenAt) {
        // Unknown last sign-in (null) is never "unused".
        const days = Math.floor((now.getTime() - g.lastSeenAt.getTime()) / DAY);
        if (days > REVIEW_UNUSED_DAYS) {
          signal = "unused";
          signalDetail = String(days);
        }
      }
      items.push({ tenantId, reviewId, grantId: g.grantId, reviewerPersonId, signal, signalDetail });
    }
    if (items.length) await tx.insert(accessReviewItems).values(items);

    await journal(tx, tenantId, actor, "desk.review.opened", { type: "access_review", id: reviewId }, {
      after: { name, scope, reviewers: mode, dueOn: input.dueOn, items: items.length },
    });
    return reviewId;
  });
}

/** Who may decide: the item's reviewer, or an admin/owner agent — never the holder of the access. */
async function assertCanDecide(
  tx: Tx,
  tenantId: string,
  actor: Actor,
  item: { reviewerPersonId: string | null; holderPersonId: string },
): Promise<void> {
  if (actor.kind === "person") {
    if (actor.personId === item.holderPersonId) throw new DeskEeError("own_access", "A reviewer does not review their own access");
    if (actor.personId !== item.reviewerPersonId) throw new DeskEeError("not_reviewer", "Only the reviewer of this line can decide it");
    return;
  }
  if (actor.kind === "agent") {
    const [user] = await tx
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, actor.userId)))
      .limit(1);
    if (!user || (user.role !== "admin" && user.role !== "owner")) {
      throw new DeskEeError("not_admin", "Only an administrator can decide in place of the reviewer");
    }
    const [self] = await tx
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.userId, actor.userId)))
      .limit(1);
    if (self?.id === item.holderPersonId) throw new DeskEeError("own_access", "A reviewer does not review their own access");
    return;
  }
  throw new DeskEeError("not_reviewer", "Only a person or an agent can decide a review line");
}

/** Records the decision. A "revoke" is only scheduled: it runs when the campaign closes. */
export async function decideReviewItem(tenantId: string, itemId: string, decision: "keep" | "revoke", actor: Actor): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskAccessReviews");
    const [item] = await tx
      .select({
        id: accessReviewItems.id,
        reviewId: accessReviewItems.reviewId,
        grantId: accessReviewItems.grantId,
        reviewerPersonId: accessReviewItems.reviewerPersonId,
        decision: accessReviewItems.decision,
        state: accessReviews.state,
        holderPersonId: accessGrants.personId,
        person: people.name,
        app: deskApps.name,
      })
      .from(accessReviewItems)
      .innerJoin(accessReviews, eq(accessReviews.id, accessReviewItems.reviewId))
      .innerJoin(accessGrants, eq(accessGrants.id, accessReviewItems.grantId))
      .innerJoin(people, eq(people.id, accessGrants.personId))
      .innerJoin(deskApps, eq(deskApps.id, accessGrants.appId))
      .where(and(eq(accessReviewItems.tenantId, tenantId), eq(accessReviewItems.id, itemId)))
      .limit(1);
    if (!item) throw new DeskEeError("item_not_found", "Unknown review line");
    if (item.state !== "open") throw new DeskEeError("review_closed", "This campaign is closed");
    await assertCanDecide(tx, tenantId, actor, item);
    if (item.decision === decision) return;

    const now = new Date();
    await tx.update(accessReviewItems).set({ decision, decidedAt: now }).where(eq(accessReviewItems.id, itemId));
    // A changed mind clears the schedule: only the last decision counts at close.
    await tx
      .update(accessGrants)
      .set({ revokeScheduledAt: decision === "revoke" ? now : null })
      .where(eq(accessGrants.id, item.grantId));
    await journal(tx, tenantId, actor, "desk.review.decided", { type: "access_review_item", id: itemId }, {
      before: { decision: item.decision },
      after: { decision, reviewId: item.reviewId, grantId: item.grantId, person: item.person, app: item.app },
    });
  });
}

/**
 * Journals the reminder. Delivery: `@openhelpdesk/desk` exports no
 * notification helper and ee/desk does not depend on @openhelpdesk/mail, so
 * the audit line (`desk.review.reminded`, with the reviewer's email and the
 * pending count) is what a notifier consumes — see the report.
 */
export async function remindReviewer(tenantId: string, reviewId: string, reviewerPersonId: string, actor: Actor): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskAccessReviews");
    const [review] = await tx
      .select({ id: accessReviews.id, name: accessReviews.name, state: accessReviews.state, dueOn: accessReviews.dueOn })
      .from(accessReviews)
      .where(and(eq(accessReviews.tenantId, tenantId), eq(accessReviews.id, reviewId)))
      .limit(1);
    if (!review) throw new DeskEeError("review_not_found", "Unknown campaign");
    if (review.state !== "open") throw new DeskEeError("review_closed", "This campaign is closed");
    const [reviewer] = await tx
      .select({ id: people.id, email: people.email, name: people.name })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.id, reviewerPersonId)))
      .limit(1);
    if (!reviewer) throw new DeskEeError("person_not_found", "Unknown reviewer");
    const pending = await tx
      .select({ id: accessReviewItems.id })
      .from(accessReviewItems)
      .where(
        and(
          eq(accessReviewItems.reviewId, reviewId),
          eq(accessReviewItems.reviewerPersonId, reviewerPersonId),
          eq(accessReviewItems.decision, "pending"),
        ),
      );
    if (pending.length === 0) return;
    await journal(tx, tenantId, actor, "desk.review.reminded", { type: "access_review", id: reviewId }, {
      after: { reviewerPersonId, reviewer: reviewer.name, email: reviewer.email, review: review.name, pending: pending.length, dueOn: review.dueOn },
    });
  });
}

/** Executes scheduled revocations; unanswered lines follow reviews.whenUnanswered. */
export async function closeAccessReview(tenantId: string, reviewId: string, actor: Actor): Promise<{ revoked: number; kept: number; unanswered: number }> {
  const { review, items, whenUnanswered } = await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskAccessReviews");
    const [review] = await tx
      .select({ id: accessReviews.id, name: accessReviews.name, state: accessReviews.state })
      .from(accessReviews)
      .where(and(eq(accessReviews.tenantId, tenantId), eq(accessReviews.id, reviewId)))
      .limit(1);
    if (!review) throw new DeskEeError("review_not_found", "Unknown campaign");
    if (review.state === "closed") throw new DeskEeError("review_closed", "This campaign is already closed");
    const config = await loadDeskConfig(tx, tenantId);
    const items = await tx
      .select({
        id: accessReviewItems.id,
        grantId: accessReviewItems.grantId,
        decision: accessReviewItems.decision,
        revokedAt: accessGrants.revokedAt,
      })
      .from(accessReviewItems)
      .innerJoin(accessGrants, eq(accessGrants.id, accessReviewItems.grantId))
      .where(eq(accessReviewItems.reviewId, reviewId));
    return { review, items, whenUnanswered: config.reviews.whenUnanswered };
  });

  let revoked = 0;
  let kept = 0;
  const unansweredIds: string[] = [];
  const reason = `access review ${review.name}`;
  // Revocations go through the core (journal + connector or IT task), one by
  // one, BEFORE the campaign is marked closed: a failure leaves it open and a
  // second close resumes where it stopped (already revoked grants are skipped).
  for (const item of items) {
    if (item.decision === "keep") {
      kept++;
      continue;
    }
    if (item.decision === "pending") {
      unansweredIds.push(item.id);
      if (whenUnanswered !== "revoke") continue; // kept, and flagged in the journal below
      if (!item.revokedAt) {
        await revokeAccess(tenantId, item.grantId, `${reason} (unanswered)`, actor);
        revoked++;
      }
      continue;
    }
    if (!item.revokedAt) {
      await revokeAccess(tenantId, item.grantId, reason, actor);
      revoked++;
    }
  }

  await withTenant(tenantId, async (tx) => {
    if (whenUnanswered === "revoke" && unansweredIds.length) {
      await tx
        .update(accessReviewItems)
        .set({ decision: "revoke", decidedAt: new Date() })
        .where(inArray(accessReviewItems.id, unansweredIds));
    }
    await tx.update(accessReviews).set({ state: "closed", closedAt: new Date() }).where(eq(accessReviews.id, reviewId));
    await journal(tx, tenantId, actor, "desk.review.closed", { type: "access_review", id: reviewId }, {
      after: {
        name: review.name,
        revoked,
        kept,
        unanswered: unansweredIds.length,
        whenUnanswered,
        // Unanswered lines are kept and named here — never revoked silently.
        unansweredItemIds: unansweredIds,
      },
    });
  });
  return { revoked, kept, unanswered: unansweredIds.length };
}

/* ---------------- Evidence export ---------------- */

type EvidenceRow = {
  person: string;
  email: string;
  app: string;
  tier: string;
  reviewer: string;
  decision: string;
  decidedAt: string;
  signal: string;
};

function csvCell(v: string): string {
  // A leading = + - @ would be run as a formula by a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "campaign"
  );
}

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n, " ");
}

/** Timestamped evidence: every line, its decision, its reviewer, the time. */
export async function exportReviewEvidence(tenantId: string, reviewId: string, format: "csv" | "pdf"): Promise<{ filename: string; contentType: string; body: Uint8Array }> {
  const generatedAt = new Date();
  const { tenantName, review, rows } = await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskAccessReviews");
    const [tenant] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const [review] = await tx
      .select()
      .from(accessReviews)
      .where(and(eq(accessReviews.tenantId, tenantId), eq(accessReviews.id, reviewId)))
      .limit(1);
    if (!review) throw new DeskEeError("review_not_found", "Unknown campaign");
    const holder = alias(people, "holder");
    const reviewer = alias(people, "reviewer");
    const raw = await tx
      .select({
        person: holder.name,
        email: holder.email,
        app: deskApps.name,
        tier: deskAppTiers.name,
        reviewer: reviewer.name,
        decision: accessReviewItems.decision,
        decidedAt: accessReviewItems.decidedAt,
        signal: accessReviewItems.signal,
        signalDetail: accessReviewItems.signalDetail,
      })
      .from(accessReviewItems)
      .innerJoin(accessGrants, eq(accessGrants.id, accessReviewItems.grantId))
      .innerJoin(holder, eq(holder.id, accessGrants.personId))
      .innerJoin(deskApps, eq(deskApps.id, accessGrants.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
      .leftJoin(reviewer, eq(reviewer.id, accessReviewItems.reviewerPersonId))
      .where(eq(accessReviewItems.reviewId, reviewId))
      .orderBy(asc(reviewer.name), asc(holder.name), asc(deskApps.name));
    const rows: EvidenceRow[] = raw.map((r) => ({
      person: r.person,
      email: r.email,
      app: r.app,
      tier: r.tier,
      reviewer: r.reviewer ?? "",
      decision: r.decision,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : "",
      signal: r.signal ? (r.signalDetail ? `${r.signal}:${r.signalDetail}` : r.signal) : "",
    }));
    return { tenantName: tenant?.name ?? "", review, rows };
  });

  const base = `access-review-${slugify(review.name)}-${generatedAt.toISOString().slice(0, 10)}`;
  if (format === "csv") {
    const header = ["person", "email", "app", "tier", "reviewer", "decision", "decided_at", "signal"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([r.person, r.email, r.app, r.tier, r.reviewer, r.decision, r.decidedAt, r.signal].map(csvCell).join(","));
    }
    // BOM: spreadsheets otherwise read UTF-8 accents as Latin-1.
    const body = new TextEncoder().encode("\uFEFF" + lines.join("\r\n") + "\r\n");
    return { filename: `${base}.csv`, contentType: "text/csv; charset=utf-8", body };
  }

  const totals = {
    keep: rows.filter((r) => r.decision === "keep").length,
    revoke: rows.filter((r) => r.decision === "revoke").length,
    pending: rows.filter((r) => r.decision === "pending").length,
  };
  const frameworks = review.frameworks.length ? review.frameworks.join(" / ") : "ISO 27001 A.5.18 / NIS2 art. 21";
  const W = { person: 24, app: 18, tier: 16, reviewer: 22, decision: 9, decidedAt: 21, signal: 16 };
  const lines: PdfLine[] = [
    { text: "Access review evidence", font: "bold", size: 16 },
    { text: `Workspace: ${tenantName}`, gapBefore: 6 },
    { text: `Campaign: ${review.name}` },
    { text: `Frameworks: ${frameworks}` },
    { text: `Scope: ${review.scope} · Reviewers: ${review.reviewers} · State: ${review.state}` },
    {
      text: `Opened: ${review.opensOn} · Due: ${review.dueOn} · Closed: ${review.closedAt ? review.closedAt.toISOString() : "not closed"}`,
    },
    { text: `Generated at: ${generatedAt.toISOString()}` },
    {
      text: `Totals: ${rows.length} lines · ${totals.keep} kept · ${totals.revoke} revoked · ${totals.pending} unanswered`,
      font: "bold",
      gapBefore: 4,
    },
    {
      text:
        pad("Person", W.person) + pad("App", W.app) + pad("Tier", W.tier) + pad("Reviewer", W.reviewer) +
        pad("Decision", W.decision) + pad("Decided at (UTC)", W.decidedAt) + "Signal",
      font: "mono",
      size: 8,
      gapBefore: 10,
    },
    ...rows.map<PdfLine>((r) => ({
      text:
        pad(r.person, W.person) + pad(r.app, W.app) + pad(r.tier, W.tier) + pad(r.reviewer || "-", W.reviewer) +
        pad(r.decision, W.decision) + pad(r.decidedAt ? r.decidedAt.slice(0, 19) + "Z" : "-", W.decidedAt) + r.signal,
      font: "mono",
      size: 8,
    })),
  ];
  const body = buildPdf(lines, { title: `Access review evidence — ${review.name}`, createdAt: generatedAt });
  return { filename: `${base}.pdf`, contentType: "application/pdf", body };
}
