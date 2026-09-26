import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditEvents, db, people, peopleGroupMembers, peopleGroups, tenants } from "@openhelpdesk/db";
import { handleScim, rotateScimToken, tenantForScimToken } from "../scim";

/**
 * Inbound SCIM against a real database, replaying what Microsoft Entra ID
 * sends when a user is assigned to the enterprise application, changed,
 * disabled, grouped and finally removed.
 *
 *   docker compose -f docker/docker-compose.yml up -d && pnpm db:migrate
 *   pnpm vitest run --project db ee/desk/src/scim
 *
 * A throwaway workspace is created and deleted: the demo tenant is untouched.
 */
process.env.OPENHELPDESK_EDITION = "cloud";

const ENT = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
const OHD = "urn:ietf:params:scim:schemas:extension:openhelpdesk:2.0:User";
const PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const stamp = Date.now();
const mail = (who: string) => `${who}.${stamp}@scim-test.example`;

let tenantId: string;
let lockedTenantId: string;

const scim = (method: string, path: string, body?: unknown, query = "") =>
  handleScim(tenantId, method, path, new URLSearchParams(query), body ?? null);

const entraUser = (who: string, name: [string, string], extra: Record<string, unknown> = {}) => ({
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", ENT],
  externalId: `aad-${who}-${stamp}`,
  userName: mail(who),
  active: true,
  displayName: `${name[0]} ${name[1]}`,
  emails: [{ primary: true, type: "work", value: mail(who) }],
  name: { formatted: `${name[0]} ${name[1]}`, familyName: name[1], givenName: name[0] },
  title: "Account executive",
  [ENT]: { department: "Sales", employeeNumber: "1042" },
  ...extra,
});

async function person(id: string) {
  const [row] = await db.select().from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, id)));
  return row!;
}

beforeAll(async () => {
  const ent = { serviceDesk: true, deskConnectors: true, maxDeskPeople: null };
  const [t] = await db.insert(tenants).values({ slug: `scim-test-${stamp}`, name: "SCIM test", locale: "en", entitlements: ent }).returning();
  tenantId = t!.id;
  const [l] = await db
    .insert(tenants)
    .values({ slug: `scim-locked-${stamp}`, name: "SCIM locked", locale: "en", entitlements: { serviceDesk: true, deskConnectors: false } })
    .returning();
  lockedTenantId = l!.id;
});

afterAll(async () => {
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  if (lockedTenantId) await db.delete(tenants).where(eq(tenants.id, lockedTenantId));
});

describe("SCIM token", () => {
  it("rotates, resolves its tenant, and forgets the previous one", async () => {
    const first = await rotateScimToken(tenantId, { kind: "system" });
    expect(first.token).toMatch(/^ohd_scim_[a-f0-9]{40}$/);
    expect(await tenantForScimToken(first.token)).toBe(tenantId);
    const second = await rotateScimToken(tenantId, { kind: "system" });
    expect(await tenantForScimToken(second.token)).toBe(tenantId);
    expect(await tenantForScimToken(first.token)).toBeNull();
    expect(await tenantForScimToken("ohd_scim_" + "0".repeat(40))).toBeNull();
    expect(await tenantForScimToken("garbage")).toBeNull();
  });
  it("refuses a tenant without deskConnectors", async () => {
    await expect(rotateScimToken(lockedTenantId, { kind: "system" })).rejects.toThrow(/deskConnectors/);
    const res = await handleScim(lockedTenantId, "GET", "/Users", new URLSearchParams(), null);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: "403" });
  });
});

describe("discovery", () => {
  it("serves ServiceProviderConfig, ResourceTypes and Schemas as scim+json", async () => {
    const spc = await scim("GET", "/ServiceProviderConfig");
    expect(spc.status).toBe(200);
    expect(spc.headers?.["content-type"]).toBe("application/scim+json");
    expect(spc.body).toMatchObject({ patch: { supported: true }, bulk: { supported: false }, filter: { supported: true } });
    const rt = await scim("GET", "/ResourceTypes");
    expect((rt.body as { Resources: Array<{ id: string }> }).Resources.map((r) => r.id)).toEqual(["User", "Group"]);
    expect((await scim("GET", `/Schemas/${ENT}`)).status).toBe(200);
    expect((await scim("GET", "/Nope")).status).toBe(404);
  });
});

