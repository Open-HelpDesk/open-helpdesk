"use client";

/**
 * ST-07, onglet Horaires ouvrés — semaine du design : grille 130px / 60px / 1fr,
 * interrupteur 34×20 par jour, plages « 09:00 → 18:00 » (h30 bordées), « + plage »,
 * « Fermé » quand le jour est décoché. Une seule soumission pour toute la semaine.
 */
import { useState } from "react";

const DAYS: [string, string][] = [
  ["mon", "Lundi"],
  ["tue", "Mardi"],
  ["wed", "Mercredi"],
  ["thu", "Jeudi"],
  ["fri", "Vendredi"],
  ["sat", "Samedi"],
  ["sun", "Dimanche"],
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
      {/* Valeur sérialisée lue par la server action */}
      <input type="hidden" name="week" value={JSON.stringify(week)} />
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 10,
          background: "var(--panel)",
          overflow: "hidden",
        }}
      >
        {DAYS.map(([key, label], dayIndex) => {
          const ranges = week[key]!;
          const open = ranges.length > 0;
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
                aria-label={`${label} — ${open ? "ouvert" : "fermé"}`}
                onClick={() => toggleDay(key)}
                style={{
                  width: 34,
                  height: 20,
                  borderRadius: 11,
                  background: open ? "var(--acc)" : "var(--line)",
                  position: "relative",
                  cursor: "pointer",
                  border: 0,
                  padding: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: open ? 16 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                    transition: "left .15s",
                  }}
                />
              </button>
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
                            title="Retirer la plage"
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
                      + plage
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Fermé</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
