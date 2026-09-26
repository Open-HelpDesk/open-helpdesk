"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { TierOption } from "@/lib/desk/config-data";
import { Btn, ConfigSwitch, Panel, Row, Switch, useCfg } from "@/components/desk/config/primitives";
import { inputCss } from "@/components/desk/config/styles";
import { Labeled } from "@/components/desk/config/delegations-panel";
import { deleteSodRuleAction, saveSodRuleAction } from "./actions";
import type { SodRuleView } from "./data";

export function SodRules({ rules, tiers, violatingPeople }: { rules: SodRuleView[]; tiers: TierOption[]; violatingPeople: number }) {
  const t = useT();
  const router = useRouter();
  const { config, toast, track } = useCfg();
  const [list, setList] = useState(rules);
  const [adding, setAdding] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const label = (x: TierOption) => `${x.app} · ${x.tier}`;

  const status = !config.approvals.enforceSod
    ? t("desk.cfg.sod.statusOff")
    : violatingPeople > 0
      ? t("desk.cfg.sod.statusViolations", { count: violatingPeople })
      : t("desk.cfg.sod.statusClean");

  const toggle = async (r: SodRuleView) => {
    const next = !r.enabled;
    setList((all) => all.map((x) => (x.id === r.id ? { ...x, enabled: next } : x)));
    const res = await track(saveSodRuleAction({ id: r.id, tierAId: r.tierAId, tierBId: r.tierBId, reason: r.reason, enabled: next }));
    if (!res.ok) {
      setList((all) => all.map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)));
      toast(res.error, "dang");
    } else router.refresh();
  };

  const remove = async (r: SodRuleView) => {
    if (!window.confirm(t("desk.cfg.sod.deleteConfirm", { a: r.a, b: r.b }))) return;
    const res = await track(deleteSodRuleAction(r.id));
    if (!res.ok) return toast(res.error, "dang");
    setList((all) => all.filter((x) => x.id !== r.id));
    toast(t("desk.cfg.sod.deleted"));
    router.refresh();
  };

  const add = async () => {
    setBusy(true);
    try {
      const res = await track(saveSodRuleAction({ tierAId: a, tierBId: b, reason, enabled: true }));
      if (!res.ok) return toast(res.error, "dang");
      const ta = tiers.find((x) => x.id === a)!;
      const tb = tiers.find((x) => x.id === b)!;
      setList((all) => [...all, { id: res.value, tierAId: a, tierBId: b, a: label(ta), b: label(tb), reason: reason.trim(), enabled: true }]);
      setAdding(false);
      setA("");
      setB("");
      setReason("");
      toast(t("desk.cfg.sod.added"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t("desk.cfg.sod.title")} hint={t("desk.cfg.sod.hint")}>
      <Row label={t("desk.cfg.sod.enforce")} hint={<span style={{ color: config.approvals.enforceSod && violatingPeople > 0 ? "var(--dang)" : undefined }}>{status}</span>}>
        <ConfigSwitch section="approvals" field="enforceSod" label={t("desk.cfg.sod.enforce")} />
      </Row>
      {list.length === 0 && !adding && <div style={{ padding: "12px 18px", fontSize: 13, color: "var(--ink-3)", borderBottom: "1px solid var(--line-2)" }}>{t("desk.cfg.sod.empty")}</div>}
      {list.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap", opacity: r.enabled ? 1 : 0.6 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {r.a} <span style={{ color: "var(--dang)" }}>×</span> {r.b}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{r.reason}</div>
          </div>
          <Btn tone="danger" onClick={() => remove(r)}>
            {t("desk.cfg.sod.delete")}
          </Btn>
          <Switch checked={r.enabled} onChange={() => toggle(r)} label={t("desk.cfg.sod.ruleToggle", { a: r.a, b: r.b })} />
        </div>
      ))}
      {adding ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "12px 18px", flexWrap: "wrap" }}>
          <Labeled label={t("desk.cfg.sod.roleA")}>
            <select value={a} onChange={(e) => setA(e.target.value)} style={{ ...inputCss, width: 220 }}>
              <option value="">{t("desk.cfg.sod.pickRole")}</option>
              {tiers.map((x) => (
                <option key={x.id} value={x.id}>
                  {label(x)}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={t("desk.cfg.sod.roleB")}>
            <select value={b} onChange={(e) => setB(e.target.value)} style={{ ...inputCss, width: 220 }}>
              <option value="">{t("desk.cfg.sod.pickRole")}</option>
              {tiers
                .filter((x) => x.id !== a)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {label(x)}
                  </option>
                ))}
            </select>
          </Labeled>
          <Labeled label={t("desk.cfg.sod.reason")}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("desk.cfg.sod.reasonPlaceholder")} style={{ ...inputCss, width: 300 }} />
          </Labeled>
          <Btn tone="primary" onClick={add} disabled={busy || !a || !b || !reason.trim()}>
            {t("desk.cfg.sod.create")}
          </Btn>
          <Btn onClick={() => setAdding(false)}>{t("desk.cfg.cancel")}</Btn>
        </div>
      ) : (
        <div style={{ padding: "12px 18px" }}>
          <Btn onClick={() => setAdding(true)} disabled={tiers.length < 2}>
            {t("desk.cfg.sod.add")}
          </Btn>
        </div>
      )}
    </Panel>
  );
}
