/**
 * Applique sql/rls.sql sur la base pointée par DATABASE_URL — équivalent de
 * `psql "$DATABASE_URL" -f packages/db/sql/rls.sql` sans dépendre de psql
 * (les images Docker n'embarquent que Node). Idempotent, comme le SQL lui-même.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://openhelpdesk:openhelpdesk@localhost:5439/openhelpdesk";

const sql = postgres(connectionString, { max: 1, prepare: false });
const ddl = readFileSync(new URL("../sql/rls.sql", import.meta.url), "utf8");

try {
  await sql.unsafe(ddl);
  console.log("RLS appliquée sur le schéma app.");
} finally {
  await sql.end();
}
