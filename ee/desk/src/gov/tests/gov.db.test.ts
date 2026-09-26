/**
 * The ee/ desk governance rules, against a real database.
 *
 *   docker compose -f docker/docker-compose.yml up -d && pnpm db:migrate
 *   pnpm vitest run --project db ee/desk/src/gov
 *
 * Writes into a throwaway workspace and deletes it afterwards. The core write
 * functions this domain calls (revokeAccess, directGrant, upsertHardware,
 * createApp) are replaced by minimal fakes: what is tested here is the ee
 * rule — who approves, what is revoked and when — not the core's journal.
 */
process.env.OPENHELPDESK_EDITION = "cloud";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  accessGrants,
  accessReviewItems,
  accessReviews,
  auditEvents,
  contacts,
  db,
  deskAppTiers,
  deskApps,
  deskBudgets,
  deskSodRules,
  hardwareAssets,
  lifecyclePlans,
  lifecycleTasks,
  people,
  tenants,
  withTenant,
} from "@openhelpdesk/db";

const calls = vi.hoisted(() => ({ revoke: [] as Array<{ grantId: string; reason: string }> }));

vi.mock("@openhelpdesk/desk", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@openhelpdesk/desk")>();
  const { withTenant: wt, accessGrants: ag, hardwareAssets: hw } = await import("@openhelpdesk/db");
  const { eq: e, and: a, isNull: n } = await import("drizzle-orm");
  return {
    ...orig,
    revokeAccess: async (tenantId: string, grantId: string, reason: string) => {
      calls.revoke.push({ grantId, reason });
      await wt(tenantId, (tx) =>
        tx.update(ag).set({ revokedAt: new Date(), revokeReason: reason }).where(a(e(ag.id, grantId), n(ag.revokedAt))),
      );
    },
    directGrant: async (tenantId: string, personId: string, appId: string, tierId: string) =>
      wt(tenantId, async (tx) => {
        const [g] = await tx.insert(ag).values({ tenantId, personId, appId, tierId, source: "direct" }).returning({ id: ag.id });
        return g!.id;
      }),
    upsertHardware: async (tenantId: string, input: { id?: string; status?: string; assignedPersonId?: string | null }) =>
      wt(tenantId, async (tx) => {
        await tx
          .update(hw)
          .set({ status: input.status as never, assignedPersonId: input.assignedPersonId ?? null })
          .where(e(hw.id, input.id!));
        return input.id!;
      }),
  };
});

import { DEFAULT_DESK_CONFIG, registerDeskExtensions, type CircuitStep, type DeskConfig, type Provisioner } from "@openhelpdesk/desk";
import { extendCircuit } from "../../extensions/circuit";
import { reclaimInactiveSeats } from "../../licences";
import { closeAccessReview, decideReviewItem, exportReviewEvidence, openAccessReview } from "../../reviews";
import { executeLifecyclePlan, scheduleOffboarding, scheduleOnboarding, setLifecycleTaskDone } from "../../lifecycle";
import { DeskEeEntitlementError } from "../entitlements";
import { sodViolations } from "../../governance";

const DAY = 86_400_000;
const ALL_DESK = {
  serviceDesk: true,
  deskConnectors: true,
  deskLicences: true,
  deskHardware: true,
  deskAccessReviews: true,
  deskLifecycle: true,
  deskBudgets: true,
  deskGovernance: true,
  deskShadowIt: true,
};

let tenantId: string;
let bareTenantId: string;
const P: Record<string, string> = {};
const APP: Record<string, string> = {};
const TIER: Record<string, string> = {};

async function person(key: string, name: string, extra: Partial<typeof people.$inferInsert> = {}) {
  const email = `${key}-${Date.now()}@gov.test`;
  const [c] = await db.insert(contacts).values({ tenantId, email, name, locale: "en" }).returning();
  const [p] = await db.insert(people).values({ tenantId, contactId: c!.id, email, name, ...extra }).returning();
  P[key] = p!.id;
  return p!.id;
}

