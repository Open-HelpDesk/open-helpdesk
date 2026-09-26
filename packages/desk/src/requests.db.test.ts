import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import {
  accessApprovals,
  accessGrants,
  accessRequests,
  auditEvents,
  db,
  deskConnectors,
  provisioningJobs,
  tenants,
  tickets,
  users,
} from "@openhelpdesk/db";
import {
  cancelAccessRequest,
  createApp,
  decideApproval,
  directGrant,
  importPeopleCsv,
  markProvisioned,
  previewCircuit,
  registerDeskExtensions,
  revokeAccess,
  setAbsence,
  setAutoGroups,
  setTiers,
  submitAccessRequest,
  upsertPerson,
  type Actor,
  type Provisioner,
} from "./index";
import { describeDeskAudit } from "./audit";
import { domainT } from "./i18n";
import { setDeskMailSender, type DeskMail } from "./notify";
import { runProvisioningJobs } from "./provisioning";
import { sweepApprovalReminders, sweepGrantExpiries } from "./sweeps";
import { DeskForbiddenError, DeskValidationError } from "./errors";
import { peopleGroups } from "@openhelpdesk/db";

/**
 * The request lifecycle of spec 19 §7, against a real database:
 *
 *   docker compose -f docker/docker-compose.yml up -d && pnpm db:migrate
 *   pnpm vitest run --project db packages/desk
 *
 * Writes into a throwaway workspace, removed afterwards; the demo workspace is
 * not touched. Emails are captured, not sent. The fake connector below answers
 * only for this workspace.
 */

let tenantId = "";
let agentId = "";
const ids: Record<string, string> = {};
const mails: DeskMail[] = [];
const t = domainT("en");

let provisionerMode: "ok" | "fail" = "ok";
const provisioner: Provisioner = {
  async create(input) {
    if (provisionerMode === "fail") throw new Error("SCIM 503 Service Unavailable");
    return { externalAccountId: `scim-${input.person.email}` };
  },
  async update() {},
  async disable() {
    if (provisionerMode === "fail") throw new Error("SCIM 503 Service Unavailable");
  },
  async delete() {},
};

const agent = (): Actor => ({ kind: "agent", userId: agentId });
const person = (key: string): Actor => ({ kind: "person", personId: ids[key]! });

async function journal(targetId: string): Promise<string[]> {
  const rows = await db.select().from(auditEvents).where(eq(auditEvents.targetId, targetId)).orderBy(asc(auditEvents.createdAt));
  return rows.map((r) => describeDeskAudit(r.action, r.after, t));
}

async function approvalsOf(requestId: string) {
  return db.select().from(accessApprovals).where(eq(accessApprovals.requestId, requestId)).orderBy(asc(accessApprovals.position));
}

beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ slug: `desk-test-${Date.now()}`, name: "Desk — test", locale: "en", timezone: "Europe/Paris" })
    .returning();
  if (!tenant) throw new Error("test workspace not created — is the database migrated?");
  tenantId = tenant.id;
  const [u] = await db
    .insert(users)
    .values({ tenantId, email: "sarah.leroy@acme.test", name: "Sarah Leroy", role: "admin", status: "active" })
    .returning();
  agentId = u!.id;

  registerDeskExtensions({
    connectorHealthy: async (_tx, tid) => tid === tenantId,
    provisionerFor: async (tid, kind) => (tid === tenantId && kind === "scim" ? provisioner : null),
  });
  setDeskMailSender(async (m) => {
    mails.push(m);
  });

  const report = await importPeopleCsv(
    tenantId,
    [
      "email,name,title,department,manager_email",
      "ines.haddad@acme.test,Inès Haddad,Account executive,Sales,paul.mercier@acme.test",
      "paul.mercier@acme.test,Paul Mercier,Sales director,Sales,nadia.roux@acme.test",
      "nadia.roux@acme.test,Nadia Roux,CEO,Management,",
      "karim.benali@acme.test,Karim Benali,Account executive,Sales,paul.mercier@acme.test",
      "sarah.leroy@acme.test,Sarah Leroy,IT lead,IT,nadia.roux@acme.test",
      "bad-line,No Email,,,",
      "lea.martin@acme.test,Léa Martin,Designer,Design,ghost@acme.test",
    ].join("\n"),
    { kind: "system" },
  );
  expect(report.created).toBe(6);
  expect(report.errors).toEqual([
    { line: 7, message: "invalid_email" },
    { line: 8, message: "manager_not_found" },
  ]);

  const rows = await db.execute<{ id: string; email: string }>(
    // RLS is bypassed by the local role; the tenant filter keeps it honest anyway.
    (await import("drizzle-orm")).sql`select id, email from app.people where tenant_id = ${tenantId}`,
  );
  for (const r of rows as unknown as Array<{ id: string; email: string }>) ids[r.email.split(".")[0]!] = r.id;

  // Sarah the agent is also an employee.
  const { people } = await import("@openhelpdesk/db");
  await db.update(people).set({ userId: agentId }).where(eq(people.id, ids.sarah!));

  const mk = async (name: string, approvalLevels: 0 | 1 | 2, ownerKey: string, extra: Record<string, unknown> = {}) => {
    const id = await createApp(tenantId, { name, category: "Sales", approvalLevels, ownerPersonId: ids[ownerKey]!, ...extra }, agent());
    await setTiers(tenantId, id, [{ name: "User", monthlyCostCents: 5000 }, { name: "Admin", monthlyCostCents: 15000, privileged: true }], agent());
    return id;
  };
  ids.hubspot = await mk("HubSpot", 1, "sarah");
  ids.salesforce = await mk("Salesforce", 2, "paul");
  ids.figma = await mk("Figma", 2, "sarah", { maxDurationDays: 90 });
  const [conn] = await db.insert(deskConnectors).values({ tenantId, kind: "scim", name: "SCIM", status: "connected" }).returning();
  ids.github = await mk("GitHub", 1, "sarah", { connectorId: conn!.id });
  ids.notion = await mk("Notion", 0, "sarah");
});

afterEach(() => {
  mails.length = 0;
  provisionerMode = "ok";
});

afterAll(async () => {
  registerDeskExtensions({});
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
});

async function tierOf(appId: string, name = "User"): Promise<string> {
  const { deskAppTiers } = await import("@openhelpdesk/db");
  const [tier] = await db.select().from(deskAppTiers).where(and(eq(deskAppTiers.appId, appId), eq(deskAppTiers.name, name)));
  return tier!.id;
}

describe("directory", () => {
  it("pairs every person with a contact and keeps computed groups", async () => {
    const groups = await db.select().from(peopleGroups).where(eq(peopleGroups.tenantId, tenantId));
    expect(groups.map((g) => [g.kind, g.name]).sort()).toEqual(
      [
        ["department:Design", "Team Design"],
        ["department:IT", "Team IT"],
        ["department:Management", "Team Management"],
        ["department:Sales", "Team Sales"],
        ["everyone", "All employees"],
      ].sort(),
    );
  });

  it("sets leaving when the leave date is in the future", async () => {
    const out = await upsertPerson(tenantId, { email: "tom.leaving@acme.test", name: "Tom Leaving", leavesOn: "2099-01-01", managerEmail: "paul.mercier@acme.test" }, agent());
    const { people } = await import("@openhelpdesk/db");
    const [p] = await db.select().from(people).where(eq(people.id, out.personId));
    expect(p!.status).toBe("leaving");
    expect(p!.managerId).toBe(ids.paul);
  });
});

