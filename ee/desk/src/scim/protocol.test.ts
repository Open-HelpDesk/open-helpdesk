import { describe, expect, it } from "vitest";
import { SCHEMA_ENTERPRISE, ScimError, applyPatch, parseFilter, parsePath } from "./protocol";
import { deriveUser } from "./users";

const patch = (...Operations: unknown[]) => ({ schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations });

const base = () => ({
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", SCHEMA_ENTERPRISE],
  userName: "lea.martin@acme.example",
  active: true,
  displayName: "Léa Martin",
  name: { givenName: "Léa", familyName: "Martin" },
  emails: [{ value: "lea.martin@acme.example", type: "work", primary: true }],
  [SCHEMA_ENTERPRISE]: { department: "Sales" },
});

describe("SCIM filters", () => {
  it("parses the filters identity providers send", () => {
    expect(parseFilter('userName eq "a@b.c"')).toEqual([{ attr: "userName", op: "eq", value: "a@b.c" }]);
    expect(parseFilter('externalId eq "x-1" and userName eq "a"')).toHaveLength(2);
    expect(parseFilter('displayName eq "Team \\"Sales\\""')[0]!.value).toBe('Team "Sales"');
  });
  it("refuses what it does not understand instead of listing everything", () => {
    expect(() => parseFilter('userName gt "a"')).toThrow(ScimError);
    expect(() => parseFilter("(userName eq \"a\") or (userName eq \"b\")")).toThrow(ScimError);
  });
  it("parses qualified and filtered paths", () => {
    expect(parsePath(`${SCHEMA_ENTERPRISE}:manager`)).toMatchObject({ urn: SCHEMA_ENTERPRISE.toLowerCase(), attr: "manager", sub: null });
    expect(parsePath('emails[type eq "work"].value')).toMatchObject({ attr: "emails", sub: "value", filter: { attr: "type", value: "work" } });
    expect(parsePath("urn:ietf:params:scim:schemas:core:2.0:User:userName")).toMatchObject({ urn: null, attr: "userName" });
  });
});

describe("SCIM PATCH — Entra ID", () => {
  it("replaces with capitalised ops and string booleans", () => {
    const out = applyPatch(base(), patch({ op: "Replace", path: "active", value: "False" }));
    expect(out.active).toBe(false);
    expect(deriveUser(out).active).toBe(false);
  });
  it("sets the manager from a bare id, and removes it", () => {
    const withManager = applyPatch(base(), patch({ op: "Add", path: `${SCHEMA_ENTERPRISE}:manager`, value: "b1c2" }));
    expect(deriveUser(withManager).managerScimId).toBe("b1c2");
    const replaced = applyPatch(withManager, patch({ op: "Replace", path: `${SCHEMA_ENTERPRISE}:manager`, value: { value: "d3e4" } }));
    expect(deriveUser(replaced).managerScimId).toBe("d3e4");
    const removed = applyPatch(replaced, patch({ op: "Remove", path: `${SCHEMA_ENTERPRISE}:manager` }));
    expect(deriveUser(removed).managerScimId).toBeNull();
  });
  it("replaces a filtered email and a sub-attribute", () => {
    const out = applyPatch(
      base(),
      patch(
        { op: "Replace", path: 'emails[type eq "work"].value', value: "lea.m@acme.example" },
        { op: "Replace", path: "name.familyName", value: "Martin-Roy" },
        { op: "Replace", path: "displayName", value: "Léa Martin-Roy" },
        { op: "Replace", path: `${SCHEMA_ENTERPRISE}:department`, value: "Marketing" },
      ),
    );
    const u = deriveUser(out);
    expect(u.email).toBe("lea.m@acme.example");
    expect(u.name).toBe("Léa Martin-Roy");
    expect(u.department).toBe("Marketing");
  });
  it("creates the email element a filter names when there is none", () => {
    const { emails: _e, ...noEmail } = base();
    const out = applyPatch(noEmail, patch({ op: "Add", path: 'emails[type eq "work"].value', value: "x@acme.example" }));
    expect(out.emails).toEqual([{ type: "work", value: "x@acme.example" }]);
  });
});

describe("SCIM PATCH — Okta and path-less values", () => {
  it("applies a path-less replace of active", () => {
    expect(applyPatch(base(), patch({ op: "replace", value: { active: false } })).active).toBe(false);
  });
  it("applies path-less values keyed by path or by extension URN", () => {
    const out = applyPatch(
      base(),
      patch({
        op: "replace",
        value: {
          "name.givenName": "Lea",
          [`${SCHEMA_ENTERPRISE}:department`]: "Finance",
          "urn:ietf:params:scim:schemas:extension:openhelpdesk:2.0:User": { hireDate: "2026-10-01", leaveDate: "2027-03-31T00:00:00Z" },
        },
      }),
    );
    const u = deriveUser(out);
    expect((out.name as Record<string, unknown>).givenName).toBe("Lea");
    expect(u.department).toBe("Finance");
    expect(u.startsOn).toBe("2026-10-01");
    expect(u.leavesOn).toBe("2027-03-31");
  });
});

describe("SCIM PATCH — group members", () => {
  const group = () => ({ displayName: "Sales", members: [{ value: "a" }, { value: "b" }] });
  it("adds without duplicating", () => {
    const out = applyPatch(group(), patch({ op: "Add", path: "members", value: [{ value: "b" }, { value: "c" }] }));
    expect((out.members as Array<{ value: string }>).map((m) => m.value)).toEqual(["a", "b", "c"]);
  });
  it("removes by filter (Entra) and by value list (Okta)", () => {
    const byFilter = applyPatch(group(), patch({ op: "Remove", path: 'members[value eq "a"]' }));
    expect((byFilter.members as Array<{ value: string }>).map((m) => m.value)).toEqual(["b"]);
    const byValue = applyPatch(group(), patch({ op: "remove", path: "members", value: [{ value: "b" }] }));
    expect((byValue.members as Array<{ value: string }>).map((m) => m.value)).toEqual(["a"]);
  });
  it("replaces the member list", () => {
    const out = applyPatch(group(), patch({ op: "replace", path: "members", value: [{ value: "z" }] }));
    expect(out.members).toEqual([{ value: "z" }]);
  });
  it("rejects a malformed message", () => {
    expect(() => applyPatch(group(), { Operations: [{ op: "move", path: "x" }] })).toThrow(ScimError);
    expect(() => applyPatch(group(), {})).toThrow(ScimError);
  });
});

describe("resource → person", () => {
  it("prefers the primary email and the display name", () => {
    const u = deriveUser({ ...base(), emails: [{ value: "home@x.example", type: "home" }, { value: "Work@Acme.example", primary: "True" }] });
    expect(u.email).toBe("work@acme.example");
    expect(u.name).toBe("Léa Martin");
  });
  it("falls back to a userName that is an address, and refuses without any email", () => {
    expect(deriveUser({ userName: "p@acme.example" }).email).toBe("p@acme.example");
    expect(() => deriveUser({ userName: "no-email" })).toThrow(ScimError);
  });
  it("rejects a malformed date", () => {
    expect(() => deriveUser({ userName: "p@acme.example", "urn:ietf:params:scim:schemas:extension:openhelpdesk:2.0:User": { hireDate: "soon" } })).toThrow(ScimError);
  });
});
