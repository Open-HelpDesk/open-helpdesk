/**
 * Runs an import from the command line.
 *
 *   pnpm --filter @openhelpdesk/import run import --tenant <slug> --file export.json --dry-run
 *   pnpm --filter @openhelpdesk/import run import --tenant <slug> --file export.json
 *
 * The file is a Zendesk export: an object carrying `tickets`, `users` and
 * `organizations`, optionally `comments` keyed by ticket id. Both the arrays
 * the API returns and the `{ tickets: [...] }` envelopes it wraps them in are
 * accepted, because both are what people actually have on disk.
 *
 * Always rehearse with --dry-run first: it reads everything, writes nothing,
 * and prints the same report the real run would.
 */
import { readFileSync } from "node:fs";
import { db, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { createRun, executeRun } from "./run";
import type { ImportReport } from "./types";
import { parseZendeskExport } from "./zendesk";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Accepts a bare array or the `{ tickets: [...] }` envelope Zendesk returns. */
function section(payload: Record<string, unknown>, key: string): unknown {
  const value = payload[key];
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const inner = (value as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

function line(label: string, counts: ImportReport["tickets"]): string {
  return `  ${label.padEnd(14)} seen ${String(counts.seen).padStart(6)} · created ${String(
    counts.created,
  ).padStart(6)} · skipped ${String(counts.skipped).padStart(6)} · failed ${String(
    counts.failed,
  ).padStart(5)}`;
}

const slug = flag("tenant");
const file = flag("file");
const dryRun = process.argv.includes("--dry-run");
/**
 * Credentials for fetching the files the export only names. Without them the
 * attachments are counted and reported as skipped — never silently dropped.
 */
const authorization = flag("auth") ?? process.env["ZENDESK_AUTHORIZATION"] ?? null;

if (!slug || !file) {
  console.error("Usage: cli.ts --tenant <slug> --file <export.json> [--dry-run]");
  process.exit(1);
}

const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
if (!tenant) {
  console.error(`No workspace with slug "${slug}".`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
const { data, anomalies } = parseZendeskExport({
  tickets: section(payload, "tickets"),
  users: section(payload, "users"),
  organizations: section(payload, "organizations"),
  comments: (payload["comments"] as Record<string, unknown>) ?? undefined,
});

console.log(
  `Read ${data.tickets.length} ticket(s), ${data.contacts.length} contact(s), ` +
    `${data.organizations.length} organisation(s) from ${file}.`,
);
if (dryRun) console.log("Rehearsal: nothing will be written.\n");

const runId = await createRun({
  tenantId: tenant.id,
  source: "zendesk",
  dryRun,
});
const report = await executeRun(runId, data, {
  tenantId: tenant.id,
  source: "zendesk",
  dryRun,
  parseAnomalies: anomalies,
  attachments: { enabled: Boolean(authorization) && !dryRun, authorization },
});


console.log(`\nRun ${runId}${dryRun ? " (rehearsal)" : ""}`);
console.log(line("organisations", report.organizations));
console.log(line("contacts", report.contacts));
console.log(line("tickets", report.tickets));
console.log(line("messages", report.messages));
console.log(line("attachments", report.attachments));
if (report.attachments.seen > 0 && !authorization) {
  console.log(
    "\n  Attachments were listed but not fetched: pass --auth \"Bearer <token>\" " +
      "(or set ZENDESK_AUTHORIZATION) to bring the files across.",
  );
}

if (report.anomalies.length) {
  console.log(`\n${report.anomalies.length} thing(s) could not be brought across:`);
  const byKind = new Map<string, number>();
  for (const anomaly of report.anomalies) {
    byKind.set(anomaly.kind, (byKind.get(anomaly.kind) ?? 0) + 1);
  }
  for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(6)} × ${kind}`);
  }
  console.log("\nFirst few:");
  for (const anomaly of report.anomalies.slice(0, 10)) {
    console.log(`  ${anomaly.kind} · ${anomaly.object} ${anomaly.externalId}` +
      (anomaly.detail ? ` · ${anomaly.detail}` : ""));
  }
}

process.exit(0);
