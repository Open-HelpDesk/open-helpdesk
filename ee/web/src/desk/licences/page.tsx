/**
 * SD-A3 — Licences (`/app/desk/licences`, ee/ deskLicences).
 *
 * Four tiles (annual spend, seats, inactive seats and what they cost,
 * renewals within 90 days) over a table sorted by renewal date, with
 * "Libérer" per application and a CSV export of what is on screen.
 */
import { AppIcon } from "@/components/desk/app-icon";
import { deskScreen } from "../shared/server";
import { DeskColumn, DeskHeader, DeskLocked } from "../shared/screen";
import { DeskToaster } from "../shared/ui";
import { kEuros } from "../shared/format";
import { loadLicences } from "./data";
import { ExportCsvButton, LicenceTable } from "./table";

export default async function LicencesPage() {
  const ctx = await deskScreen("deskLicences");
  const { t } = ctx;
  const title = t("desk.ee.lic.title");
  if (!ctx.allowed) {
    return (
      <DeskLocked
        t={t}
        title={title}
        lockedTitle="desk.ee.lic.lockedTitle"
        lockedText="desk.ee.lic.lockedText"
      />
    );
  }

  const data = await loadLicences(ctx.tenant.id);
  const { totals } = data;
  const pct = totals.purchased ? Math.round((totals.assigned / totals.purchased) * 100) : 0;
  const kpis = [
    {
      l: t("desk.ee.lic.kpiSpend"),
      v: kEuros(t, totals.annualCents),
      d: t("desk.ee.lic.kpiSpendSub", { count: data.rows.length }),
    },
    {
      l: t("desk.ee.lic.kpiSeats"),
      v: t("desk.ee.lic.ratio", { a: t.fmt.number(totals.assigned), b: t.fmt.number(totals.purchased) }),
      d: t("desk.ee.lic.kpiSeatsSub", { pct: String(pct) }),
    },
    {
      l: t("desk.ee.lic.kpiInactive"),
      v: t.fmt.number(totals.inactive),
      d:
        totals.inactive === 0 && totals.unknown > 0
          ? t("desk.ee.lic.kpiInactiveUnknown", { count: totals.unknown })
          : t("desk.ee.lic.kpiInactiveSub", { amount: kEuros(t, totals.recoverableCents) }),
    },
    {
      l: t("desk.ee.lic.kpiRenewals"),
      v: t.fmt.number(totals.renewalsSoon),
      d: t("desk.ee.lic.kpiRenewalsSub", { amount: kEuros(t, totals.renewalsSoonCents) }),
    },
  ];

  return (
    <DeskToaster>
      <DeskColumn>
        <DeskHeader
          title={title}
          subtitle={t("desk.ee.lic.subtitle", { count: 30 })}
          actions={data.rows.length > 0 ? <ExportCsvButton rows={data.rows} /> : undefined}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          {kpis.map((k) => (
            <div key={k.l} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{k.l}</div>
              <div style={{ fontFamily: "var(--font-title)", fontSize: 28, fontWeight: 600, letterSpacing: "-.015em", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {k.v}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>{k.d}</div>
            </div>
          ))}
        </div>
        {data.rows.length === 0 ? (
          <div
            style={{
              background: "var(--panel)",
              border: "1px dashed var(--line)",
              borderRadius: 14,
              padding: "40px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <p style={{ fontSize: 16, fontWeight: 600 }}>{t("desk.ee.lic.emptyTitle")}</p>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)", maxWidth: 460 }}>{t("desk.ee.lic.emptyText")}</p>
          </div>
        ) : (
          <LicenceTable
            rows={data.rows}
            activityConnector={data.activityConnector}
            icons={Object.fromEntries(
              data.rows.map((r) => [r.id, <AppIcon key={r.id} name={r.name} iconKey={r.iconKey} color={r.color} size={30} />]),
            )}
          />
        )}
      </DeskColumn>
    </DeskToaster>
  );
}