async function app(key: string, extra: Partial<typeof deskApps.$inferInsert> = {}) {
  const [a] = await db
    .insert(deskApps)
    .values({ tenantId, slug: key, name: key[0]!.toUpperCase() + key.slice(1), category: "Test", ...extra })
    .returning();
  APP[key] = a!.id;
  return a!.id;
}

async function tier(key: string, appKey: string, monthlyCostCents: number, privileged = false) {
  const [t] = await db
    .insert(deskAppTiers)
    .values({ tenantId, appId: APP[appKey]!, name: key, monthlyCostCents, privileged })
    .returning();
  TIER[key] = t!.id;
  return t!.id;
}

async function grant(personKey: string, appKey: string, tierKey: string, lastSeenAt: Date | null = null) {
  const [g] = await db
    .insert(accessGrants)
    .values({ tenantId, personId: P[personKey]!, appId: APP[appKey]!, tierId: TIER[tierKey]!, source: "direct", lastSeenAt })
    .returning();
  return g!.id;
}

function config(patch: { approvals?: Partial<DeskConfig["approvals"]>; budgets?: Partial<DeskConfig["budgets"]> } = {}): DeskConfig {
  return {
    ...DEFAULT_DESK_CONFIG,
    approvals: { ...DEFAULT_DESK_CONFIG.approvals, ...patch.approvals },
    budgets: { ...DEFAULT_DESK_CONFIG.budgets, ...patch.budgets },
  };
}

const step = (s: CircuitStep["step"], approver: string): CircuitStep => ({
  step: s,
  approverPersonId: approver,
  onBehalfOfPersonId: null,
  mergedSteps: [],
});

async function circuit(
  personKey: string,
  appKey: string,
  tierKey: string,
  cfg: DeskConfig,
  steps: CircuitStep[],
  tenant = tenantId,
) {
  return withTenant(tenant, async (tx) => {
    const [p] = await tx.select().from(people).where(eq(people.id, P[personKey]!));
    const [a] = await tx.select().from(deskApps).where(eq(deskApps.id, APP[appKey]!));
    const [t] = await tx.select().from(deskAppTiers).where(eq(deskAppTiers.id, TIER[tierKey]!));
    return extendCircuit({
      tx,
      tenantId: tenant,
      config: cfg,
      person: { id: p!.id, department: p!.department, managerId: p!.managerId },
      app: { id: a!.id, ownerPersonId: a!.ownerPersonId, approvalLevels: a!.approvalLevels },
      tier: { id: t!.id, privileged: t!.privileged, monthlyCostCents: t!.monthlyCostCents },
      steps,
    });
  });
}

const fakeProvisioner: Provisioner = {
  create: async () => ({ externalAccountId: "x" }),
  update: async () => {},
  disable: async () => {},
  delete: async () => {},
};

