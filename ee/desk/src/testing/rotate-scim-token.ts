/**
 * Development helper: mints a fresh inbound SCIM token for a workspace and
 * prints it once, so the SCIM endpoint can be exercised with curl or pointed
 * at from an identity provider's test tenant.
 *
 *   OPENHELPDESK_EDITION=cloud packages/db/node_modules/.bin/tsx ee/desk/src/testing/rotate-scim-token.ts acme
 *
 * The previous token stops working immediately.
 */
import { eq } from "drizzle-orm";
import { closeDb, db, tenants } from "@openhelpdesk/db";
import { rotateScimToken } from "../scim";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: rotate-scim-token.ts <tenant-slug>");
  process.exitCode = 1;
} else {
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  if (!tenant) {
    console.error(`no workspace ${slug}`);
    process.exitCode = 1;
  } else {
    const { token } = await rotateScimToken(tenant.id, { kind: "system" });
    console.log(token);
  }
  await closeDb();
}
