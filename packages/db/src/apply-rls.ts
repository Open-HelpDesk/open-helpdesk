/**
 * Applies sql/rls.sql to the database pointed at by DATABASE_URL — the equivalent
 * of `psql "$DATABASE_URL" -f packages/db/sql/rls.sql` without depending on psql
 * (the Docker images only ship Node). Idempotent, like the SQL itself.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://openhelpdesk:openhelpdesk@localhost:5439/openhelpdesk";

const sql = postgres(connectionString, { max: 1, prepare: false });
const ddl = readFileSync(new URL("../sql/rls.sql", import.meta.url), "utf8");

try {
  await sql.unsafe(ddl);
  console.log("RLS applied on the app schema.");
} finally {
  await sql.end();
}