beforeAll(async () => {
  const [t] = await db
    .insert(tenants)
    .values({ slug: `gov-test-${Date.now()}`, name: "Gov test", locale: "en", timezone: "Europe/Paris", entitlements: ALL_DESK })
    .returning();
  if (!t) throw new Error("test workspace not created — is the database migrated?");
  tenantId = t.id;
  const [bare] = await db
    .insert(tenants)
    .values({ slug: `gov-bare-${Date.now()}`, name: "Gov bare", locale: "en", entitlements: { serviceDesk: true } })
    .returning();
  bareTenantId = bare!.id;

  // Directory: Claire → Paul → Inès, Julien, Karim. Sarah (IT) → Claire. Fred: finance.
  await person("claire", "Claire Morel", { department: "Direction" });
  await person("paul", "Paul Mercier", { department: "Sales", managerId: P.claire });
  await person("ines", "Ines Haddad", { department: "Sales", managerId: P.paul });
  await person("julien", "Julien Roche", { department: "Sales", managerId: P.paul, leavesOn: "2026-10-01" });
  await person("karim", "Karim Benali", { department: "Sales", managerId: P.paul });
  await person("sarah", "Sarah Leroy", { department: "IT", managerId: P.claire });
  await person("fred", "Fred Finance", { department: "Finance", managerId: P.claire });

  // Catalogue.
  await app("salesforce", { ownerPersonId: P.sarah, approvalLevels: 2, scimBaseUrl: "https://scim.example.test" });
  await tier("sf-user", "salesforce", 8000);
  await tier("sf-admin", "salesforce", 15000, true);
  await app("pennylane", { ownerPersonId: P.fred, approvalLevels: 2 });
  await tier("pl-accountant", "pennylane", 3000);
  await app("miro", { ownerPersonId: P.sarah, approvalLevels: 1 });
  await tier("miro-member", "miro", 1000);
  await app("notion", { ownerPersonId: P.sarah, approvalLevels: 1 });
  await tier("notion-member", "notion", 0);

  registerDeskExtensions({
    provisionerFor: async (_t, kind) => (kind === "scim" ? fakeProvisioner : null),
  });
});

afterAll(async () => {
  registerDeskExtensions({});
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  if (bareTenantId) await db.delete(tenants).where(eq(tenants.id, bareTenantId));
});

beforeEach(() => {
  calls.revoke.length = 0;
});

/* ---------------- Circuit extension ---------------- */

describe("extendCircuit — privileged second approver", () => {
  it("adds the app owner as the privileged approver", async () => {
    const ext = await circuit("ines", "salesforce", "sf-admin", config(), [step("manager", P.paul!)]);
    expect(ext.extraSteps).toEqual([expect.objectContaining({ step: "privileged", approverPersonId: P.sarah })]);
    expect(ext.blocked).toBeNull();
  });

  it("goes to the owner's manager when the owner already approves — never twice the same person", async () => {
    const ext = await circuit("ines", "salesforce", "sf-admin", config(), [step("manager", P.paul!), step("owner", P.sarah!)]);
    expect(ext.extraSteps[0]?.approverPersonId).toBe(P.claire);
  });

  it("never picks the requester, even when the requester owns the app", async () => {
    const ext = await circuit("sarah", "salesforce", "sf-admin", config(), [step("manager", P.claire!)]);
    // Sarah owns the app and asks; Claire already approves as manager → up Claire's chain: nobody.
    expect(ext.extraSteps[0]?.approverPersonId).toBeNull();
    expect(ext.blocked).toBe("no_privileged_approver");
  });

  it("does nothing when the setting is off, or on a non-privileged tier", async () => {
    const off = await circuit("ines", "salesforce", "sf-admin", config({ approvals: { privilegedSecondApprover: false } }), [step("manager", P.paul!)]);
    expect(off.extraSteps).toEqual([]);
    const plain = await circuit("ines", "salesforce", "sf-user", config(), [step("manager", P.paul!)]);
    expect(plain.extraSteps).toEqual([]);
  });

  it("does nothing for a workspace without deskGovernance", async () => {
    // Same ids read through the bare tenant's RLS would find nothing — use a context by hand.
    const ext = await withTenant(bareTenantId, (tx) =>
      extendCircuit({
        tx,
        tenantId: bareTenantId,
        config: config(),
        person: { id: P.ines!, department: "Sales", managerId: P.paul! },
        app: { id: APP.salesforce!, ownerPersonId: P.sarah!, approvalLevels: 2 },
        tier: { id: TIER["sf-admin"]!, privileged: true, monthlyCostCents: 15000 },
        steps: [step("manager", P.paul!)],
      }),
    );
    expect(ext).toEqual({ extraSteps: [], budget: null, sodConflict: null, blocked: null });
  });
});

