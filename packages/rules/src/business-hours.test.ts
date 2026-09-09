import { describe, expect, it } from "vitest";
import {
  addBusinessMinutes,
  hasOpenHours,
  zonedParts,
  type BusinessCalendar,
} from "./business-hours";

/**
 * L'horloge des SLA : à quelle heure une échéance tombe.
 *
 * C'est le calcul qui décide si un ticket est en retard, donc ce qui déclenche
 * les escalades et ce qui s'affiche en rouge dans l'inbox. Il n'avait aucun
 * test, et il porte trois choses qu'on ne devine pas : les fenêtres d'ouverture,
 * les jours fériés, et le changement d'heure.
 *
 * Les instants sont construits en UTC explicite et les résultats relus dans le
 * fuseau du calendrier. Utiliser `zonedTimeToInstant` pour fabriquer les entrées
 * rendrait le test circulaire — il vérifierait sa propre arithmétique.
 */
const PARIS = "Europe/Paris";

/** Lundi au vendredi, 9 h – 18 h, heure de Paris. */
function officeHours(over: Partial<BusinessCalendar> = {}): BusinessCalendar {
  const day: [string, string][] = [["09:00", "18:00"]];
  return {
    timezone: PARIS,
    weeklyHours: { mon: day, tue: day, wed: day, thu: day, fri: day },
    holidays: [],
    ...over,
  };
}

/** L'heure murale, dans le fuseau du calendrier — ce qu'un agent lit. */
function wallClock(date: Date, tz = PARIS): string {
  const p = zonedParts(date, tz);
  return `${p.isoDate} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

describe("hasOpenHours", () => {
  it("is false without a calendar, and false for a calendar that never opens", () => {
    expect(hasOpenHours(null)).toBe(false);
    expect(hasOpenHours(undefined)).toBe(false);
    expect(hasOpenHours({ timezone: PARIS, weeklyHours: {}, holidays: [] })).toBe(false);
    expect(hasOpenHours({ timezone: PARIS, weeklyHours: { mon: [] }, holidays: [] })).toBe(false);
  });

  it("is true as soon as one day has a range", () => {
    expect(hasOpenHours(officeHours())).toBe(true);
  });
});

describe("addBusinessMinutes", () => {
  it("adds plainly when there is no calendar — 24/7", () => {
    // A workspace that has not set opening hours must not have its SLAs frozen.
    const start = new Date("2026-01-10T22:00:00Z"); // a Saturday night
    expect(wallClock(addBusinessMinutes(start, 120, null))).toBe("2026-01-11 01:00");
  });

  it("returns the same instant for zero, a negative or a nonsensical amount", () => {
    const start = new Date("2026-01-09T10:00:00Z");
    for (const minutes of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(addBusinessMinutes(start, minutes, officeHours()).getTime()).toBe(start.getTime());
    }
  });

  it("stays inside the day when the window is wide enough", () => {
    // Friday 9 January 2026, 10:00 Paris (UTC+1 in winter) + 3 h → 13:00.
    const start = new Date("2026-01-09T09:00:00Z");
    expect(wallClock(addBusinessMinutes(start, 180, officeHours()))).toBe("2026-01-09 13:00");
  });

  it("waits for opening when the ticket arrives before it", () => {
    // 07:00 Paris, before the 09:00 opening: the countdown starts at 09:00 and
    // not at arrival. This is the difference between "2 h to answer" and "2 h
    // of which one was during the night".
    const start = new Date("2026-01-09T06:00:00Z");
    expect(wallClock(addBusinessMinutes(start, 120, officeHours()))).toBe("2026-01-09 11:00");
  });

  it("spills over the weekend", () => {
    // Friday 17:00 + 2 h: one hour on Friday, the rest on Monday morning.
    const start = new Date("2026-01-09T16:00:00Z");
    expect(wallClock(addBusinessMinutes(start, 120, officeHours()))).toBe("2026-01-12 10:00");
  });

  it("skips a holiday", () => {
    // Monday 12 January closed: the hour left lands on Tuesday.
    const calendar = officeHours({ holidays: [{ date: "2026-01-12", label: "fermeture" }] });
    const start = new Date("2026-01-09T16:00:00Z"); // Friday 17:00 Paris
    expect(wallClock(addBusinessMinutes(start, 120, calendar))).toBe("2026-01-13 10:00");
  });

  it("ignores a malformed or inverted range instead of trusting it", () => {
    // "18:00"–"09:00" is a range someone typed backwards, and "9h"–"18h" is not
    // a time. Either one taken literally would make the day open for a negative
    // amount of time, or throw. The day is treated as closed.
    const calendar = officeHours({
      weeklyHours: {
        fri: [["18:00", "09:00"], ["9h", "18h"] as unknown as [string, string]],
        mon: [["09:00", "18:00"]],
      },
    });
    const start = new Date("2026-01-09T09:00:00Z"); // Friday 10:00 Paris
    expect(wallClock(addBusinessMinutes(start, 60, calendar))).toBe("2026-01-12 10:00");
  });

  it("counts real elapsed time across a daylight-saving jump", () => {
    /*
     * The case nobody computes by hand. On Sunday 29 March 2026 Paris goes from
     * 02:00 straight to 03:00: the wall clock loses an hour that never existed.
     *
     * The calendar is open 01:00–06:00 that Sunday. Starting at 01:30 wall time
     * and adding two hours of business time must give **two real hours** —
     * 00:30 UTC + 2 h = 02:30 UTC, which reads 04:30 in Paris now that the
     * offset is +2. A wall-clock addition would have said 03:30 and promised the
     * customer an answer an hour earlier than the team actually has.
     */
    const calendar: BusinessCalendar = {
      timezone: PARIS,
      weeklyHours: { sun: [["01:00", "06:00"]] },
      holidays: [],
    };
    const start = new Date("2026-03-29T00:30:00Z");
    const due = addBusinessMinutes(start, 120, calendar);
    expect(due.toISOString()).toBe("2026-03-29T02:30:00.000Z");
    expect(wallClock(due)).toBe("2026-03-29 04:30");
  });

  it("falls back to 24/7 rather than hanging on a calendar that can never satisfy it", () => {
    /*
     * A calendar open one minute a week, asked for a hundred hours. The search
     * is bounded at 400 days; past that it adds the delay plainly instead of
     * looping. A worker that spun here would take the SLA sweep down with it
     * every minute — the guard matters more than the precision.
     */
    const calendar: BusinessCalendar = {
      timezone: PARIS,
      weeklyHours: { mon: [["09:00", "09:01"]] },
      holidays: [],
    };
    const start = new Date("2026-01-09T09:00:00Z");
    const due = addBusinessMinutes(start, 6_000, calendar);
    expect(Number.isFinite(due.getTime())).toBe(true);
    expect(due.getTime()).toBeGreaterThan(start.getTime());
  });
});

describe("zonedParts", () => {
  it("reads an instant in the calendar's own zone, day name included", () => {
    const p = zonedParts(new Date("2026-01-09T16:00:00Z"), PARIS);
    expect(p).toMatchObject({ isoDate: "2026-01-09", hour: 17, minute: 0, dayKey: "fri" });
  });

  it("does not report midnight as hour 24", () => {
    // Intl says "24" for midnight on some platforms, which would put the cursor
    // on the wrong day for every calculation starting at midnight.
    const p = zonedParts(new Date("2026-01-08T23:00:00Z"), PARIS);
    expect(p.hour).toBe(0);
    expect(p.isoDate).toBe("2026-01-09");
  });
});
