"use client";

/**
 * ST-07, business hours tab — the design's week: 130px / 60px / 1fr grid,
 * 34×20 switch per day, "09:00 → 18:00" ranges (h30, bordered), "+ range",
 * "Closed" when the day is unchecked. A single submission for the whole week.
 */
import { useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";

const DAYS: [string, MessageKey][] = [
  ["mon", "app.settings.sla.dayMon"],
  ["tue", "app.settings.sla.dayTue"],
  ["wed", "app.settings.sla.dayWed"],
  ["thu", "app.settings.sla.dayThu"],
  ["fri", "app.settings.sla.dayFri"],
  ["sat", "app.settings.sla.daySat"],
  ["sun", "app.settings.sla.daySun"],
];

type Range = [string, string];
export type WeekValue = Record<string, Range[]>;

const timeStyle = {
  height: 30,
  padding: "0 10px",
  border: "1px solid var(--line)",
  borderRadius: 6,
  background: "var(--bg)",
  color: "var(--ink)",
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
} as const;

export function WeekEditor({ initial }: { initial: WeekValue }) {
  const t = useT();
  const [week, setWeek] = useState<WeekValue>(() => {
    const value: WeekValue = {};
    for (const [key] of DAYS) value[key] = initial[key] ? [...initial[key]!] : [];
    return value;
  });

  function toggleDay(key: string) {
    setWeek((prev) => ({
      ...prev,
      [key]: prev[key]!.length > 0 ? [] : [["09:00", "18:00"]],
    }));
  }

  function setRange(key: string, index: number, side: 0 | 1, value: string) {
    setWeek((prev) => {
      const ranges = prev[key]!.map((r) => [...r] as Range);
      ranges[index]![side] = value;
      return { ...prev, [key]: ranges };
    });
  }

  function addRange(key: string) {
    setWeek((prev) => ({ ...prev, [key]: [...prev[key]!, ["14:00", "17:00"]] }));
  }

  function removeRange(key: string, index: number) {
    setWeek((prev) => ({ ...prev, [key]: prev[key]!.filter((_, i) => i !== index) }));
  }

  return (
    <>
      {/* Serialized value read by the server action */}
      <input type="hidden" name="week" value={JSON.stringify(week)} />
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 10,
          background: "var(--panel)",
          overflow: "hidden",
        }}
      >
        {DAYS.map(([key, labelKey], dayIndex) => {
          const ranges = week[key]!;
          const open = ranges.length > 0;
          const label = t(labelKey);
          return (
            <div
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns: "130px 60px 1fr",
                gap: 13,
                alignItems: "center",
                padding: "11px 15px",
                borderBottom: dayIndex === DAYS.length - 1 ? "none" : "1px solid var(--line-2)",
              }}
            >
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: open ? 500 : 450,
                  color: open ? "var(--ink)" : "var(--ink-3)",
                }}
              >
                {label}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={open}
                aria-label={
                  open
                    ? t("app.settings.sla.dayAriaOpen", { day: label })
                    : t("app.settings.sla.dayAriaClosed", { day: label })
                }
                onClick={() => toggleDay(key)}
                className="ohd-switch"
              />
              <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                {open ? (
                  <>
                    {ranges.map((range, index) => (
                      <span
                        key={index}
                        style={{ display: "flex", gap: 9, alignItems: "center" }}
                      >
                        <input
                          type="time"
                          value={range[0]}
                          onChange={(e) => setRange(key, index, 0, e.target.value)}
                          style={timeStyle}
                        />
                        <span style={{ color: "var(--ink-3)", fontSize: 12 }}>→</span>
                        <input
                          type="time"
                          value={range[1]}
                          onChange={(e) => setRange(key, index, 1, e.target.value)}
                          style={timeStyle}
                        />
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => removeRange(key, index)}
                            title={t("app.settings.sla.removeRange")}
                            style={{ color: "var(--ink-3)", fontSize: 12, opacity: 0.55 }}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => addRange(key)}
                      style={{ fontSize: 12.5, color: "var(--acc-2)", cursor: "pointer" }}
                    >
                      {t("app.settings.sla.addRange")}
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
                    {t("app.settings.sla.closed")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
