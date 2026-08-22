-- Row-Level Security — tenant isolation on the app schema.
-- To be run after every migration that creates a table (or folded into the migrations).
--
-- Prerequisite: the application connects with a role that does NOT own the tables
-- (the owner bypasses RLS). For example, create:
--   create role app_user login password '…';
--   grant usage on schema app to app_user;
--   grant select, insert, update, delete on all tables in schema app to app_user;
--
-- The tenant context is set by withTenant():
--   select set_config('app.tenant_id', '<uuid>', true);

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'app' and tablename <> 'tenants'
  loop
    execute format('alter table app.%I enable row level security', t);
    -- idempotent: drop, then recreate
    execute format('drop policy if exists tenant_isolation on app.%I', t);
    execute format(
      $f$create policy tenant_isolation on app.%I
        using (tenant_id = current_setting('app.tenant_id', true)::uuid)
        with check (tenant_id = current_setting('app.tenant_id', true)::uuid)$f$,
      t
    );
  end loop;
end $$;

-- The tenants table itself: only the current tenant's row is visible.
alter table app.tenants enable row level security;
drop policy if exists tenant_isolation on app.tenants;
create policy tenant_isolation on app.tenants
  using (id = current_setting('app.tenant_id', true)::uuid)
  with check (id = current_setting('app.tenant_id', true)::uuid);

-- The worker uses a distinct role with bypassrls (tenant resolution by slug,
-- provisioning, cross-tenant aggregates):
--   create role platform_user login password '…' bypassrls;
