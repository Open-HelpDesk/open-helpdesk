"use client";

/** SD-A3 — the licences table, its "Libérer" confirmation and the CSV export. */
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { csvCell, euros, parseDay } from "../shared/format";
import { Bar, BTN, ConfirmDialog, SMALL_BTN, useToast } from "../shared/ui";
import { reclaimAction } from "./actions";
import type { LicenceRow } from "./data";

const GRID = "minmax(0,1.5fr) minmax(0,1.6fr) minmax(0,.6fr) minmax(0,.9fr) minmax(0,1fr) minmax(0,.9fr)";

export function LicenceTable({
  rows,
  icons,
  activityConnector,
}: {
  rows: LicenceRow[];
  icons: Record<string, ReactNode>;
  activityConnector: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState<LicenceRow | null>(null);
  const [pending, start] = useTransition();

  const reclaim = (row: LicenceRow) =>
    start(async () => {
      const res = await reclaimAction(row.id);
      setConfirm(null);
      if (!res.ok) return toast(res.error, "error");
      toast(
        row.renewsOn
          ? t("desk.ee.lic.reclaimedToast", {
              count: res.revoked,
              app: row.name,
              amount: euros(t, res.yearlySavingCents),
              date: t.fmt.dateLong(parseDay(row.renewsOn)),
            })
          : t("desk.ee.lic.reclaimedToastNoRenewal", {
              count: res.revoked,
              app: row.name,
              amount: euros(t, res.yearlySavingCents),
            }),
      );
      router.refresh();
    });

  const unknownTip = activityConnector ? t("desk.ee.lic.unknownTipPartial") : t("desk.ee.lic.unknownTip");

  return (
    <>
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            gap: 14,
            minWidth: 780,
            padding: "10px 16px",
            borderBottom: "1px solid var(--line)",
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--ink-3)",
          }}
        >
          <span>{t("desk.ee.lic.colApp")}</span>
          <span>{t("desk.ee.lic.colUsage")}</span>
          <span>{t("desk.ee.lic.colInactive")}</span>
          <span>{t("desk.ee.lic.colAnnual")}</span>
          <span>{t("desk.ee.lic.colRenewal")}</span>
          <span />
        </div>
        {rows.map((r) => {
          const pct = r.purchased ? r.assigned / r.purchased : null;
          const soon = r.renewsInDays != null && r.renewsInDays <= 90;
          return (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 14,
                minWidth: 780,
                alignItems: "center",
                padding: "11px 16px",
                borderBottom: "1px solid var(--line-2)",
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                {icons[r.id]}
                <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {pct != null ? (
                  <Bar pct={pct * 100} color={pct >= 0.95 ? "var(--wait)" : "var(--brand)"} />
                ) : (
                  <span style={{ flex: 1 }} />
                )}
                <span
                  title={pct == null ? t("desk.ee.lic.noSeatCount") : undefined}
                  style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-2)", minWidth: 58, textAlign: "right" }}
                >
                  {t("desk.ee.lic.ratio", {
                    a: t.fmt.number(r.assigned),
                    b: r.purchased != null ? t.fmt.number(r.purchased) : "—",
                  })}
                </span>
              </div>
              <InactiveCell row={r} unknownTip={unknownTip} />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{euros(t, r.annualCents)}</span>
              <span>
                {r.renewsOn ? (
                  <span
                    title={t("desk.ee.lic.renewsIn", { count: r.renewsInDays ?? 0 })}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      background: soon ? "var(--wait-t)" : "transparent",
                      color: soon ? "var(--wait)" : "var(--ink-2)",
                    }}
                  >
                    {t.fmt.dateLong(parseDay(r.renewsOn))}
                    {soon && r.renewsInDays != null && r.renewsInDays >= 0
                      ? ` · ${t("desk.ee.lic.daysLeft", { count: r.renewsInDays })}`
                      : ""}
                  </span>
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>—</span>
                )}
              </span>
              <span style={{ textAlign: "right" }}>
                {r.inactive > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirm(r)}
                    className="ohd-hover-edge-fill"
                    style={{ ...SMALL_BTN, color: "var(--ink)" }}
                  >
                    {t("desk.ee.lic.reclaim", { count: r.inactive })}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={confirm != null}
        busy={pending}
        title={confirm ? t("desk.ee.lic.confirmTitle", { count: confirm.inactive, app: confirm.name }) : ""}
        body={
          confirm
            ? t("desk.ee.lic.confirmBody", {
                count: confirm.inactive,
                days: confirm.inactiveAfterDays,
                amount: euros(t, confirm.recoverableCents),
              })
            : undefined
        }
        confirmLabel={confirm ? t("desk.ee.lic.confirmCta", { count: confirm.inactive }) : ""}
        danger
        onConfirm={() => confirm && reclaim(confirm)}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

function InactiveCell({ row, unknownTip }: { row: LicenceRow; unknownTip: string }) {
  const t = useT();
  if (row.inactive > 0) {
    return (
      <span
        title={row.unknown > 0 ? t("desk.ee.lic.alsoUnknown", { count: row.unknown }) : undefined}
        style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--wait)" }}
      >
        {t.fmt.number(row.inactive)}
      </span>
    );
  }
  if (row.unknown > 0) {
    return (
      <span title={unknownTip} style={{ color: "var(--ink-3)", cursor: "help", borderBottom: "1px dotted var(--ink-3)", justifySelf: "start" }}>
        —
      </span>
    );
  }
  return <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-3)" }}>{t.fmt.number(0)}</span>;
}

/** Client-side CSV of what the screen shows — same figures, no second query. */
export function ExportCsvButton({ rows }: { rows: LicenceRow[] }) {
  const t = useT();
  const toast = useToast();
  const download = () => {
    const head = ["application", "seats_assigned", "seats_purchased", "inactive", "last_sign_in_unknown", "annual_cost_eur", "recoverable_eur_per_year", "renews_on"];
    const lines = rows.map((r) =>
      [
        r.name,
        r.assigned,
        r.purchased ?? "",
        r.inactive,
        r.unknown,
        (r.annualCents / 100).toFixed(2),
        (r.recoverableCents / 100).toFixed(2),
        r.renewsOn ?? "",
      ]
        .map(csvCell)
        .join(";"),
    );
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `licences-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(t("desk.ee.lic.exported"));
  };
  return (
    <button type="button" onClick={download} className="ohd-hover-edge-fill" style={{ ...BTN, background: "var(--panel)" }}>
      {t("desk.ee.lic.export")}
    </button>
  );
}

