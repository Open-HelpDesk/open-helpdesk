/**
 * Re-seeds the service desk demo data on an existing database, without running
 * the whole demo seed: `pnpm --filter @openhelpdesk/db db:seed:desk [slug]`.
 * Idempotent — the tenant's desk rows are deleted, then inserted again.
 */
import { eq } from "drizzle-orm";
import { db } from "../client";
import { tenants } from "../schema";
import { seedDeskDemo } from "./desk";

async function main() {
  const slug = process.argv[2] ?? "acme";
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  if (!tenant) throw new Error(`No tenant with slug "${slug}" — run db:seed first`);
  const summary = await seedDeskDemo(tenant.id);
  console.log(`OK — service desk demo for ${slug}:`, summary);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
