import { describe, expect, it } from "vitest";
import { computeCoreCircuit, durationsFor, stateForStep, type CircuitPerson, type CoreCircuitInput } from "./circuit";

/**
 * The approval circuit of spec 19 (§3.1, doctrine rules 2–3, §7), pinned rule
 * by rule on the Acme org chart of the design:
 *
 *   Nadia (CEO) ── Paul Mercier (sales director) ── Inès Haddad, Karim Benali
 *            └──── Sarah Leroy (IT)
 */
const TODAY = "2026-09-26";

function person(id: string, managerId: string | null, extra: Partial<CircuitPerson> = {}): CircuitPerson {
  return { id, managerId, absentUntil: null, status: "active", ...extra };
}

const nadia = person("nadia", null);
const paul = person("paul", "nadia");
const ines = person("ines", "paul");
const karim = person("karim", "paul");
const sarah = person("sarah", "nadia");

function input(over: Partial<CoreCircuitInput> & { peopleList?: CircuitPerson[] } = {}): CoreCircuitInput {
  const list = over.peopleList ?? [nadia, paul, ines, karim, sarah];
  return {
    requester: ines,
    app: { ownerPersonId: "sarah", approvalLevels: 1, maxDurationDays: null },
    autoGroupIds: [],
    requesterGroupIds: ["g-everyone", "g-sales"],
    people: new Map(list.map((p) => [p.id, p])),
    delegations: new Map(),
    whenAbsent: "manager_of_manager",
    today: TODAY,
    ...over,
  };
}

describe("auto-approval", () => {
  it("level 0 needs nobody", () => {
    const c = computeCoreCircuit(input({ app: { ownerPersonId: "sarah", approvalLevels: 0, maxDurationDays: null } }));
    expect(c.effectiveLevels).toBe(0);
    expect(c.autoRule).toBe("level0");
    expect(c.steps).toEqual([]);
    expect(c.blocked).toBeNull();
  });

  it("a member of an auto-approval group needs nobody, and the rule names the group", () => {
    const c = computeCoreCircuit(input({ app: { ownerPersonId: "sarah", approvalLevels: 2, maxDurationDays: null }, autoGroupIds: ["g-design", "g-sales"] }));
    expect(c.effectiveLevels).toBe(0);
    expect(c.autoRule).toBe("group:g-sales");
    expect(c.steps).toEqual([]);
  });

  it("a non-member goes through the circuit", () => {
    const c = computeCoreCircuit(input({ autoGroupIds: ["g-design"] }));
    expect(c.effectiveLevels).toBe(1);
    expect(c.autoRule).toBeNull();
  });

  it("an extension always needs at least the manager, even on an auto-approved app", () => {
    const c = computeCoreCircuit(input({ app: { ownerPersonId: "sarah", approvalLevels: 0, maxDurationDays: 90 }, minLevels: 1 }));
    expect(c.effectiveLevels).toBe(1);
    expect(c.autoRule).toBeNull();
    expect(c.steps[0]).toMatchObject({ step: "manager", approverPersonId: "paul" });
  });
});

describe("levels", () => {
  it("level 1 is the manager", () => {
    const c = computeCoreCircuit(input());
    expect(c.steps).toEqual([{ step: "manager", approverPersonId: "paul", onBehalfOfPersonId: null, mergedSteps: [] }]);
  });

  it("level 2 is the manager then the owner", () => {
    const c = computeCoreCircuit(input({ app: { ownerPersonId: "sarah", approvalLevels: 2, maxDurationDays: null } }));
    expect(c.effectiveLevels).toBe(2);
    expect(c.steps.map((s) => [s.step, s.approverPersonId])).toEqual([
      ["manager", "paul"],
      ["owner", "sarah"],
    ]);
  });

  it("merges the two steps when the manager is also the owner (Salesforce, SD-1027)", () => {
    const c = computeCoreCircuit(input({ app: { ownerPersonId: "paul", approvalLevels: 2, maxDurationDays: null } }));
    expect(c.effectiveLevels).toBe(1);
    expect(c.steps).toEqual([{ step: "manager", approverPersonId: "paul", onBehalfOfPersonId: null, mergedSteps: ["manager", "owner"] }]);
  });

  it("maps the pending step to the request state", () => {
    expect(stateForStep("manager")).toBe("awaiting_manager");
    expect(stateForStep("owner")).toBe("awaiting_owner");
    expect(stateForStep("privileged")).toBe("awaiting_extra");
  });
});