describe("extendCircuit — separation of duties", () => {
  let ruleId: string;
  let held: string;
  beforeAll(async () => {
    const [r] = await db
      .insert(deskSodRules)
      .values({ tenantId, tierAId: TIER["pl-accountant"]!, tierBId: TIER["sf-admin"]!, reason: "Could create a sale and invoice it" })
      .returning();
    ruleId = r!.id;
    held = await grant("karim", "pennylane", "pl-accountant");
  });
  afterAll(async () => {
    await db.delete(deskSodRules).where(eq(deskSodRules.id, ruleId));
    await db.delete(accessGrants).where(eq(accessGrants.id, held));
  });

  it("blocks a person holding tier A who asks tier B when enforceSod is on", async () => {
    const ext = await circuit("karim", "salesforce", "sf-admin", config(), [step("manager", P.paul!)]);
    expect(ext.sodConflict).toEqual({ ruleId, reason: "Could create a sale and invoice it" });
    expect(ext.blocked).toBe("sod_conflict");
  });

  it("reports the conflict without blocking when enforceSod is off", async () => {
    const ext = await circuit("karim", "salesforce", "sf-admin", config({ approvals: { enforceSod: false } }), [step("manager", P.paul!)]);
    expect(ext.sodConflict?.ruleId).toBe(ruleId);
    expect(ext.blocked).toBeNull();
  });

  it("ignores a disabled rule and a person who holds neither tier", async () => {
    const other = await circuit("ines", "salesforce", "sf-admin", config(), [step("manager", P.paul!)]);
    expect(other.sodConflict).toBeNull();
    await db.update(deskSodRules).set({ enabled: false }).where(eq(deskSodRules.id, ruleId));
    const disabled = await circuit("karim", "salesforce", "sf-admin", config(), [step("manager", P.paul!)]);
    expect(disabled.sodConflict).toBeNull();
    await db.update(deskSodRules).set({ enabled: true }).where(eq(deskSodRules.id, ruleId));
  });

  it("lists current violations", async () => {
    const extra = await grant("karim", "salesforce", "sf-admin");
    expect(await sodViolations(tenantId)).toEqual([{ ruleId, personId: P.karim }]);
    await db.delete(accessGrants).where(eq(accessGrants.id, extra));
  });
});

describe("extendCircuit — budgets", () => {
  let grants: string[] = [];
  beforeAll(async () => {
    // Sales spends 80 + 80 = 160 €/month; budget 200 €.
    grants = [await grant("paul", "salesforce", "sf-user"), await grant("julien", "salesforce", "sf-user")];
    await db.insert(deskBudgets).values({ tenantId, department: "Sales", amountCents: 20000 });
  });
  afterAll(async () => {
    for (const g of grants) await db.delete(accessGrants).where(eq(accessGrants.id, g));
    await db.delete(deskBudgets).where(eq(deskBudgets.tenantId, tenantId));
  });

  it("returns the check under budget, with nothing over", async () => {
    const ext = await circuit("ines", "miro", "miro-member", config(), [step("manager", P.paul!)]);
    expect(ext.budget).toEqual({ department: "Sales", spendCents: 16000, budgetCents: 20000, overCents: 0, mode: "alert" });
    expect(ext.blocked).toBeNull();
  });

  it("alert: over budget is information only", async () => {
    const ext = await circuit("ines", "salesforce", "sf-user", config(), [step("manager", P.paul!)]);
    expect(ext.budget?.overCents).toBe(4000);
    expect(ext.extraSteps).toEqual([]);
    expect(ext.blocked).toBeNull();
  });

  it("finance: over budget adds a finance step with the finance approver", async () => {
    const ext = await circuit("ines", "salesforce", "sf-user", config({ budgets: { mode: "finance", financePersonId: P.fred } }), [step("manager", P.paul!)]);
    expect(ext.extraSteps).toEqual([expect.objectContaining({ step: "finance", approverPersonId: P.fred })]);
    expect(ext.blocked).toBeNull();
  });

  it("finance without a finance approver blocks", async () => {
    const ext = await circuit("ines", "salesforce", "sf-user", config({ budgets: { mode: "finance", financePersonId: null } }), [step("manager", P.paul!)]);
    expect(ext.blocked).toBe("no_finance_approver");
  });

  it("block: over budget cannot be sent, and the check says why", async () => {
    const ext = await circuit("ines", "salesforce", "sf-user", config({ budgets: { mode: "block" } }), [step("manager", P.paul!)]);
    expect(ext.blocked).toBe("budget_exceeded");
    expect(ext.budget).toMatchObject({ overCents: 4000, mode: "block" });
  });

  it("yearly period multiplies spend and cost by 12", async () => {
    const ext = await circuit("ines", "miro", "miro-member", config({ budgets: { period: "yearly" } }), [step("manager", P.paul!)]);
    expect(ext.budget).toMatchObject({ spendCents: 16000 * 12, overCents: 16000 * 12 + 1000 * 12 - 20000 });
  });
});

