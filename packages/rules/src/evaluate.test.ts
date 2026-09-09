import { describe, expect, it } from "vitest";
import { evaluateConditions, type EvalContext } from "./evaluate";
import type { Condition } from "./types";

/**
 * L'évaluateur de conditions : ce qui décide du sort de chaque ticket.
 *
 * C'est le module le plus chargé de conséquences du produit et il n'avait aucun
 * test. Un opérateur qui ne matche pas ne lève rien : il route les tickets
 * ailleurs, en silence, et cela ne se voit qu'en comptant des exécutions
 * plusieurs jours plus tard — c'est exactement comme ça qu'une règle de relance
 * a envoyé 32 094 emails.
 */
const HOUR = 3_600_000;

/** Un ticket réduit à ce que l'évaluateur lit. */
function ticket(over: Record<string, unknown> = {}) {
  return {
    status: "open",
    priority: "normal",
    channel: "email",
    type: "question",
    teamId: null,
    subject: "Export PDF cassé",
    tags: ["facturation", "urgent"],
    assigneeId: null,
    organizationId: "org-1",
    createdAt: new Date(Date.now() - 10 * HOUR),
    updatedAt: new Date(Date.now() - 3 * HOUR),
    ...over,
  } as unknown as EvalContext["ticket"];
}

function evaluate(conditions: Condition[], over: Record<string, unknown> = {}, any: Condition[] = []) {
  return evaluateConditions({ event: "ticket.updated", ticket: ticket(over) }, conditions, any);
}

describe("the IF block", () => {
  it("requires every `all` condition", () => {
    expect(evaluate([{ field: "status", operator: "is", value: "open" }])).toBe(true);
    expect(
      evaluate([
        { field: "status", operator: "is", value: "open" },
        { field: "priority", operator: "is", value: "urgent" },
      ]),
    ).toBe(false);
  });

  it("requires at least one `any` condition, and an empty `any` blocks nothing", () => {
    const all: Condition[] = [{ field: "status", operator: "is", value: "open" }];
    expect(evaluate(all, {}, [])).toBe(true);
    expect(evaluate(all, {}, [{ field: "priority", operator: "is", value: "urgent" }])).toBe(false);
    expect(
      evaluate(all, {}, [
        { field: "priority", operator: "is", value: "urgent" },
        { field: "channel", operator: "is", value: "email" },
      ]),
    ).toBe(true);
  });

  it("matches with no conditions at all", () => {
    // A rule with an empty IF applies to everything. That is a dangerous rule,
    // but it is the answer the evaluator must give — the screen is where such a
    // rule gets refused, not here.
    expect(evaluate([])).toBe(true);
  });
});

describe("operators", () => {
  it("`is` and `is_not` compare as strings", () => {
    expect(evaluate([{ field: "channel", operator: "is", value: "email" }])).toBe(true);
    expect(evaluate([{ field: "channel", operator: "is_not", value: "email" }])).toBe(false);
  });

  it("`is` treats an absent field and an empty value as equal", () => {
    // `assigneeId` is null on an unassigned ticket, and the screens send "" for
    // "nobody". Both have to describe the same ticket, or an "unassigned" rule
    // would never fire.
    expect(evaluate([{ field: "assignee", operator: "is", value: "" }])).toBe(true);
    expect(evaluate([{ field: "assignee", operator: "is", value: "" }], { assigneeId: "u-1" })).toBe(
      false,
    );
  });

  it("`contains` ignores case", () => {
    expect(evaluate([{ field: "subject", operator: "contains", value: "EXPORT" }])).toBe(true);
    expect(evaluate([{ field: "subject", operator: "contains", value: "remboursement" }])).toBe(
      false,
    );
  });

  it("`includes` looks inside the tags", () => {
    expect(evaluate([{ field: "tags", operator: "includes", value: "facturation" }])).toBe(true);
    expect(evaluate([{ field: "tags", operator: "includes", value: "sla" }])).toBe(false);
    // Not a substring search: a tag matches whole or not at all.
    expect(evaluate([{ field: "tags", operator: "includes", value: "factur" }])).toBe(false);
  });

  it("`empty` and `not_empty` cover null, the empty string and the empty array", () => {
    expect(evaluate([{ field: "assignee", operator: "empty" }])).toBe(true);
    expect(evaluate([{ field: "tags", operator: "empty" }])).toBe(false);
    expect(evaluate([{ field: "tags", operator: "empty" }], { tags: [] })).toBe(true);
    expect(evaluate([{ field: "organization", operator: "not_empty" }])).toBe(true);
  });

  it("`gte` and `lte` never match a field that is not a number", () => {
    /*
     * The trap worth knowing, and the reason this test exists: the numeric
     * operators check `typeof value === "number"`, so a condition like
     * "priority >= high" is not refused — it is simply false forever. A rule
     * built that way in the screens looks right and never fires. The evaluator's
     * behaviour is deliberate (a silent false beats a crash in a worker), so
     * this is pinned rather than fixed here.
     */
    expect(evaluate([{ field: "priority", operator: "gte", value: "high" }])).toBe(false);
    expect(evaluate([{ field: "status", operator: "lte", value: "open" }])).toBe(false);
  });
});

describe("the time fields", () => {
  it("counts the hours since creation and since the last update", () => {
    const conditions: Condition[] = [
      { field: "hours_since_created", operator: "gte", value: "9" },
      { field: "hours_since_updated", operator: "gte", value: "2" },
    ];
    expect(evaluate(conditions)).toBe(true);
    expect(evaluate([{ field: "hours_since_updated", operator: "gte", value: "48" }])).toBe(false);
  });

  it("measures against the `now` it is given, not the wall clock", () => {
    // This is what makes a scheduled sweep reproducible: the whole pass shares
    // one instant, so two tickets one millisecond apart cannot be judged
    // against two different clocks.
    const updatedAt = new Date("2026-01-09T08:00:00Z");
    const ctx = (now: Date): EvalContext => ({
      event: "ticket.updated",
      ticket: ticket({ updatedAt }),
      now,
    });
    const cond: Condition[] = [{ field: "hours_since_updated", operator: "gte", value: "48" }];
    expect(evaluateConditions(ctx(new Date("2026-01-11T07:59:00Z")), cond, [])).toBe(false);
    expect(evaluateConditions(ctx(new Date("2026-01-11T08:01:00Z")), cond, [])).toBe(true);
  });
});
