import { describe, expect, it } from "vitest";
import { addDays, zonedDateTime } from "../time";
import { buildPdf } from "../pdf";
import { riskOfScopes } from "../google-reports";
import { offboardingExecuteAt } from "../../lifecycle";

describe("zonedDateTime", () => {
  it("converts tenant-local wall time to UTC across DST", () => {
    expect(zonedDateTime("2026-10-01", 18, 0, "Europe/Paris").toISOString()).toBe("2026-10-01T16:00:00.000Z");
    expect(zonedDateTime("2026-12-01", 18, 0, "Europe/Paris").toISOString()).toBe("2026-12-01T17:00:00.000Z");
    expect(zonedDateTime("2026-10-25", 18, 0, "Europe/Paris").toISOString()).toBe("2026-10-25T17:00:00.000Z");
    expect(zonedDateTime("2026-07-01", 8, 0, "America/New_York").toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(zonedDateTime("2026-07-01", 8, 0, "Not/AZone").toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-02", -3)).toBe("2026-09-29");
  });
});

describe("offboardingExecuteAt", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  it("follows lifecycle.offboardingAt", () => {
    expect(offboardingExecuteAt(null, "end_of_last_day", "2026-10-01", "Europe/Paris", now).toISOString()).toBe("2026-10-01T16:00:00.000Z");
    expect(offboardingExecuteAt(null, "midnight", "2026-10-01", "Europe/Paris", now).toISOString()).toBe("2026-10-01T22:00:00.000Z");
    expect(offboardingExecuteAt(null, "immediately", null, "Europe/Paris", now)).toBe(now);
    expect(offboardingExecuteAt("2026-11-02T09:30:00Z", "end_of_last_day", null, "Europe/Paris", now).toISOString()).toBe("2026-11-02T09:30:00.000Z");
  });
  it("needs a leave date unless immediate or explicit", () => {
    expect(() => offboardingExecuteAt(null, "end_of_last_day", null, "Europe/Paris", now)).toThrow(/leave date/);
    expect(() => offboardingExecuteAt("nope", "immediately", null, "UTC", now)).toThrow(/Invalid/);
  });
});

describe("buildPdf", () => {
  it("writes a structurally valid PDF with paginated text and escaped characters", () => {
    const lines = Array.from({ length: 120 }, (_, i) => ({ text: `Line ${i} (Élodie) \\ café €` }));
    const raw = Buffer.from(buildPdf(lines, { title: "T", createdAt: new Date("2026-09-26T10:00:00Z") })).toString("latin1");
    expect(raw.startsWith("%PDF-1.4\n")).toBe(true);
    expect(raw.endsWith("%%EOF\n")).toBe(true);
    expect(/\/Count (\d+)/.exec(raw)![1]).toBe("4"); // 38 lines of 10 pt per A4 landscape page
    expect(raw).toContain("\\(\\311lodie\\) \\\\ caf\\351 \\200");
    const xrefAt = Number(/startxref\n(\d+)/.exec(raw)![1]);
    expect(raw.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const offsets = [...raw.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((off, i) => expect(raw.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // Stream lengths are exact.
    for (const m of raw.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(raw.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
    }
  });
});

describe("riskOfScopes", () => {
  it("rates from the scopes, deterministically", () => {
    expect(riskOfScopes(["https://mail.google.com/"])).toEqual({ risk: "high", reason: "gmail_full" });
    expect(riskOfScopes(["https://www.googleapis.com/auth/drive"])).toEqual({ risk: "high", reason: "drive_full" });
    expect(riskOfScopes(["https://www.googleapis.com/auth/drive.readonly"]).risk).toBe("medium");
    expect(riskOfScopes(["openid", "email", "profile"])).toEqual({ risk: "low", reason: "basic_profile" });
  });
});