describe("Entra ID provisioning cycle", () => {
  let managerId: string;
  let leaId: string;
  let lateId: string;
  let groupId: string;

  it("probes then creates the manager", async () => {
    const probe = await scim("GET", "/Users", undefined, `filter=${encodeURIComponent(`userName eq "${mail("sophie")}"`)}`);
    expect(probe.body).toMatchObject({ totalResults: 0, Resources: [] });
    const res = await scim("POST", "/Users", entraUser("sophie", ["Sophie", "Bernard"], { title: "Head of sales" }));
    expect(res.status).toBe(201);
    managerId = (res.body as { id: string }).id;
    expect(res.headers?.location).toBe(`/api/scim/v2/Users/${managerId}`);
    const row = await person(managerId);
    expect(row).toMatchObject({ email: mail("sophie"), name: "Sophie Bernard", department: "Sales", title: "Head of sales", source: "scim", status: "active" });
  });

  it("creates a user whose enterprise manager is a SCIM id, with hire and leave dates", async () => {
    const res = await scim(
      "POST",
      "/Users",
      entraUser("lea", ["Léa", "Martin"], {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", ENT, OHD],
        [ENT]: { department: "Sales", manager: { value: managerId } },
        [OHD]: { hireDate: "2026-10-01" },
      }),
    );
    expect(res.status).toBe(201);
    leaId = (res.body as { id: string }).id;
    const row = await person(leaId);
    expect(row.managerId).toBe(managerId);
    expect(row.startsOn).toBe("2026-10-01");
    expect(row.externalId).toBe(`aad-lea-${stamp}`);
    // GET answers what was sent, plus what the server owns.
    const got = await scim("GET", `/Users/${leaId}`);
    expect(got.body).toMatchObject({ id: leaId, userName: mail("lea"), active: true, [ENT]: { manager: { value: managerId } }, meta: { resourceType: "User" } });
    expect(got.headers?.etag).toMatch(/^W\/"/);
  });

  it("refuses a duplicate userName with scimType uniqueness", async () => {
    const res = await scim("POST", "/Users", entraUser("lea", ["Léa", "Martin"]));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ status: "409", scimType: "uniqueness" });
  });

  it("links a manager that arrives after its report", async () => {
    const late = await scim("POST", "/Users", entraUser("hugo", ["Hugo", "Blanc"], { [ENT]: { department: "Ops", manager: { value: "00000000-0000-4000-8000-000000000001" } } }));
    lateId = (late.body as { id: string }).id;
    expect((await person(lateId)).managerId).toBeNull();
    // Entra sends the manager as a later PATCH once the manager exists.
    const p = await scim("PATCH", `/Users/${lateId}`, { schemas: [PATCH], Operations: [{ op: "Add", path: `${ENT}:manager`, value: managerId }] });
    expect(p.status).toBe(200);
    expect((await person(lateId)).managerId).toBe(managerId);
  });

  it("applies Entra's PATCH replace sequence", async () => {
    const res = await scim("PATCH", `/Users/${leaId}`, {
      schemas: [PATCH],
      Operations: [
        { op: "Replace", path: "title", value: "Senior account executive" },
        { op: "Replace", path: `${ENT}:department`, value: "Marketing" },
        { op: "Replace", path: 'emails[type eq "work"].value', value: mail("lea.martin") },
        { op: "Replace", path: "userName", value: mail("lea.martin") },
        { op: "Add", path: `${OHD}:leaveDate`, value: "2099-06-30" },
      ],
    });
    expect(res.status).toBe(200);
    const row = await person(leaId);
    expect(row).toMatchObject({ title: "Senior account executive", department: "Marketing", email: mail("lea.martin"), leavesOn: "2099-06-30", status: "leaving" });
    const byName = await scim("GET", "/Users", undefined, `filter=${encodeURIComponent(`userName eq "${mail("lea.martin").toUpperCase()}"`)}`);
    expect((byName.body as { totalResults: number }).totalResults).toBe(1);
    const byExt = await scim("GET", "/Users", undefined, `filter=${encodeURIComponent(`externalId eq "aad-lea-${stamp}"`)}`);
    expect((byExt.body as { Resources: Array<{ id: string }> }).Resources[0]!.id).toBe(leaId);
  });

  it("suspends on active False (Entra) and on a path-less replace (Okta)", async () => {
    const res = await scim("PATCH", `/Users/${leaId}`, { schemas: [PATCH], Operations: [{ op: "Replace", path: "active", value: "False" }] });
    expect(res.body).toMatchObject({ active: false });
    expect((await person(leaId)).status).toBe("suspended");
    await scim("PATCH", `/Users/${leaId}`, { schemas: [PATCH], Operations: [{ op: "replace", value: { active: true } }] });
    expect((await person(leaId)).status).toBe("leaving");
    await scim("PATCH", `/Users/${leaId}`, { schemas: [PATCH], Operations: [{ op: "replace", value: { active: false } }] });
    expect((await person(leaId)).status).toBe("suspended");
    const lines = await db.select().from(auditEvents).where(and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.targetId, leaId), eq(auditEvents.action, "desk.person.suspended")));
    expect(lines.length).toBe(2);
    expect(lines[0]!.actorType).toBe("scim");
  });

  it("creates a group, then adds and removes members", async () => {
    const created = await scim("POST", "/Groups", {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      externalId: `aad-group-${stamp}`,
      displayName: `Sales team ${stamp}`,
      members: [],
    });
    expect(created.status).toBe(201);
    groupId = (created.body as { id: string }).id;
    const add = await scim("PATCH", `/Groups/${groupId}`, {
      schemas: [PATCH],
      Operations: [{ op: "Add", path: "members", value: [{ value: managerId }, { value: leaId }, { value: lateId }] }],
    });
    expect(add.status).toBe(200);
    const remove = await scim("PATCH", `/Groups/${groupId}`, { schemas: [PATCH], Operations: [{ op: "Remove", path: `members[value eq "${lateId}"]` }] });
    expect(remove.status).toBe(200);
    const members = await db.select().from(peopleGroupMembers).where(eq(peopleGroupMembers.groupId, groupId));
    expect(members.map((m) => m.personId).sort()).toEqual([managerId, leaId].sort());
    const [g] = await db.select().from(peopleGroups).where(eq(peopleGroups.id, groupId));
    expect(g).toMatchObject({ source: "scim", kind: "static", externalId: `aad-group-${stamp}` });

    const byName = await scim("GET", "/Groups", undefined, `filter=${encodeURIComponent(`displayName eq "Sales team ${stamp}"`)}&excludedAttributes=members`);
    const found = (byName.body as { Resources: Array<Record<string, unknown>> }).Resources;
    expect(found).toHaveLength(1);
    expect(found[0]!.members).toBeUndefined();
    const full = await scim("GET", `/Groups/${groupId}`);
    expect((full.body as { members: unknown[] }).members).toHaveLength(2);
    const renamed = await scim("PATCH", `/Groups/${groupId}`, { schemas: [PATCH], Operations: [{ op: "Replace", path: "displayName", value: `Sales ${stamp}` }] });
    expect(renamed.body).toMatchObject({ displayName: `Sales ${stamp}` });
  });

  it("DELETE marks the person departed and makes it a 404", async () => {
    const res = await scim("DELETE", `/Users/${lateId}`);
    expect(res.status).toBe(204);
    expect((await person(lateId)).status).toBe("departed");
    expect((await scim("GET", `/Users/${lateId}`)).status).toBe(404);
    // Re-provisioning the same user adopts the departed row instead of colliding.
    const again = await scim("POST", "/Users", entraUser("hugo", ["Hugo", "Blanc"]));
    expect(again.status).toBe(201);
    expect((again.body as { id: string }).id).toBe(lateId);
    expect((await person(lateId)).status).toBe("active");
  });

  it("deletes a group", async () => {
    expect((await scim("DELETE", `/Groups/${groupId}`)).status).toBe(204);
    expect((await scim("GET", `/Groups/${groupId}`)).status).toBe(404);
  });

  it("pages a list", async () => {
    const page = await scim("GET", "/Users", undefined, "startIndex=2&count=1");
    expect(page.body).toMatchObject({ totalResults: 3, startIndex: 2, itemsPerPage: 1 });
    expect((await scim("GET", "/Users", undefined, `filter=${encodeURIComponent('title gt "a"')}`)).body).toMatchObject({ scimType: "invalidFilter" });
  });
});
