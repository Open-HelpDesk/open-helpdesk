# @openhelpdesk/db

PostgreSQL schema (Drizzle ORM): the `app` schema — the product core,
multi-tenant, under row-level security.

## Getting started

```bash
docker compose -f ../../docker/docker-compose.yml up -d postgres
pnpm db:generate   # generates the SQL migrations into ./drizzle
pnpm db:migrate    # applies them
psql "$DATABASE_URL" -f sql/rls.sql   # enables row-level security
pnpm db:seed       # frozen demo data set (Acme Support)
```

## Rules

- **Every table of the `app` schema carries `tenant_id`** and goes through
  `withTenant()`: RLS rejects queries that carry no tenant context.
- The product app connects with a role that does **not** own the tables
  (otherwise RLS is bypassed). The worker uses a dedicated `bypassrls` role.
- Re-run `sql/rls.sql` (it is idempotent) after any migration that creates a
  table.
