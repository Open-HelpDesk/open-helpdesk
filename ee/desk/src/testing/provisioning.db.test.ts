import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import {
  accessApprovals,
  accessGrants,
  db,
  deskAppTiers,
  deskConnectorRuns,
  deskConnectors,
  provisioningJobs,
  tenants,
} from "@openhelpdesk/db";
import {
  createApp,
  decideApproval,
  registerDeskExtensions,
  revokeAccess,
  runProvisioningJobs,
  setManager,
  setTiers,
  submitAccessRequest,
  upsertPerson,
} from "@openhelpdesk/desk";
import { saveConnector, testConnector } from "../connectors";
import { eeDeskExtensions } from "../extensions";
import { startMockScimApp, type MockScimApp } from "./mock-scim-app";

/**
 * End to end: an access request, approved by the manager, creates a real
 * account in a SCIM application — and revoking it deactivates then deletes
 * that account. Nothing is faked on our side: the core request API, the
 * provisioning runner and the ee SCIM connector all run for real; only the
 * SaaS application is a local stand-in (mock-scim-app.ts, node:http).
 *
 *   docker compose -f docker/docker-compose.yml up -d && pnpm db:migrate
 *   pnpm vitest run --project db ee/desk/src/testing
 */
process.env.OPENHELPDESK_EDITION = "cloud";
registerDeskExtensions(eeDeskExtensions);

const TOKEN = "figma-scim-token-" + Math.random().toString(36).slice(2);
const stamp = Date.now();
const email = (who: string) => `${who}.${stamp}@e2e.example`;

let app: MockScimApp;
let tenantId: string;
let requesterId: string;
let managerId: string;
let appId: string;
let tierId: string;
let connectorId: string;

/** Runs the provisioning sweep until this tenant has no due job left (other tenants may share the queue). */
async function drain(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await runProvisioningJobs(50);
    const due = await db
      .select({ id: provisioningJobs.id, runAfter: provisioningJobs.runAfter })
      .from(provisioningJobs)
      .where(and(eq(provisioningJobs.tenantId, tenantId), eq(provisioningJobs.state, "queued")));
    if (due.every((j) => j.runAfter > new Date())) return;
  }
}

beforeAll(async () => {
  app = await startMockScimApp({ token: TOKEN });
  const [t] = await db
    .insert(tenants)
    .values({
      slug: `e2e-prov-${stamp}`,
      name: "Provisioning e2e",
      locale: "en",
      entitlements: { serviceDesk: true, deskConnectors: true, maxDeskPeople: null },
    })
    .returning();
  tenantId = t!.id;

  managerId = (await upsertPerson(tenantId, { email: email("sophie"), name: "Sophie Bernard", department: "Sales" }, { kind: "system" })).personId;
  requesterId = (await upsertPerson(tenantId, { email: email("lea"), name: "Léa Martin", department: "Sales" }, { kind: "system" })).personId;
  await setManager(tenantId, requesterId, managerId, { kind: "system" });

  connectorId = await saveConnector(tenantId, { kind: "scim", name: "SCIM 2.0", settings: {} }, { kind: "system" });
  appId = await createApp(
    tenantId,
    { name: "Figma", category: "Design", approvalLevels: 1, connectorId, scimBaseUrl: app.url, scimToken: TOKEN },
    { kind: "system" },
  );
  await setTiers(tenantId, appId, [{ name: "Editor", monthlyCostCents: 1500, externalGroup: "app-figma-editor" }], { kind: "system" });
  const [tier] = await db.select().from(deskAppTiers).where(eq(deskAppTiers.appId, appId));
  tierId = tier!.id;
});

afterAll(async () => {
  await app?.close();
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
});

