/**
 * Writes a workspace's history to stdout, as NDJSON.
 *
 *   pnpm --filter @openhelpdesk/export run export -- --tenant acme > acme.ndjson
 *
 * The same generator the download route uses, so what an operator produces on
 * the server and what a customer downloads from the screen are byte-for-byte
 * the same file — a support answer that says "run this instead" must not
 * produce something different.
 */
import { closeDb, db, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { exportCounts, exportWorkspace } from "./index";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const slug = flag("tenant");
if (!slug) {
  console.error("Usage: cli.ts --tenant <slug> [--counts]");
  process.exit(1);
}

const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
if (!tenant) {
  console.error(`No workspace with slug "${slug}".`);
  process.exit(1);
}

if (process.argv.includes("--counts")) {
  const counts = await exportCounts(tenant.id);
  // To stderr: --counts is a look before the leap, and its output must not end
  // up mixed into a redirected export.
  console.error(
    `${counts.tickets} tickets · ${counts.messages} messages · ${counts.contacts} contacts · ` +
      `${counts.organizations} organisations · ${counts.attachments} attachments`,
  );
  process.exit(0);
}

for await (const line of exportWorkspace(tenant.id)) {
  // Respect back-pressure: a redirect into a file on a slow disk must not make
  // this buffer the whole history in memory.
  if (!process.stdout.write(line)) {
    await new Promise((resolve) => process.stdout.once("drain", resolve));
  }
}

/*
 * No process.exit() here, and that is the whole point.
 *
 * When stdout is a pipe — which it is under `pnpm run`, and again under any
 * shell redirect that goes through one — Node writes to it asynchronously, and
 * process.exit() throws away whatever is still buffered. The first version of
 * this file ended with process.exit(0) and produced a **zero-byte export**: the
 * command succeeded, the file was empty, and nothing said so.
 *
 * Closing the connection lets the event loop empty on its own, once the last
 * chunk has actually left.
 */
await closeDb();