/* ---------------- Licences ---------------- */

describe("reclaimInactiveSeats", () => {
  it("revokes seats past the threshold and never one whose last sign-in is unknown", async () => {
    await db.update(deskApps).set({ inactiveAfterDays: 30 }).where(eq(deskApps.id, APP.miro!));
    const stale = await grant("ines", "miro", "miro-member", new Date(Date.now() - 60 * DAY));
    const unknown = await grant("julien", "miro", "miro-member", null);
    const recent = await grant("karim", "miro", "miro-member", new Date(Date.now() - 5 * DAY));

    const out = await reclaimInactiveSeats(tenantId, APP.miro!, { kind: "system" });
    expect(out).toEqual({ revoked: 1, yearlySavingCents: 1000 * 12 });
    expect(calls.revoke.map((c) => c.grantId)).toEqual([stale]);

    const still = await db
      .select({ id: accessGrants.id })
      .from(accessGrants)
      .where(and(eq(accessGrants.appId, APP.miro!), isNull(accessGrants.revokedAt)));
    expect(still.map((g) => g.id).sort()).toEqual([unknown, recent].sort());
    await db.delete(accessGrants).where(eq(accessGrants.appId, APP.miro!));
  });

  it("refuses a workspace without deskLicences", async () => {
    await expect(reclaimInactiveSeats(bareTenantId, APP.miro!, { kind: "system" })).rejects.toBeInstanceOf(DeskEeEntitlementError);
  });
});

/* ---------------- Access reviews ---------------- */

