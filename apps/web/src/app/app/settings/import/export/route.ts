/**
 * GET /app/settings/import/export — the workspace's history, as NDJSON.
 *
 * Streamed rather than assembled: a workspace with two hundred thousand tickets
 * would be hundreds of megabytes, and building that in memory to hand it over
 * would take the process down. The generator in @openhelpdesk/export yields one
 * line at a time and the response forwards each chunk as it comes, so memory
 * stays flat and the download starts immediately instead of after a long
 * silence the user reads as a hang.
 *
 * Owner and Admin only: this is the whole customer record, including internal
 * notes, and an agent has no business walking out with it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auditEvents, db } from "@openhelpdesk/db";
import { exportWorkspace } from "@openhelpdesk/export";
import { apiAgent } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function GET(_request: NextRequest) {
  const t = await getT();
  const current = await apiAgent();
  if (!current) return new NextResponse(t("app.settings.dev.exportUnauthorized"), { status: 401 });
  const { tenant, agent } = current;
  if (agent.role !== "owner" && agent.role !== "admin") {
    return new NextResponse(t("app.settings.dev.exportForbidden"), { status: 403 });
  }

  // Written before the stream starts: an export that fails halfway still has to
  // leave a trace that someone asked for the entire customer record.
  await db.insert(auditEvents).values({
    tenantId: tenant.id,
    actorType: "user",
    actorId: agent.id,
    action: t("app.settings.import.auditExport"),
    targetType: "workspace",
    targetId: tenant.id,
  });

  const encoder = new TextEncoder();
  const lines = exportWorkspace(tenant.id);
  const stream = new ReadableStream<Uint8Array>({
    // Called again each time the client drains what it has: back-pressure is
    // what keeps a huge export from being produced faster than it is consumed.
    async pull(controller) {
      try {
        const { value, done } = await lines.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(value));
      } catch (err) {
        controller.error(err);
      }
    },
    // The browser aborted or the connection dropped: let the generator release
    // its database cursor instead of leaving it walking a 200 000-row table.
    async cancel() {
      await lines.return(undefined);
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="open-helpdesk-${tenant.slug}-${stamp}.ndjson"`,
      "cache-control": "no-store",
    },
  });
}
