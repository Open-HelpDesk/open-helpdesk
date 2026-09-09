import { describe, expect, it } from "vitest";
import { duration, initialsOf, size, slaShort } from "./format";

/**
 * Les durées et les tailles, telles qu'un agent les lit.
 *
 * Ce que ces fonctions décident n'est pas la traduction — elle est faite par le
 * `t` qu'on leur passe — mais **l'unité et la grandeur** : à partir de quand on
 * bascule en heures, puis en jours, et comment un dépassement s'écrit. Le faux
 * `t` ci-dessous rend donc la clé et ses paramètres : c'est exactement le
 * contrat, et cela évite de réimplémenter la couche i18n dans un test.
 *
 * Ces formats ne sont pas cosmétiques : la puce SLA de l'inbox est ce qu'un
 * agent regarde pour choisir son prochain ticket.
 */
const t = Object.assign(
  (key: string, params?: Record<string, string | number>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
  { fmt: { number: (n: number) => String(n) } },
) as unknown as Parameters<typeof duration>[0];

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("duration", () => {
  it("stays in minutes below an hour, and never says zero", () => {
    expect(duration(t, 42 * MIN)).toBe('app.unit.minutes({"count":42})');
    // Thirty seconds left is not "0 min": a countdown that reaches zero before
    // the deadline makes the agent think it is already breached.
    expect(duration(t, 30_000)).toBe('app.unit.minutes({"count":1})');
    expect(duration(t, 0)).toBe('app.unit.minutes({"count":1})');
  });

  it("uses hours, with the minutes zero-padded, and drops them at the round hour", () => {
    expect(duration(t, 3 * HOUR + 5 * MIN)).toBe('app.unit.hoursMinutes({"hours":3,"minutes":"05"})');
    expect(duration(t, 3 * HOUR)).toBe('app.unit.hours({"count":3})');
  });

  it("switches to days past 48 hours", () => {
    /*
     * The boundary is deliberate: "291 h 21" is a number nobody converts in
     * their head, and at that scale the minutes are noise. Pinned because it is
     * the kind of threshold a refactor moves by one without noticing.
     */
    expect(duration(t, 47 * HOUR + 59 * MIN)).toBe(
      'app.unit.hoursMinutes({"hours":47,"minutes":"59"})',
    );
    expect(duration(t, 48 * HOUR)).toBe('app.unit.days({"count":2})');
    expect(duration(t, 10 * 24 * HOUR)).toBe('app.unit.days({"count":10})');
  });
});

describe("slaShort", () => {
  it("prefixes a breach with a minus sign", () => {
    // The chip reads "-42 min" once overdue. The sign is the whole difference
    // between "you have time" and "you are late", in a badge four characters
    // wide.
    expect(slaShort(t, 42 * MIN)).toBe('app.unit.minutes({"count":42})');
    expect(slaShort(t, -42 * MIN)).toBe('-app.unit.minutes({"count":42})');
  });
});

describe("size", () => {
  it("counts in kilobytes below a megabyte, and never says zero", () => {
    expect(size(t, 148 * 1024)).toBe('app.unit.kilobytes({"count":148})');
    // A 200-byte attachment exists: "0 KB" would read as a failed upload.
    expect(size(t, 200)).toBe('app.unit.kilobytes({"count":1})');
  });

  it("switches to megabytes with one decimal", () => {
    expect(size(t, 1.24 * 1024 * 1024)).toBe('app.unit.megabytes({"value":"1.2"})');
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Marie Dupont")).toBe("MD");
    expect(initialsOf("Jean-Pierre Le Goff")).toBe("JL");
  });

  it("survives a single word, extra spaces and an empty name", () => {
    // The avatar is rendered for every contact, including those an email gave
    // us with no name at all. It must not throw there.
    expect(initialsOf("Claire")).toBe("C");
    expect(initialsOf("  marie   dupont  ")).toBe("MD");
    expect(initialsOf("")).toBe("");
    expect(initialsOf("   ")).toBe("");
  });
});
