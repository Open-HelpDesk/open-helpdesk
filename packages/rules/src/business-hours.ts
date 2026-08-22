/**
 * Due date computation in business hours (ST-07). Used by the SLA engine and by
 * the "computed example" of the policies screen — both must say the same thing.
 *
 * The countdown only advances inside the calendar's open ranges, holidays excluded.
 * Without a calendar (or with a calendar without any range), the computation is 24/7.
 */

export type TimeRange = [string, string];
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type BusinessCalendar = {
  timezone: string;
  /** { mon: [["09:00","18:00"]], … } — a missing or empty day is closed. */
  weeklyHours: Partial<Record<DayKey, TimeRange[]>>;
  holidays: { date: string; label?: string }[];
};

/** getDay() → day key (0 = Sunday). */
const DAY_BY_INDEX: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Calendar-local ISO date (YYYY-MM-DD), to compare against the holidays. */
  isoDate: string;
  dayKey: DayKey;
};

const partsFormatter = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatter.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short",
    });
    partsFormatter.set(timeZone, fmt);
  }
  return fmt;
}

const WEEKDAY_MAP: Record<string, DayKey> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

/** Breaks an instant down into the calendar's time zone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  // Intl returns "24" for midnight on some locales/platforms.
  const rawHour = Number(get("hour"));
  const hour = rawHour === 24 ? 0 : rawHour;
  return {
    year,
    month,
    day,
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    isoDate: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    dayKey: WEEKDAY_MAP[get("weekday")] ?? DAY_BY_INDEX[date.getUTCDay()]!,
  };
}

/** Time zone offset (ms) at a given instant. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/**
 * Calendar wall-clock time → instant. Two passes: the offset can change between
 * the estimate and the real instant (daylight saving time transition).
 */
export function zonedTimeToInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMs(new Date(wall), timeZone);
  let ts = wall - first;
  const second = offsetMs(new Date(ts), timeZone);
  if (second !== first) ts = wall - second;
  return new Date(ts);
}

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Open ranges of a day, normalized and sorted. */
function rangesFor(calendar: BusinessCalendar, parts: ZonedParts): TimeRange[] {
  if (calendar.holidays?.some((h) => h.date === parts.isoDate)) return [];
  const ranges = calendar.weeklyHours?.[parts.dayKey] ?? [];
  return ranges
    .filter((r) => Array.isArray(r) && isTime(r[0]) && isTime(r[1]) && r[0] < r[1])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

export function hasOpenHours(calendar: BusinessCalendar | null | undefined): boolean {
  if (!calendar) return false;
  return Object.values(calendar.weeklyHours ?? {}).some(
    (ranges) => Array.isArray(ranges) && ranges.length > 0,
  );
}

/** Midnight of the next day, in the calendar's time zone. */
function nextMidnight(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  const dayAfter = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const n = {
    year: dayAfter.getUTCFullYear(),
    month: dayAfter.getUTCMonth() + 1,
    day: dayAfter.getUTCDate(),
  };
  return zonedTimeToInstant(timeZone, n.year, n.month, n.day, 0, 0);
}

/**
 * Adds `minutes` of business hours to `start`. Without a usable calendar, a plain
 * addition (24/7). The cursor starts at the earliest at the next range's opening.
 */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  calendar: BusinessCalendar | null | undefined,
): Date {
  if (!Number.isFinite(minutes) || minutes <= 0) return new Date(start.getTime());
  if (!hasOpenHours(calendar)) return new Date(start.getTime() + minutes * 60_000);

  const cal = calendar!;
  const tz = cal.timezone || "Europe/Paris";
  let remaining = minutes;
  let cursor = new Date(start.getTime());

  // Guard rail: 400 days of search (permanently closed calendar → 24/7 fallback).
  for (let guard = 0; guard < 400; guard++) {
    const parts = zonedParts(cursor, tz);
    for (const [from, to] of rangesFor(cal, parts)) {
      const [fromH, fromM] = from.split(":").map(Number) as [number, number];
      const [toH, toM] = to.split(":").map(Number) as [number, number];
      const open = zonedTimeToInstant(tz, parts.year, parts.month, parts.day, fromH, fromM);
      const close = zonedTimeToInstant(tz, parts.year, parts.month, parts.day, toH, toM);
      if (cursor >= close) continue;

      const effectiveStart = cursor > open ? cursor : open;
      const availableMin = (close.getTime() - effectiveStart.getTime()) / 60_000;
      if (remaining <= availableMin) {
        return new Date(effectiveStart.getTime() + remaining * 60_000);
      }
      remaining -= availableMin;
      cursor = close;
    }
    cursor = nextMidnight(cursor, tz);
  }
  return new Date(start.getTime() + minutes * 60_000);
}

/** "lundi 9 h 30", "vendredi 17 h" — format of the design's due date labels. */
export function formatBusinessMoment(date: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "long" }).format(date);
  const p = zonedParts(date, timeZone);
  const time = p.minute === 0 ? `${p.hour} h` : `${p.hour} h ${String(p.minute).padStart(2, "0")}`;
  return `${day} ${time}`;
}