describe("the requester is never their own approver (rule 3)", () => {
  it("a manager asking for themselves is approved by their own manager", () => {
    const c = computeCoreCircuit(input({ requester: paul }));
    expect(c.steps[0]?.approverPersonId).toBe("nadia");
  });

  it("the owner asking for their own app goes one level up — and merges with the manager step", () => {
    const c = computeCoreCircuit(input({ requester: sarah, app: { ownerPersonId: "sarah", approvalLevels: 2, maxDurationDays: null } }));
    expect(c.steps.every((s) => s.approverPersonId !== "sarah")).toBe(true);
    expect(c.steps).toEqual([{ step: "manager", approverPersonId: "nadia", onBehalfOfPersonId: null, mergedSteps: ["manager", "owner"] }]);
  });

  it("a person recorded as their own manager (bad data) does not approve themselves", () => {
    const loop = person("ines", "ines");
    const c = computeCoreCircuit(input({ requester: loop, peopleList: [nadia, paul, loop, sarah] }));
    expect(c.steps[0]?.approverPersonId).toBeNull();
    expect(c.blocked).toBe("no_manager");
  });

  it("a delegate who is the requester is skipped", () => {
    const absentPaul = person("paul", "nadia", { absentUntil: "2026-10-03" });
    const c = computeCoreCircuit(input({ peopleList: [nadia, absentPaul, ines, karim, sarah], delegations: new Map([["paul", "ines"]]) }));
    expect(c.steps[0]).toMatchObject({ approverPersonId: "nadia", onBehalfOfPersonId: "paul" });
  });
});

describe("absent manager", () => {
  const absentPaul = person("paul", "nadia", { absentUntil: "2026-10-03" });
  const list = [nadia, absentPaul, ines, karim, sarah];

  it("goes to the active delegate, and records who was replaced", () => {
    const c = computeCoreCircuit(input({ peopleList: list, delegations: new Map([["paul", "karim"]]) }));
    expect(c.steps[0]).toEqual({ step: "manager", approverPersonId: "karim", onBehalfOfPersonId: "paul", mergedSteps: [] });
  });

  it("without delegate, goes up to the manager's manager (default whenAbsent)", () => {
    const c = computeCoreCircuit(input({ peopleList: list }));
    expect(c.steps[0]).toMatchObject({ approverPersonId: "nadia", onBehalfOfPersonId: "paul" });
  });

  it("without delegate and whenAbsent = app_owner, goes to the owner", () => {
    const c = computeCoreCircuit(input({ peopleList: list, whenAbsent: "app_owner" }));
    expect(c.steps[0]).toMatchObject({ approverPersonId: "sarah", onBehalfOfPersonId: "paul" });
  });

  it("is back the day after absentUntil", () => {
    const c = computeCoreCircuit(input({ peopleList: list, today: "2026-10-04" }));
    expect(c.steps[0]).toMatchObject({ approverPersonId: "paul", onBehalfOfPersonId: null });
  });

  it("is still absent ON absentUntil", () => {
    const c = computeCoreCircuit(input({ peopleList: list, today: "2026-10-03" }));
    expect(c.steps[0]?.approverPersonId).toBe("nadia");
  });

  it("a departed manager is treated as absent", () => {
    const gone = person("paul", "nadia", { status: "departed" });
    const c = computeCoreCircuit(input({ peopleList: [nadia, gone, ines, sarah] }));
    expect(c.steps[0]).toMatchObject({ approverPersonId: "nadia", onBehalfOfPersonId: "paul" });
  });
});

describe("blocked", () => {
  it("no manager on file: the request cannot be sent", () => {
    const orphan = person("ines", null);
    const c = computeCoreCircuit(input({ requester: orphan, peopleList: [nadia, paul, orphan, sarah] }));
    expect(c.blocked).toBe("no_manager");
    expect(c.steps[0]?.approverPersonId).toBeNull();
  });

  it("level 2 with no owner: blocked on the owner step", () => {
    const c = computeCoreCircuit(input({ app: { ownerPersonId: null, approvalLevels: 2, maxDurationDays: null } }));
    expect(c.blocked).toBe("no_owner");
  });

  it("absent manager with nobody above: blocked", () => {
    const alone = person("paul", null, { absentUntil: "2026-12-31" });
    const c = computeCoreCircuit(input({ peopleList: [alone, ines] }));
    expect(c.blocked).toBe("no_manager");
  });

  it("an auto-approved request is never blocked by a missing manager", () => {
    const orphan = person("ines", null);
    const c = computeCoreCircuit(input({ requester: orphan, app: { ownerPersonId: null, approvalLevels: 0, maxDurationDays: null } }));
    expect(c.blocked).toBeNull();
  });
});

describe("durations", () => {
  it("unlimited → permanent, 90, 30", () => expect(durationsFor(null)).toEqual([null, 90, 30]));
  it("90 → 90, 30", () => expect(durationsFor(90)).toEqual([90, 30]));
  it("30 → 30", () => expect(durationsFor(30)).toEqual([30]));
  it("180 → 180, 90, 30", () => expect(durationsFor(180)).toEqual([180, 90, 30]));
  it("7 → 7", () => expect(durationsFor(7)).toEqual([7]));
  it("the circuit carries them", () => {
    expect(computeCoreCircuit(input({ app: { ownerPersonId: "sarah", approvalLevels: 1, maxDurationDays: 90 } })).durations).toEqual([90, 30]);
  });
});
