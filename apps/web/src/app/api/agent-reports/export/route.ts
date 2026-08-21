/** AG-09 — Export CSV des KPI de la période (toolbar « Export CSV »). */
import { NextResponse, type NextRequest } from "next/server";
import { apiAgent } from "@/lib/session";
import { getReportData } from "@/lib/reports";
import { getT } from "@/i18n/server";

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const t = await getT();
  const current = await apiAgent();
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const p = Number(request.nextUrl.searchParams.get("p"));
  const days = [7, 30, 90].includes(p) ? p : 30;
  const team = request.nextUrl.searchParams.get("team") ?? undefined;

  const data = await getReportData(current.tenant.id, days, team);

  const lines: string[] = [];
  lines.push(
    [
      t("app.reports.csvIndicator"),
      t("app.reports.csvCurrentPeriod"),
      t("app.reports.csvPreviousPeriod"),
    ]
      .map(csvCell)
      .join(";"),
  );
  lines.push(
    [t("app.reports.csvCreated"), data.current.created, data.previous.created].map(csvCell).join(";"),
  );
  lines.push(
    [t("app.reports.csvResolved"), data.current.resolved, data.previous.resolved].map(csvCell).join(";"),
  );
  lines.push(
    [
      t("app.reports.csvMedianFirstReply"),
      data.current.medianFirstReplySec,
      data.previous.medianFirstReplySec,
    ]
      .map(csvCell)
      .join(";"),
  );
  lines.push(
    [t("app.reports.csvMedianResolve"), data.current.medianResolveSec, data.previous.medianResolveSec]
      .map(csvCell)
      .join(";"),
  );
  lines.push(
    [t("app.reports.csvSlaCompliance"), data.current.slaCompliancePct, data.previous.slaCompliancePct]
      .map(csvCell)
      .join(";"),
  );
  lines.push([t("app.reports.csvCsat"), data.csatCurrent, data.csatPrevious].map(csvCell).join(";"));
  lines.push("");
  lines.push(
    [t("app.reports.csvDay"), t("app.reports.csvCreatedShort"), t("app.reports.csvResolvedShort")]
      .map(csvCell)
      .join(";"),
  );
  for (const d of data.daily) {
    lines.push([d.day, d.created, d.resolved].map(csvCell).join(";"));
  }
  lines.push("");
  lines.push(
    [
      t("app.reports.csvAgent"),
      t("app.reports.csvResolvedShort"),
      t("app.reports.csvMedianFirstReply"),
      t("app.reports.csvCsat"),
    ]
      .map(csvCell)
      .join(";"),
  );
  for (const a of data.agents) {
    lines.push([a.name, a.resolved, a.medianFirstReplySec, a.csatPct].map(csvCell).join(";"));
  }

  const filename = `rapports-${days}j.csv`;
  return new NextResponse(`﻿${lines.join("\n")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