describe("submit → approve → manual provisioning → active", () => {
  let requestId = "";

  it("creates the ticket, the request, the pending approval, and tells the manager", async () => {
    const out = await submitAccessRequest(
      tenantId,
      { personId: ids.ines!, appId: ids.hubspot!, tierId: await tierOf(ids.hubspot!), durationDays: null, justification: "ABM campaigns from October." },
      person("ines"),
    );
    requestId = out.requestId;
    expect(out.state).toBe("awaiting_manager");
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.tenantId, tenantId), eq(tickets.number, out.ticketNumber)));
    expect(ticket).toMatchObject({ type: "access_request", channel: "portal", subject: "Access: HubSpot — User" });
    const approvals = await approvalsOf(requestId);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ step: "manager", approverPersonId: ids.paul, decision: "pending" });
    expect(mails.map((m) => [m.to, m.subject])).toEqual([["paul.mercier@acme.test", "Access request to approve: HubSpot for Inès Haddad"]]);
    expect(await journal(requestId)).toEqual(["Request created by Inès Haddad", "Notification sent to Paul Mercier (manager)"]);
  });

  it("refuses a duplicate", async () => {
    await expect(
      submitAccessRequest(tenantId, { personId: ids.ines!, appId: ids.hubspot!, tierId: await tierOf(ids.hubspot!), durationDays: null, justification: "again" }, person("ines")),
    ).rejects.toMatchObject({ code: "duplicate_request" });
  });

  it("lets only the designated approver decide", async () => {
    const [approval] = await approvalsOf(requestId);
    await expect(decideApproval(tenantId, approval!.id, "approved", null, "portal", person("karim"))).rejects.toBeInstanceOf(DeskForbiddenError);
    await expect(decideApproval(tenantId, approval!.id, "approved", null, "portal", person("ines"))).rejects.toMatchObject({ code: "self_approval" });
  });

  it("the manager's approval queues a manual task for IT", async () => {
    const [approval] = await approvalsOf(requestId);
    const out = await decideApproval(tenantId, approval!.id, "approved", "OK for Q4", "portal", person("paul"));
    expect(out.state).toBe("provisioning");
    const [grant] = await db.select().from(accessGrants).where(eq(accessGrants.requestId, requestId));
    expect(grant).toMatchObject({ personId: ids.ines, appId: ids.hubspot, source: "request", revokedAt: null });
    const [job] = await db.select().from(provisioningJobs).where(eq(provisioningJobs.grantId, grant!.id));
    expect(job).toMatchObject({ action: "create", state: "manual", connectorKind: "manual" });
    expect((await journal(requestId)).slice(2)).toEqual([
      "Approved by Paul Mercier (manager) — “OK for Q4”",
      "Account creation task assigned to the IT team",
    ]);
  });

  it("IT ticks the task: access active, ticket resolved", async () => {
    const [grant] = await db.select().from(accessGrants).where(eq(accessGrants.requestId, requestId));
    const [job] = await db.select().from(provisioningJobs).where(eq(provisioningJobs.grantId, grant!.id));
    await expect(markProvisioned(tenantId, job!.id, person("paul"))).rejects.toMatchObject({ code: "agent_only" });
    await markProvisioned(tenantId, job!.id, agent());
    const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId));
    expect(req!.state).toBe("active");
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, req!.ticketId));
    expect(ticket!.status).toBe("resolved");
    const [doneJob] = await db.select().from(provisioningJobs).where(eq(provisioningJobs.id, job!.id));
    expect(doneJob).toMatchObject({ state: "done", doneByUserId: agentId });
    expect((await journal(requestId)).at(-1)).toBe("Account created manually by Sarah Leroy");
  });

  it("a second request for an app already held is refused", async () => {
    await expect(
      submitAccessRequest(tenantId, { personId: ids.ines!, appId: ids.hubspot!, tierId: await tierOf(ids.hubspot!), durationDays: null, justification: "x" }, person("ines")),
    ).rejects.toMatchObject({ code: "active_grant" });
  });
});

