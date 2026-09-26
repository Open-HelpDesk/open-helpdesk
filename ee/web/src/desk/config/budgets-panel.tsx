"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import type { PersonOption } from "@/lib/desk/config-data";
import { ConfigSeg, Panel, Row, useCfg } from "@/components/desk/config/primitives";
import { inputCss, mono } from "@/components/desk/config/styles";
import { setBudgetAction } from "./actions";
import type { BudgetRow } from "./data";

export function BudgetsPanel({ rows, people }: { rows: BudgetRow[]; people: PersonOption[] }) {
  const t = useT();
  const { config, update } = useCfg();
  const yearly = config.budgets.period === "yearly";
  const factor = yearly ? 12 : 1;
  const finance = people.find((p) => p.id === config.budgets.financePersonId) ?? null;
  const note =
    config.budgets.mode === "alert"
      ? t("desk.cfg.budget.note.alert")
      : config.budgets.mode === "block"
        ? t("desk.cfg.budget.note.block")
        : finance
          ? t("desk.cfg.budget.note.finance", { name: finance.name })
          : t("desk.cfg.budget.note.financeMissing");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel scroll minWidth={560} title={t("desk.cfg.budget.capsTitle")} hint={t("desk.cfg.budget.capsHint")}>
        {rows.length === 0 && <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.cfg.budget.empty")}</div>}
        {rows.map((r) => (
          <BudgetLine key={r.department} row={r} factor={factor} yearly={yearly} />
        ))}
      </Panel>
      <Panel title={t("desk.cfg.budget.rulesTitle")}>
        <Row label={t("desk.cfg.budget.mode")} hint={<span style={{ color: config.budgets.mode === "finance" && !finance ? "var(--dang)" : undefined }}>{note}</span>}>
          <ConfigSeg
            section="budgets"
            field="mode"
            label={t("desk.cfg.budget.mode")}
            options={[
              { value: "alert", label: t("desk.cfg.budget.mode.alert") },
              { value: "finance", label: t("desk.cfg.budget.mode.finance") },
              { value: "block", label: t("desk.cfg.budget.mode.block") },
            ]}
          />
        </Row>
        <Row label={t("desk.cfg.budget.finance")} hint={t("desk.cfg.budget.financeHint")} disabled={config.budgets.mode !== "finance"}>
          <select
            aria-label={t("desk.cfg.budget.finance")}
            value={config.budgets.financePersonId ?? ""}
            onChange={(e) => update("budgets", "financePersonId", e.target.value || null)}
            style={{ ...inputCss, width: 240 }}
          >
            <option value="">{t("desk.cfg.budget.financeNone")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.department ? ` · ${p.department}` : ""}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t("desk.cfg.budget.period")}>
          <ConfigSeg
            section="budgets"
            field="period"
            label={t("desk.cfg.budget.period")}
            options={[
              { value: "monthly", label: t("desk.cfg.budget.period.monthly") },
              { value: "yearly", label: t("desk.cfg.budget.period.yearly") },
            ]}
          />
        </Row>
        <Row label={t("desk.cfg.budget.costCentre")} hint={t("desk.cfg.budget.costCentreHint")} last>
          <span style={{ ...mono, fontSize: 12.5, padding: "6px 10px", borderRadius: 8, background: "var(--sunk)" }}>department</span>
        </Row>
      </Panel>
    </div>
  );
}

function BudgetLine({ row, factor, yearly }: { row: BudgetRow; factor: number; yearly: boolean }) {
  const t = useT();
  const { toast, track } = useCfg();
  const [saved, setSaved] = useState(row.budgetCents);
  const [value, setValue] = useState(row.budgetCents === null ? "" : String(Math.round(row.budgetCents / 100)));
  const spend = row.spendCents * factor;
  const pct = saved ? Math.min(100, Math.round((spend / saved) * 100)) : 0;
  const bar = saved === null ? "var(--line)" : spend > saved ? "var(--dang)" : spend > saved * 0.85 ? "var(--wait)" : "var(--brand)";
  const euros = (cents: number) => t.fmt.number(Math.round(cents / 100));

  const commit = async () => {
    const trimmed = value.trim();
    if (trimmed === "" && saved === null) return;
    const n = Number.parseInt(trimmed || "0", 10);
    if (!Number.isFinite(n) || n < 0) {
      setValue(saved === null ? "" : String(Math.round(saved / 100)));
      return toast(t("desk.cfg.invalidValue"), "dang");
    }
    const cents = n * 100;
    if (cents === saved) return;
    const res = await track(setBudgetAction(row.department, cents));
    if (!res.ok) {
      setValue(saved === null ? "" : String(Math.round(saved / 100)));
      return toast(res.error, "dang");
    }
    setSaved(cents);
    setValue(String(n));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr) 160px", gap: 16, alignItems: "center", padding: "11px 18px", borderBottom: "1px solid var(--line-2)", minWidth: 560 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{row.department}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("desk.cfg.budget.people", { count: row.people })}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t("desk.cfg.budget.usage", { department: row.department })}
          style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--sunk)", overflow: "hidden" }}
        >
          <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: bar }} />
        </div>
        <span style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums", color: spend > (saved ?? Infinity) ? "var(--dang)" : "var(--ink-2)", minWidth: 110, textAlign: "right" }}>
          {yearly ? t("desk.cfg.budget.spendYear", { amount: euros(spend) }) : t("desk.cfg.budget.spendMonth", { amount: euros(spend) })}
        </span>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 10px", border: "1px solid var(--line)", borderRadius: 9, background: "var(--panel)" }}>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={value}
          placeholder={t("desk.cfg.budget.noCap")}
          aria-label={t("desk.cfg.budget.capFor", { department: row.department })}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13.5, fontVariantNumeric: "tabular-nums", textAlign: "right", color: "var(--ink)" }}
        />
        <span style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{yearly ? t("desk.cfg.budget.unitYear") : t("desk.cfg.budget.unitMonth")}</span>
      </label>
    </div>
  );
}
