"use client";

/** SD-A8 — the findings table and its three decisions. */
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { euros } from "../shared/format";
import { ConfirmDialog, SMALL_BTN, useToast } from "../shared/ui";
import { setShadowStatusAction } from "./actions";
import type { ShadowFinding } from "./data";

type Row = ShadowFinding & { sourceLabel: string };

const RISK_TONE = {
  high: ["var(--dang-t)", "var(--dang)"],
  medium: ["var(--wait-t)", "var(--wait)"],
  low: ["var(--sunk)", "var(--ink-2)"],
} as const;

const STATUS_TONE = {
  added: ["var(--ok-t)", "var(--ok)"],
  blocked: ["var(--dang-t)", "var(--dang)"],
  ignored: ["var(--sunk)", "var(--ink-3)"],
} as const;

export function ShadowRows({ findings, icons }: { findings: Row[]; icons: Record<string, ReactNode> }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, Row["status"]>>({});
  const [blocking, setBlocking] = useState<Row | null>(null);
  const [pending, start] = useTransition();

  const act = (f: Row, status: "added" | "blocked" | "ignored") =>
    start(async () => {
      const res = await setShadowStatusAction(f.id, status);
      setBlocking(null);
      if (!res.ok) return toast(res.error, "error");
      setLocal((l) => ({ ...l, [f.id]: status }));
      toast(
        status === "added"
          ? t("desk.ee.sh.addedToast", { name: f.name })
          : status === "blocked"
            ? t("desk.ee.sh.blockedToast", { name: f.name })
            : t("desk.ee.sh.ignoredToast", { name: f.name }),
      );
      router.refresh();
    });

  const riskLabel = (r: Row["risk"]) =>
    r === "high" ? t("desk.ee.sh.riskHigh") : r === "medium" ? t("desk.ee.sh.riskMedium") : t("desk.ee.sh.riskLow");
  const statusLabel = (s: Exclude<Row["status"], "new">) =>
    s === "added" ? t("desk.ee.sh.stAdded") : s === "blocked" ? t("desk.ee.sh.stBlocked") : t("desk.ee.sh.stIgnored");

  return (
    <>
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, overflowX: "auto" }}>
        {findings.map((f) => {
          const status = local[f.id] ?? f.status;
          const [rBg, rC] = RISK_TONE[f.risk];
          return (
            <div
              key={f.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.3fr) minmax(0,.9fr) minmax(0,1.6fr) auto",
                gap: 16,
                minWidth: 880,
                alignItems: "center",
                padding: "13px 16px",
                borderBottom: "1px solid var(--line-2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                {icons[f.id]}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }} title={f.domain}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {t("desk.ee.sh.users", { count: f.users })} · {f.sourceLabel}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                {f.monthlySpendCents == null
                  ? t("desk.ee.sh.noSpend")
                  : f.monthlySpendCents === 0
                    ? t("desk.ee.sh.free")
                    : t("desk.ee.sh.perMonth", { amount: euros(t, f.monthlySpendCents) })}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, flex: "none", background: rBg, color: rC }}>
                  {riskLabel(f.risk)}
                </span>
                {f.riskReason && <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{f.riskReason}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {status === "new" ? (
                  <>
                    <button type="button" disabled={pending} onClick={() => act(f, "added")} className="ohd-hover-edge-fill" style={{ ...SMALL_BTN, color: "var(--ink)" }}>
                      {t("desk.ee.sh.add")}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setBlocking(f)}
                      className="ohd-hover"
                      style={{ ...SMALL_BTN, color: "var(--dang)" }}
                    >
                      {t("desk.ee.sh.block")}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(f, "ignored")}
                      style={{ height: 30, padding: "0 9px", display: "flex", alignItems: "center", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", cursor: "pointer" }}
                    >
                      {t("desk.ee.sh.ignore")}
                    </button>
                  </>
                ) : (
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      background: STATUS_TONE[status][0],
                      color: STATUS_TONE[status][1],
                    }}
                  >
                    {statusLabel(status)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={blocking != null}
        busy={pending}
        danger
        title={blocking ? t("desk.ee.sh.blockTitle", { name: blocking.name }) : ""}
        body={blocking ? t("desk.ee.sh.blockBody", { count: blocking.users }) : undefined}
        confirmLabel={t("desk.ee.sh.block")}
        onConfirm={() => blocking && act(blocking, "blocked")}
        onClose={() => setBlocking(null)}
      />
    </>
  );
}