describe("circuit rules on the real data", () => {
  it("merges manager and owner into one approval (Salesforce, owner = Paul)", async () => {
    const out = await submitAccessRequest(
      tenantId,
      { personId: ids.karim!, appId: ids.salesforce!, tierId: await tierOf(ids.salesforce!), durationDays: null, justification: "Key accounts." },
      person("karim"),
    );
    const approvals = await approvalsOf(out.requestId);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.mergedSteps).toEqual(["manager", "owner"]);
    const res = await decideApproval(tenantId, approvals[0]!.id, "approved", null, "slack", person("paul"));
    expect(res.state).toBe("provisioning");
    expect(await journal(out.requestId)).toContain("Approved by Paul Mercier (manager and owner)");
  });

  it("requires a justification when a human approves, and refuses a duration above the app's maximum", async () => {
    const tierId = await tierOf(ids.figma!);
    await expect(submitAccessRequest(tenantId, { personId: ids.karim!, appId: ids.figma!, tierId, durationDays: 90, justification: "  " }, person("karim"))).rejects.toMatchObject({
      code: "justification_required",
    });
    await expect(submitAccessRequest(tenantId, { personId: ids.karim!, appId: ids.figma!, tierId, durationDays: null, justification: "x" }, person("karim"))).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("auto-approves a member of an auto-approval group", async () => {
    const [sales] = await db.select().from(peopleGroups).where(and(eq(peopleGroups.tenantId, tenantId), eq(peopleGroups.kind, "department:Sales")));
    await setAutoGroups(tenantId, ids.figma!, [sales!.id], agent());
    const preview = await previewCircuit(tenantId, ids.karim!, ids.figma!, await tierOf(ids.figma!));
    expect(preview).toMatchObject({ effectiveLevels: 0, autoRule: `group:${sales!.id}`, justificationRequired: false, durations: [90, 30] });
    const out = await submitAccessRequest(tenantId, { personId: ids.karim!, appId: ids.figma!, tierId: await tierOf(ids.figma!), durationDays: 30, justification: null }, person("karim"));
    expect(out.state).toBe("provisioning");
    expect(await journal(out.requestId)).toEqual(["Request created by Karim Benali", "Auto-approved (rule: Team Sales)", "Account creation task assigned to the IT team"]);
    const [grant] = await db.select().from(accessGrants).where(eq(accessGrants.requestId, out.requestId));
    expect(grant!.expiresOn).not.toBeNull();
  });

  it("routes around an absent manager to the manager's manager, and says on whose behalf", async () => {
    await setAbsence(tenantId, ids.paul!, "2099-12-31", agent());
    try {
      const preview = await previewCircuit(tenantId, ids.ines!, ids.salesforce!, await tierOf(ids.salesforce!));
      // Paul is both manager and owner of Salesforce: both steps go up to Nadia, and merge.
      expect(preview.steps).toEqual([{ step: "manager", approverPersonId: ids.nadia, onBehalfOfPersonId: ids.paul, mergedSteps: ["manager", "owner"] }]);
    } finally {
      await setAbsence(tenantId, ids.paul!, null, agent());
    }
  });

  it("blocks a request nobody can approve", async () => {
    await expect(
      submitAccessRequest(tenantId, { personId: ids.nadia!, appId: ids.hubspot!, tierId: await tierOf(ids.hubspot!), durationDays: null, justification: "x" }, person("nadia")),
    ).rejects.toMatchObject({ code: "blocked", message: "no_manager" });
  });
});

describe("refuse and cancel", () => {
  it("refusal keeps the step it stopped at and resolves the ticket", async () => {
    const out = await submitAccessRequest(
      tenantId,
      { personId: ids.ines!, appId: ids.salesforce!, tierId: await tierOf(ids.salesforce!, "Admin"), durationDays: null, justification: "Pipelines." },
      person("ines"),
    );
    const [approval] = await approvalsOf(out.requestId);
    expect((await decideApproval(tenantId, approval!.id, "refused", "Not for sales reps", "portal", person("paul"))).state).toBe("refused");
    const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, out.requestId));
    expect(req).toMatchObject({ state: "refused", stoppedAtState: "awaiting_manager" });
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, req!.ticketId));
    expect(ticket!.status).toBe("resolved");
    expect((await journal(out.requestId)).at(-1)).toBe("Refused by Paul Mercier — “Not for sales reps”");
    await expect(decideApproval(tenantId, approval!.id, "approved", null, "portal", person("paul"))).rejects.toBeInstanceOf(DeskValidationError);
  });

  it("the requester cancels while waiting, not once provisioning started", async () => {
    const out = await submitAccessRequest(
      tenantId,
      { personId: ids.ines!, appId: ids.salesforce!, tierId: await tierOf(ids.salesforce!), durationDays: null, justification: "Pipeline review." },
      person("ines"),
    );
    await expect(cancelAccessRequest(tenantId, out.requestId, person("karim"))).rejects.toMatchObject({ code: "not_requester" });
    await cancelAccessRequest(tenantId, out.requestId, person("ines"));
    const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, out.requestId));
    expect(req).toMatchObject({ state: "cancelled", stoppedAtState: "awaiting_manager" });
    const approvals = await approvalsOf(out.requestId);
    expect(approvals.every((a) => a.decision === "skipped")).toBe(true);

    const auto = await submitAccessRequest(tenantId, { personId: ids.ines!, appId: ids.notion!, tierId: await tierOf(ids.notion!), durationDays: null, justification: null }, person("ines"));
    await expect(cancelAccessRequest(tenantId, auto.requestId, person("ines"))).rejects.toMatchObject({ code: "invalid_state" });
  });
});

