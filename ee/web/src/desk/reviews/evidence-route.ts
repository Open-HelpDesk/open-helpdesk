/**
 * SD-A4 — download of a campaign's audit evidence (CSV or timestamped PDF):
 * every line, its decision, its reviewer, the time. The document itself is
 * produced by ee/desk (exportReviewEvidence); this handler only checks who is
 * asking and streams it.
 */
import { NextResponse, type NextRequest } from "next/server";
import "@/lib/desk";
import { exportReviewEvidence } from "@openhelpdesk/ee-desk";
import { apiAgent } from "@/lib/session";
import { entitlementsFor } from "@/lib/entitlements";
import { getT } from "@/i18n/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const current = await apiAgent();
  if (!current) return new NextResponse(t("desk.ee.rev.evidenceUnauthorized"), { status: 401 });
  const ent = entitlementsFor(current.tenant);
  if (!ent.serviceDesk || !ent.deskAccessReviews) {
    return new NextResponse(t("desk.ee.error.locked"), { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  try {
    const file = await exportReviewEvidence(current.tenant.id, id, format);
    const name = file.filename.replace(/[^\w.\-]+/g, "_");
    return new NextResponse(Buffer.from(file.body), {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return new NextResponse(t("desk.ee.error.failed", { detail }), { status: 500 });
  }
}
