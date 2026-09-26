"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { DelegationRow, PersonOption } from "@/lib/desk/config-data";
import { addDelegation, removeDelegation } from "@/app/app/desk/config/actions";
import { Btn, Panel, Pill, useCfg } from "./primitives";
import { inputCss } from "./styles";

/** Delegations in force or to come: a manager hands their approvals to someone for a period. */
export function DelegationsPanel({ delegations, people }: { delegations: DelegationRow[]; people: PersonOption[] }) {
  const t = useT();
  const router = useRouter();
  const { toast, track } = useCfg();
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [endsOn, setEndsOn] = useState("");
  const [busy, setBusy] = useState(false);
  const day = (d: string) => t.fmt.dateShort(new Date(`${d}T12:00:00Z`));

  const submit = async () => {
    setBusy(true);
    try {
      const res = await track(addDelegation({ fromPersonId: from, toPersonId: to, startsOn, endsOn }));
      if (!res.ok) return toast(res.error ?? t("desk.cfg.saveFailed"), "dang");
      toast(t("desk.cfg.del.added"));
      setAdding(false);
      setFrom("");
      setTo("");
      setEndsOn("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: DelegationRow) => {
    if (!window.confirm(t("desk.cfg.del.removeConfirm", { from: row.from, to: row.to }))) return;
    const res = await track(removeDelegation(row.id));
    if (!res.ok) return toast(res.error ?? t("desk.cfg.saveFailed"), "dang");
    toast(t("desk.cfg.del.removed"));
    router.refresh();
  };

  return (
    <Panel title={t("desk.cfg.del.title")} action={!adding ? <Btn onClick={() => setAdding(true)}>{t("desk.cfg.del.add")}</Btn> : undefined}>
      {delegations.length === 0 && !adding && <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.cfg.del.empty")}</div>}
      {delegations.map((d) => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>
              {d.from} → {d.to}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.cfg.del.period", { from: day(d.startsOn), to: day(d.endsOn) })}</div>
          </div>
          <Pill tone={d.current ? "ok" : "neutral"}>{d.current ? t("desk.cfg.del.current") : t("desk.cfg.del.upcoming")}</Pill>
          <Btn tone="danger" onClick={() => remove(d)}>
            {t("desk.cfg.del.remove")}
          </Btn>
        </div>
      ))}
      {adding && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "12px 18px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap" }}>
          <Labeled label={t("desk.cfg.del.from")}>
            <select value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputCss, width: 190 }}>
              <option value="">{t("desk.cfg.pickPerson")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label={t("desk.cfg.del.to")}>
            <select value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputCss, width: 190 }}>
              <option value="">{t("desk.cfg.pickPerson")}</option>
              {people
                .filter((p) => p.id !== from)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Labeled>
          <Labeled label={t("desk.cfg.del.startsOn")}>
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={inputCss} />
          </Labeled>
          <Labeled label={t("desk.cfg.del.endsOn")}>
            <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} style={inputCss} />
          </Labeled>
          <Btn tone="primary" onClick={submit} disabled={busy || !from || !to || !startsOn || !endsOn}>
            {t("desk.cfg.del.create")}
          </Btn>
          <Btn onClick={() => setAdding(false)}>{t("desk.cfg.cancel")}</Btn>
        </div>
      )}
      <div style={{ padding: "12px 18px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5, background: "var(--sunk)" }}>{t("desk.cfg.del.rule")}</div>
    </Panel>
  );
}

export function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)" }}>{label}</span>
      {children}
    </label>
  );
}