describe("automatic provisioning", () => {
  it("a healthy connector creates the account and the request becomes active", async () => {
    const preview = await previewCircuit(tenantId, ids.ines!, ids.github!, await tierOf(ids.github!));
    expect(preview.provisioning).toEqual({ kind: "scim", automatic: true });
    const out = await submitAccessRequest(tenantId, { personId: ids.ines!, appId: ids.github!, tierId: await tierOf(ids.github!), durationDays: null, justification: "Mobile repo." }, person("ines"));
    const [approval] = await approvalsOf(out.requestId);
    await decideApproval(tenantId, approval!.id, "approved", null, "portal", person("paul"));
    const [grant] = await db.select().from(accessGrants).where(eq(accessGrants.requestId, out.requestId));
    const [job] = await db.select().from(provisioningJobs).where(eq(provisioningJobs.grantId, grant!.id));
    expect(job!.state).toBe("queued");
    const res = await runProvisioningJobs(50, new Date(), { tenantId });
    expect(res.done).toBe(1);
    const [after] = await db.select().from(accessGrants).where(eq(accessGrants.id, grant!.id));
    expect(after!.externalAccountId).toBe("scim-ines.haddad@acme.test");
    const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, out.requestId));
    expect(req!.state).toBe("active");
    expect((await journal(out.requestId)).at(-1)).toBe("Account created via SCIM");
  });

  it("a failing connector retries, then hands the job to IT with its error — never silently", async () => {
    const out = await submitAccessRequest(tenantId, { personId: ids.karim!, appId: ids.github!, tierId: await tierOf(ids.github!), durationDays: null, justification: "Mobile repo." }, person("karim"));
    const [approval] = await approvalsOf(out.requestId);
    await decideApproval(tenantId, approval!.id, "approved", null, "portal", person("paul"));
    provisionerMode = "fail";
    let now = Date.now();
    const r1 = await runProvisioningJobs(50, new Date(now), { tenantId });
    expect(r1).toEqual({ done: 0, failed: 0, manual: 0 });
    now += 2 * 60_000;
    await runProvisioningJobs(50, new Date(now), { tenantId });
    now += 10 * 60_000;
    const r3 = await runProvisioningJobs(50, new Date(now), { tenantId });
    expect(r3.failed).toBe(1);
    const [grant] = await db.select().from(accessGrants).where(eq(accessGrants.requestId, out.requestId));
    const [job] = await db.select().from(provisioningJobs).where(eq(provisioningJobs.grantId, grant!.id));
    expect(job).toMatchObject({ state: "manual", attempts: 3, lastError: "SCIM 503 Service Unavailable" });
    const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, out.requestId));
    expect(req!.state).toBe("provisioning_failed");
    expect((await journal(out.requestId)).at(-1)).toBe("Connector SCIM failed: SCIM 503 Service Unavailable — handed to the IT team");
    expect(mails.some((m) => m.to === "sarah.leroy@acme.test" && m.subject === "Account creation failed for GitHub")).toBe(true);

    // IT creates it by hand: the request recovers.
    await markProvisioned(tenantId, job!.id, agent());
    const [done] = await db.select().from(accessRequests).where(eq(accessRequests.id, out.requestId));
    expect(done!.state).toBe("active");
  });
});