describe("access review — open, decide, close", () => {
  let reviewId: string;
  const G: Record<string, string> = {};
  beforeAll(async () => {
    G.ines = await grant("ines", "salesforce", "sf-user", new Date(Date.now() - 2 * DAY));
    G.julien = await grant("julien", "salesforce", "sf-user", new Date(Date.now() - 2 * DAY));
    G.karim = await grant("karim", "salesforce", "sf-user", new Date(Date.now() - 41 * DAY));
    G.paul = await grant("paul", "salesforce", "sf-user", null);
    G.notion = await grant("ines", "notion", "notion-member"); // approvalLevels 1: out of "sensitive" scope
  });
  afterAll(async () => {
    await db.delete(accessReviews).where(eq(accessReviews.tenantId, tenantId));
    await db.delete(accessGrants).where(eq(accessGrants.tenantId, tenantId));
  });

  it("builds one line per grant in scope, reviewed by the manager, never by the holder", async () => {
    reviewId = await openAccessReview(
      tenantId,
      { name: "Q3 2026", frameworks: ["ISO 27001 A.5.18", "NIS2 art. 21"], dueOn: "2026-10-15", scope: "sensitive", reviewers: "managers" },
      { kind: "system" },
    );
    const items = await db.select().from(accessReviewItems).where(eq(accessReviewItems.reviewId, reviewId));
    const byGrant = new Map(items.map((i) => [i.grantId, i]));
    expect(items).toHaveLength(4);
    expect(byGrant.has(G.notion!)).toBe(false);
    expect(byGrant.get(G.ines!)?.reviewerPersonId).toBe(P.paul);
    // Paul's own access goes to his manager.
    expect(byGrant.get(G.paul!)?.reviewerPersonId).toBe(P.claire);
    expect(byGrant.get(G.julien!)).toMatchObject({ signal: "leaving", signalDetail: "2026-10-01" });
    expect(byGrant.get(G.karim!)).toMatchObject({ signal: "unused", signalDetail: "41" });
    // Unknown last sign-in is not "unused".
    expect(byGrant.get(G.paul!)?.signal).toBeNull();
  });

  it("owners mode: an owner never reviews their own access — the chain above does", async () => {
    const own = await grant("sarah", "salesforce", "sf-user");
    const id = await openAccessReview(tenantId, { name: "Owners", frameworks: [], dueOn: "2026-10-15", scope: "sensitive", reviewers: "owners" }, { kind: "system" });
    const items = await db.select().from(accessReviewItems).where(eq(accessReviewItems.reviewId, id));
    expect(items.find((i) => i.grantId === own)?.reviewerPersonId).toBe(P.claire);
    expect(items.find((i) => i.grantId === G.ines)?.reviewerPersonId).toBe(P.sarah);
    await db.delete(accessReviews).where(eq(accessReviews.id, id));
    await db.delete(accessGrants).where(eq(accessGrants.id, own));
  });

  it("a revoke decision is scheduled, not executed", async () => {
    const [item] = await db
      .select()
      .from(accessReviewItems)
      .where(and(eq(accessReviewItems.reviewId, reviewId), eq(accessReviewItems.grantId, G.julien!)));
    await decideReviewItem(tenantId, item!.id, "revoke", { kind: "person", personId: P.paul! });
    const [g] = await db.select().from(accessGrants).where(eq(accessGrants.id, G.julien!));
    expect(g!.revokedAt).toBeNull();
    expect(g!.revokeScheduledAt).not.toBeNull();
    expect(calls.revoke).toEqual([]);
  });

  it("only the reviewer decides a line — and not about their own access", async () => {
    const [item] = await db
      .select()
      .from(accessReviewItems)
      .where(and(eq(accessReviewItems.reviewId, reviewId), eq(accessReviewItems.grantId, G.ines!)));
    await expect(decideReviewItem(tenantId, item!.id, "keep", { kind: "person", personId: P.karim! })).rejects.toThrow(/reviewer/);
    await expect(decideReviewItem(tenantId, item!.id, "keep", { kind: "person", personId: P.ines! })).rejects.toThrow(/own access/);
    await decideReviewItem(tenantId, item!.id, "keep", { kind: "person", personId: P.paul! });
  });

  it("close executes the scheduled revocations; unanswered lines are kept and flagged", async () => {
    const out = await closeAccessReview(tenantId, reviewId, { kind: "system" });
    expect(out).toEqual({ revoked: 1, kept: 1, unanswered: 2 });
    expect(calls.revoke).toEqual([{ grantId: G.julien, reason: "access review Q3 2026" }]);
    const active = await db.select({ id: accessGrants.id }).from(accessGrants).where(and(eq(accessGrants.tenantId, tenantId), isNull(accessGrants.revokedAt)));
    expect(active.map((a) => a.id)).toEqual(expect.arrayContaining([G.ines, G.karim, G.paul]));
    const [review] = await db.select().from(accessReviews).where(eq(accessReviews.id, reviewId));
    expect(review!.state).toBe("closed");
    const [closed] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.action, "desk.review.closed")));
    expect((closed!.after as { unansweredItemIds: string[] }).unansweredItemIds).toHaveLength(2);
  });

  it("exports the evidence as CSV and as a PDF", async () => {
    const csv = await exportReviewEvidence(tenantId, reviewId, "csv");
    expect([...csv.body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM
    const text = new TextDecoder().decode(csv.body);
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toBe("person,email,app,tier,reviewer,decision,decided_at,signal");
    expect(lines).toHaveLength(5);
    expect(text).toMatch(/Julien Roche,[^,]+,Salesforce,sf-user,Paul Mercier,revoke,\d{4}-\d{2}-\d{2}T[\d:.]+Z,leaving:2026-10-01/);

    const pdf = await exportReviewEvidence(tenantId, reviewId, "pdf");
    const raw = Buffer.from(pdf.body).toString("latin1");
    expect(pdf.contentType).toBe("application/pdf");
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(raw).toContain("ISO 27001 A.5.18 / NIS2 art. 21");
    expect(raw).toContain("Totals: 4 lines");
    // xref offsets point at their objects.
    const start = Number(/startxref\n(\d+)/.exec(raw)![1]);
    expect(raw.slice(start, start + 4)).toBe("xref");
    const first = /xref\n0 \d+\n0000000000 65535 f \n(\d{10})/.exec(raw)!;
    expect(raw.slice(Number(first[1]), Number(first[1]) + 7)).toBe("1 0 obj");
  });
});

