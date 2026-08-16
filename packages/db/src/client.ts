import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://openhelpdesk:openhelpdesk@localhost:5439/openhelpdesk";

/** Connexion paresseuse : postgres.js n'ouvre la connexion qu'à la première requête. */
const queryClient = postgres(connectionString, { prepare: false });

export const db = drizzle(queryClient, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Exécute `fn` dans une transaction où la RLS est active pour le tenant donné.
 * Toute requête sur le schéma `app` hors de ce contexte est rejetée par les
 * politiques de sql/rls.sql (à condition que le rôle SQL ne soit pas propriétaire
 * des tables — voir packages/db/README.md).
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
