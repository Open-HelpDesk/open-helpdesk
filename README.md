# Open HelpDesk

Plateforme de ticketing **open-core** : un cœur open source auto-hébergeable (AGPL-3.0 +
dossier `/ee` sous licence commerciale), et une offre cloud managée en sous-domaines de
`open-helpdesk.com`.

- **Spécifications** (51 écrans, v1.2) : [`specs/`](specs/README.md)
- **Maquettes validées** : [`design/`](design/)

## Structure

```
apps/
  web/       Produit : espace agent + admin tenant + portail client (Next.js)
  console/   Control plane cloud — console interne (Next.js, accent cuivre)
  www/       Site vitrine + signup (Next.js)
  worker/    Jobs BullMQ : SLA, ingestion email, automatisations, provisioning
packages/
  config/    Constantes partagées (statuts, plans, sous-domaines réservés…)
  db/        Schémas PostgreSQL app + cloud (Drizzle), RLS, seed de démo
  ui/        Design system — tokens extraits des maquettes
ee/          Fonctionnalités sous licence commerciale (SSO, audit log, IA…)
docker/      postgres + redis + minio pour le développement et l'auto-hébergement
```

## Démarrage

```bash
corepack enable                 # active pnpm (version épinglée dans package.json)
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
pnpm db:generate && pnpm db:migrate
psql "$DATABASE_URL" -f packages/db/sql/rls.sql
pnpm db:seed                    # workspace de démo « Acme Support »
pnpm db:seed:auth               # comptes agents de démo
pnpm dev                        # web :3000 · console :3001 · www :3002 · worker
```

Puis ouvrir **http://acme.localhost:3000** — le middleware résout le tenant par
sous-domaine ({slug}.BASE_DOMAIN, voir `.env.example`). Connexion de démo :
`marie.dupont@acme.example` / `demo-openhelpdesk`.

## État d'avancement (roadmap specs/01 § 9)

| Lot | Contenu | État |
|---|---|---|
| Lot 0 — Socle | Monorepo, schéma DB + RLS, multi-tenant par sous-domaine, tokens design, docker, auth (Better Auth) | **Fait** — reste : 2FA, CI |
| Lot 1 — Cœur ticketing | Tickets, conversations, email, contacts/orgs, vues, recherche | **En cours** — fait : AG-01, AG-03, AG-04, AG-05, AG-06 (⌘K), AG-07 (contacts + blocage spam), AG-08 (organisations + domaines éditables + partage), pipeline email entrant/sortant. Reste : vues personnalisées, actions groupées, temps réel, poller IMAP, import CSV, fusion |
| Lot 2 — Productivité | Macros, automatisations, SLA, champs, CSAT, rapports | À venir |
| Lot 3 — Portail & KB | KB, portail client, widget, déflexion | À venir |
| Lot 4 — Cloud | Signup, provisioning, Stripe, console | À venir |
| Lot 5a/5b/5c — Identité & IA | SSO agents, SSO clients délégué, IA | À venir |
| Lot 6 — Acquisition | Site vitrine, documentation publique | À venir |