describe("access request → SCIM account, end to end", () => {
  it("the connection test proves the application reachable (and only then is it healthy)", async () => {
    const res = await testConnector(tenantId, connectorId, { kind: "system" });
    expect(res).toMatchObject({ ok: true });
    const [c] = await db.select().from(deskConnectors).where(eq(deskConnectors.id, connectorId));
    expect(c!.status).toBe("connected");
  });

  it("request, manager approval, provisioning: the account exists in the application", async () => {
    const submitted = await submitAccessRequest(
      tenantId,
      { personId: requesterId, appId, tierId, durationDays: null, justification: "Design reviews with the product team" },
      { kind: "person", personId: requesterId },
    );
    expect(submitted.state).toBe("awaiting_manager");

    const [approval] = await db
      .select()
      .from(accessApprovals)
      .where(and(eq(accessApprovals.requestId, submitted.requestId), eq(accessApprovals.decision, "pending")))
      .orderBy(asc(accessApprovals.position));
    expect(approval!.approverPersonId).toBe(managerId);
    const decided = await decideApproval(tenantId, approval!.id, "approved", null, "portal", { kind: "person", personId: managerId });
    expect(decided.state).toBe("provisioning");
    expect(app.users.size).toBe(0);

    await drain();

    const users = [...app.users.values()];
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ userName: email("lea"), displayName: "Léa Martin", active: true, externalId: requesterId });
    const [grant] = await db.select().from(accessGrants).where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, requesterId)));
    expect(grant!.externalAccountId).toBe(users[0]!.id);
    expect(grant!.revokedAt).toBeNull();

    const runs = await db.select().from(deskConnectorRuns).where(eq(deskConnectorRuns.connectorId, connectorId));
    expect(runs.map((r) => r.message)).toContain("Figma: account created for Léa Martin");
  });

  it("revocation deactivates the account, and the deferred deletion removes it", async () => {
    const [grant] = await db.select().from(accessGrants).where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, requesterId)));
    const accountId = grant!.externalAccountId!;
    await revokeAccess(tenantId, grant!.id, "Left the project", { kind: "system" });
    await drain();
    // Default policy: disable now, delete after the grace period.
    expect(app.users.get(accountId)?.active).toBe(false);

    const deferred = await db
      .select()
      .from(provisioningJobs)
      .where(and(eq(provisioningJobs.grantId, grant!.id), eq(provisioningJobs.action, "delete"), eq(provisioningJobs.state, "queued")));
    expect(deferred).toHaveLength(1);
    // Fast-forward the grace period.
    await db.update(provisioningJobs).set({ runAfter: new Date(Date.now() - 1000) }).where(eq(provisioningJobs.id, deferred[0]!.id));
    await drain();
    expect(app.users.has(accountId)).toBe(false);

    const methods = app.requests.map((r) => `${r.method} ${r.path.split("?")[0]}`);
    expect(methods).toContain("POST /scim/v2/Users");
    expect(methods).toContain(`PATCH /scim/v2/Users/${accountId}`);
    expect(methods).toContain(`DELETE /scim/v2/Users/${accountId}`);
  });

  it("a failing application is logged as an error run and never passes silently", async () => {
    const other = (await upsertPerson(tenantId, { email: email("hugo"), name: "Hugo Blanc", department: "Sales" }, { kind: "system" })).personId;
    await setManager(tenantId, other, managerId, { kind: "system" });
    const { requestId } = await submitAccessRequest(tenantId, { personId: other, appId, tierId, durationDays: null, justification: "Mockups" }, { kind: "person", personId: other });
    const [approval] = await db.select().from(accessApprovals).where(and(eq(accessApprovals.requestId, requestId), eq(accessApprovals.decision, "pending")));
    app.failNext(503, 1);
    await decideApproval(tenantId, approval!.id, "approved", null, "portal", { kind: "person", personId: managerId });
    await runProvisioningJobs(50);
    const [c] = await db.select().from(deskConnectors).where(eq(deskConnectors.id, connectorId));
    expect(c!.status).toBe("error");
    expect(c!.lastError).toContain("HTTP 503");
    const [job] = await db.select().from(provisioningJobs).where(eq(provisioningJobs.requestId, requestId));
    expect(job!.lastError).toContain("HTTP 503");
    expect(app.users.size).toBe(0);
  });
});