/* ---------------- Joiners and leavers ---------------- */

describe("offboarding — plan and execution", () => {
  let planId: string;
  let laptop: string;
  beforeAll(async () => {
    await grant("julien", "salesforce", "sf-user"); // scim + provisioner → automatic
    await grant("julien", "miro", "miro-member"); // manual
    const [hw] = await db
      .insert(hardwareAssets)
      .values({ tenantId, tag: "ACME-0042", model: "MacBook Air", type: "laptop", status: "assigned", assignedPersonId: P.julien! })
      .returning();
    laptop = hw!.id;
  });
  afterAll(async () => {
    await db.delete(lifecyclePlans).where(eq(lifecyclePlans.tenantId, tenantId));
    await db.delete(accessGrants).where(eq(accessGrants.tenantId, tenantId));
    await db.delete(hardwareAssets).where(eq(hardwareAssets.tenantId, tenantId));
  });

  it("plans at 18:00 tenant-local on the last day, with revoke, transfer and hardware tasks", async () => {
    planId = await scheduleOffboarding(tenantId, P.julien!, null, { kind: "system" });
    const [plan] = await db.select().from(lifecyclePlans).where(eq(lifecyclePlans.id, planId));
    // 1 Oct 2026 18:00 in Paris (CEST, UTC+2).
    expect(plan!.executeAt.toISOString()).toBe("2026-10-01T16:00:00.000Z");
    const tasks = await db.select().from(lifecycleTasks).where(eq(lifecycleTasks.planId, planId));
    const byKey = new Map(tasks.map((t) => [t.key, t]));
    expect([...byKey.keys()].sort()).toEqual(
      ["hardware:ACME-0042", "revoke:miro", "revoke:salesforce", "transfer:crm", "transfer:drive", "transfer:idp", "transfer:mail"].sort(),
    );
    expect(byKey.get("revoke:salesforce")!.automatic).toBe(true);
    expect(byKey.get("revoke:miro")!.automatic).toBe(false);
    expect(byKey.get("transfer:drive")!.detail).toMatchObject({ toPersonId: P.paul });
    expect(byKey.get("transfer:mail")!.detail).toMatchObject({ forwardToPersonId: P.paul, days: 90 });
    expect(byKey.get("transfer:idp")!.detail).toMatchObject({ deprovision: "disable_then_delete", deleteAfterDays: 30 });
    expect(byKey.get("hardware:ACME-0042")!.hardwareId).toBe(laptop);
  });

  it("drops the CRM transfer when the person holds no CRM", async () => {
    const other = await scheduleOffboarding(tenantId, P.karim!, "2026-12-01T17:00:00Z", { kind: "system" });
    const keys = (await db.select().from(lifecycleTasks).where(eq(lifecycleTasks.planId, other))).map((t) => t.key);
    expect(keys).not.toContain("transfer:crm");
    await db.delete(lifecyclePlans).where(eq(lifecyclePlans.id, other));
  });

  it("execution revokes through the core, ticks automatic tasks, leaves manual ones to IT, marks the person departed", async () => {
    await db.update(lifecyclePlans).set({ executeAt: new Date(Date.now() - 1000) }).where(eq(lifecyclePlans.id, planId));
    expect(await executeLifecyclePlan(tenantId, planId)).toBe(true);
    // A second run is a no-op: the plan was claimed.
    expect(await executeLifecyclePlan(tenantId, planId)).toBe(false);

    const tasks = await db.select().from(lifecycleTasks).where(eq(lifecycleTasks.planId, planId));
    const byKey = new Map(tasks.map((t) => [t.key, t]));
    expect(byKey.get("revoke:salesforce")!.done).toBe(true);
    expect(byKey.get("revoke:miro")!.done).toBe(false);
    expect(byKey.get("transfer:drive")!.done).toBe(false);
    expect(calls.revoke.map((c) => c.reason)).toEqual(["offboarding", "offboarding"]);

    const [p] = await db.select().from(people).where(eq(people.id, P.julien!));
    expect(p!.status).toBe("departed");
    const [hw] = await db.select().from(hardwareAssets).where(eq(hardwareAssets.id, laptop));
    expect(hw!.status).toBe("to_recover");
    const [plan] = await db.select().from(lifecyclePlans).where(eq(lifecyclePlans.id, planId));
    expect(plan!.state).toBe("done");

    // IT ticks the device as returned: back to stock.
    await setLifecycleTaskDone(tenantId, byKey.get("hardware:ACME-0042")!.id, true, { kind: "system" });
    const [back] = await db.select().from(hardwareAssets).where(eq(hardwareAssets.id, laptop));
    expect(back).toMatchObject({ status: "in_stock", assignedPersonId: null });
  });
});

