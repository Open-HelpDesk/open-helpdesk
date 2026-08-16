# @openhelpdesk/db

Schéma PostgreSQL (Drizzle ORM) : schéma `app` (cœur produit, multi-tenant, RLS) et
schéma `cloud` (control plane, console uniquement).

## Démarrage

```bash
docker compose -f ../../docker/docker-compose.yml up -d postgres
pnpm db:generate   # génère les migrations SQL dans ./drizzle
pnpm db:migrate    # les applique
psql "$DATABASE_URL" -f sql/rls.sql   # active la Row-Level Security
pnpm db:seed       # jeu de démonstration figé (Acme Support — specs/03 § 4)
```

## Règles

- **Toute table du schéma `app` porte `tenant_id`** et passe par `withTenant()` :
  la RLS rejette les requêtes sans contexte tenant.
- L'app produit se connecte avec un rôle **non propriétaire** des tables (sinon la RLS
  est contournée). Le worker et la console utilisent un rôle `bypassrls` dédié.
- Le schéma `cloud` n'est jamais importé par `apps/web` — seul `apps/console` et
  `apps/worker` y accèdent.
- Relancer `sql/rls.sql` (idempotent) après toute migration créant une table.