describe("grants", () => {
  it("direct assignment bypasses the circuit and says so; revocation queues the removal", async () => {
    const grantId = await directGrant(tenantId, ids.nadia!, ids.hubspot!, await tierOf(ids.hubspot!), null, agent());
    await expect(directGrant(tenantId, ids.nadia!, ids.hubspot!, await tierOf(ids.hubspot!), null, person("paul"))).rejects.toMatchObject({ code: "agent_only" });
    expect(await journal(grantId)).toEqual([
      "Direct assignment by Sarah Leroy for Nadia Roux: the approval circuit was bypassed",
      "Account creation task assigned to the IT team",
    ]);
    const [job] = await db.select().from(provisioningJobs).where(eq(provisioningJobs.grantId, grantId));
    await markProvisioned(tenantId, job!.id, agent());
    await revokeAccess(tenantId, grantId, "Role change", agent());
    const jobs = await db.select().from(provisioningJobs).where(eq(provisioningJobs.grantId, grantId)).orderBy(asc(provisioningJobs.createdAt));
    expect(jobs.map((j) => [j.action, j.state])).toEqual([
      ["create", "done"],
      ["disable", "manual"],
    ]);
    expect((await journal(grantId)).slice(-2)).toEqual(["Account removal task assigned to the IT team", "Access to HubSpot revoked for Nadia Roux by Sarah Leroy: Role change"]);
  });

  it("an expired temporary access is revoked by the sweep", async () => {
    const [g] = await db.select().from(accessGrants).where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, ids.karim!), eq(accessGrants.appId, ids.figma!)));
    await db.update(accessGrants).set({ expiresOn: "2020-01-01" }).where(eq(accessGrants.id, g!.id));
    const out = await sweepGrantExpiries(new Date(), { tenantId });
    expect(out.revoked).toBe(1);
    const [after] = await db.select().from(accessGrants).where(eq(accessGrants.id, g!.id));
    expect(after!.revokeReason).toBe("expired");
  });
});

describe("reminders", () => {
  it("reminds after remindAfterHours, escalates after escalateAfterHours", async () => {
    const out = await submitAccessRequest(
      tenantId,
      { personId: ids.karim!, appId: ids.hubspot!, tierId: await tierOf(ids.hubspot!), durationDays: null, justification: "Follow-up." },
      person("karim"),
    );
    const base = Date.now();
    expect(await sweepApprovalReminders(new Date(base + 25 * 3_600_000), { tenantId })).toEqual({ reminded: 1, escalated: 0 });
    expect(await sweepApprovalReminders(new Date(base + 26 * 3_600_000), { tenantId })).toEqual({ reminded: 0, escalated: 0 });
    expect(await sweepApprovalReminders(new Date(base + 49 * 3_600_000), { tenantId })).toEqual({ reminded: 0, escalated: 1 });
    const [approval] = await approvalsOf(out.requestId);
    expect(approval).toMatchObject({ approverPersonId: ids.nadia, onBehalfOfPersonId: ids.paul });
    expect((await journal(out.requestId)).slice(-2)).toEqual([
      "Automatic reminder sent to Paul Mercier",
      "Escalated to Nadia Roux: no answer from Paul Mercier within 48 h",
    ]);
  });
});
