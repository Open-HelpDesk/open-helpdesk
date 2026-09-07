"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auditEvents, db } from "@openhelpdesk/db";
import { createRun, executeRun, parseZendeskExport } from "@openhelpdesk/import";
import { getT } from "@/i18n/server";
import { requireManager } from "../guard";

/**
 * A whole export travels through a form field, so it is the biggest thing this
 * product ever accepts in one request. 40 MB holds roughly a hundred thousand
 * tickets with their conversations — beyond that the answer is not a bigger
 * limit, it is splitting the export, and the screen says so.
 */
const MAX_EXPORT_BYTES = 40 * 1024 * 1024;

/** Both shapes people have on disk: a bare array, or Zendesk's envelope. */
function section(payload: Record<string, unknown>, key: string): unknown {
  const value = payload[key];
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const inner = (value as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

/**
 * Starts an import from an uploaded Zendesk export.
 *
 * Runs inline rather than through the worker queue: the export lives in this
 * request's memory and would have to be written somewhere to be handed over,
 * which means a copy of the customer's entire support history sitting in Redis.
 * A rehearsal is quick, and a real run is started deliberately by someone who
 * is watching. The queue exists for the day imports are pulled from an API
 * instead of uploaded.
 */
export async function startImport(formData: FormData) {
  const { tenant, agent } = await requireManager();
  const t = await getT();

  const dryRun = formData.get("dryRun") === "on";
  const file = formData.get("export");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/app/settings/import?error=missing");
  }
  if (file.size > MAX_EXPORT_BYTES) {
    redirect("/app/settings/import?error=too_large");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(await file.text()) as Record<string, unknown>;
  } catch {
    redirect("/app/settings/import?error=invalid");
  }

  const { data, anomalies } = parseZendeskExport({
    tickets: section(payload, "tickets"),
    users: section(payload, "users"),
    organizations: section(payload, "organizations"),
    comments: (payload["comments"] as Record<string, unknown>) ?? undefined,
  });

  if (data.tickets.length === 0 && data.contacts.length === 0) {
    redirect("/app/settings/import?error=empty");
  }

  const runId = await createRun({
    tenantId: tenant.id,
    source: "zendesk",
    dryRun,
    startedById: agent.id,
  });

  try {
    await executeRun(runId, data, {
      tenantId: tenant.id,
      source: "zendesk",
      dryRun,
      startedById: agent.id,
      parseAnomalies: anomalies,
    });
  } catch {
    // executeRun has already marked the run failed with its reason; the screen
    // reads it from the row. Nothing to add here.
  }

  await db.insert(auditEvents).values({
    tenantId: tenant.id,
    actorType: "user",
    actorId: agent.id,
    action: dryRun ? t("app.settings.import.auditRehearsal") : t("app.settings.import.auditRun"),
    targetType: "import_run",
    targetId: runId,
  });

  revalidatePath("/app/settings/import");
  redirect(`/app/settings/import?run=${runId}`);
}
