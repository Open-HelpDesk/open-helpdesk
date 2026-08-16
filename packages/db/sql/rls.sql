-- Row-Level Security — isolation des tenants sur le schéma app.
-- À exécuter après chaque migration qui crée une table (ou l'intégrer aux migrations).
--
-- Prérequis : l'application se connecte avec un rôle NON propriétaire des tables
-- (le propriétaire contourne la RLS). Créer par exemple :
--   create role app_user login password '…';
--   grant usage on schema app to app_user;
--   grant select, insert, update, delete on all tables in schema app to app_user;
--
-- Le contexte tenant est posé par withTenant() :
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
    -- idempotent : supprime puis recrée
    execute format('drop policy if exists tenant_isolation on app.%I', t);
    execute format(
      $f$create policy tenant_isolation on app.%I
        using (tenant_id = current_setting('app.tenant_id', true)::uuid)
        with check (tenant_id = current_setting('app.tenant_id', true)::uuid)$f$,
      t
    );
  end loop;
end $$;

-- La table tenants elle-même : visible uniquement la ligne du tenant courant.
alter table app.tenants enable row level security;
drop policy if exists tenant_isolation on app.tenants;
create policy tenant_isolation on app.tenants
  using (id = current_setting('app.tenant_id', true)::uuid)
  with check (id = current_setting('app.tenant_id', true)::uuid);

-- Le worker et la console utilisent un rôle distinct avec bypassrls
-- (résolution du tenant par slug, provisioning, agrégats cross-tenant) :
--   create role platform_user login password '…' bypassrls;
