/**
 * An import run: the row in `import_runs` that records what happened.
 *
 * Kept apart from the writer so the writer stays a pure function of its input —
 * easy to run against a fixture, easy to reason about. This file owns the
 * bookkeeping: mark running, save progress, mark finished, and never let a
 * failure leave a run stuck at "running" forever.
 */
import { db, importRuns } from "@openhelpdesk/db";
import { and, desc, eq } from "drizzle-orm";
import type { Anomaly, ImportReport, ImportSource, SourceExport } from "./types";
import { writeImport, type WriteOptions } from "./write";

export type StartRunOptions = {
  tenantId: string;
  source: ImportSource;
  dryRun?: boolean;
  startedById?: string | null;
  /**
   * Anomalies found while *reading* the export — an unmappable status, a user
   * with no email — which the writer never sees because those rows never reach
   * it. Passed in so the run record holds one list, not two: whoever reads the
   * report cares about everything that did not come across, regardless of which
   * half of the pipeline noticed.
   */
  parseAnomalies?: Anomaly[];
  /** Passed through to the writer — see WriteOptions.attachments. */
  attachments?: WriteOptions["attachments"];
};

export async function createRun(options: StartRunOptions): Promise<string> {
  const [row] = await db
    .insert(importRuns)
    .values({
      tenantId: options.tenantId,
      source: options.source,
      status: "pending",
      dryRun: options.dryRun ?? false,
      startedById: options.startedById ?? null,
    })
    .returning({ id: importRuns.id });
  return row!.id;
}

function countsOf(report: ImportReport) {
  return {
    organizations: report.organizations,
    contacts: report.contacts,
    tickets: report.tickets,
    messages: report.messages,
    attachments: report.attachments,
  };
}

/**
 * Runs an import and keeps its row up to date.
 *
 * Progress is saved as it goes, so an operator watching a long run sees it
 * move, and a process killed mid-run leaves behind what it had already done
 * rather than a blank row.
 */
export async function executeRun(
  runId: string,
  data: SourceExport,
  options: StartRunOptions,
): Promise<ImportReport> {
  await db
    .update(importRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(importRuns.id, runId));

  let lastSaved = 0;
  try {
    const report = await writeImport(data, {
      tenantId: options.tenantId,
      source: options.source,
      dryRun: options.dryRun ?? false,
      attachments: options.attachments,
      onProgress: async (partial) => {
        // Saving on every batch would double the write load for no benefit:
        // once a second is enough for a progress bar to look alive.
        const now = Date.now();
        if (now - lastSaved < 1000) return;
        lastSaved = now;
        await db
          .update(importRuns)
          .set({ counts: countsOf(partial) })
          .where(eq(importRuns.id, runId));
      },
    });

    // Capped at the same 500 the writer uses: a run with forty thousand broken
    // rows must not turn one database row into a megabyte of JSON.
    const anomalies = [...(options.parseAnomalies ?? []), ...report.anomalies].slice(0, 500);
    await db
      .update(importRuns)
      .set({
        status: "succeeded",
        counts: countsOf(report),
        anomalies,
        finishedAt: new Date(),
      })
      .where(eq(importRuns.id, runId));
    return { ...report, anomalies };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(importRuns)
      .set({ status: "failed", error: message.slice(0, 1000), finishedAt: new Date() })
      .where(eq(importRuns.id, runId));
    throw error;
  }
}

/** The runs of a workspace, most recent first — for the admin screen. */
export async function recentRuns(tenantId: string, limit = 10) {
  return db
    .select()
    .from(importRuns)
    .where(eq(importRuns.tenantId, tenantId))
    .orderBy(desc(importRuns.createdAt))
    .limit(limit);
}

/**
 * A run left behind by a process that died.
 *
 * Without this, a killed worker leaves a row saying "running" that nothing will
 * ever finish, and the screen shows a spinner for ever. Called by the worker at
 * start-up, on the same principle as the mail outbox.
 */
export async function reapStaleRuns(tenantId?: string): Promise<number> {
  const stale = await db
    .update(importRuns)
    .set({
      status: "failed",
      error: "interrupted — the import process stopped before finishing",
      finishedAt: new Date(),
    })
    .where(
      tenantId
        ? and(eq(importRuns.status, "running"), eq(importRuns.tenantId, tenantId))
        : eq(importRuns.status, "running"),
    )
    .returning({ id: importRuns.id });
  return stale.length;
}