describe("onboarding — plan", () => {
  afterAll(async () => {
    await db.delete(lifecyclePlans).where(eq(lifecyclePlans.tenantId, tenantId));
    await db.delete(hardwareAssets).where(eq(hardwareAssets.tenantId, tenantId));
  });

  it("plans grant tasks at 8:00 minus the lead days and reserves stock", async () => {
    const newcomer = await person("chloe", "Chloe Vasseur", { department: "Sales", managerId: P.paul, startsOn: "2030-10-07" });
    await db.insert(hardwareAssets).values({ tenantId, tag: "ACME-0100", model: "MacBook Air", type: "laptop", status: "in_stock" });
    const planId = await scheduleOnboarding(tenantId, { personId: newcomer, appIds: [APP.salesforce!, APP.miro!], hardwareModels: ["MacBook Air", "iPhone 15"] }, { kind: "system" });
    const [plan] = await db.select().from(lifecyclePlans).where(eq(lifecyclePlans.id, planId));
    // 7 Oct 2030 − 3 days = 4 Oct 2030, 08:00 Paris (CEST) = 06:00 UTC.
    expect(plan!.executeAt.toISOString()).toBe("2030-10-04T06:00:00.000Z");
    const tasks = await db.select().from(lifecycleTasks).where(eq(lifecycleTasks.planId, planId));
    const keys = tasks.map((t) => t.key).sort();
    expect(keys).toEqual(["grant:miro", "grant:salesforce", "hardware:ACME-0100", "hardware:model:iPhone 15"].sort());
    expect(tasks.find((t) => t.key === "hardware:model:iPhone 15")!.detail).toMatchObject({ outOfStock: true });
    const [hw] = await db.select().from(hardwareAssets).where(eq(hardwareAssets.tag, "ACME-0100"));
    expect(hw).toMatchObject({ status: "assigned", assignedPersonId: newcomer });
  });
});
