# Open HelpDesk

> English README: [README.md](README.md)

Plateforme de ticketing **open-core** : un cœur open source auto-hébergeable (AGPL-3.0 +
dossier `/ee` sous licence commerciale), et une offre cloud managée en sous-domaines de
`open-helpdesk.com`.

## Auto-hébergement en trois commandes

```bash
git clone https://github.com/open-helpdesk/open-helpdesk && cd open-helpdesk
cp .env.example .env   # renseigner BETTER_AUTH_SECRET et ENCRYPTION_KEY
docker compose up -d
```

L'instance répond sur http://localhost:3000 avec le workspace de démonstration
(`marie.dupont@acme.example` / `demo-openhelpdesk`). La carte « Santé de
l'installation » (Paramètres → Général) dit ce qu'il reste à configurer.

- Les 32 écrans produit sont implémentés au plus près des maquettes de référence ;
  les défauts imaginés par le design (macros, politiques SLA, règles, équipes,
  horaires, champs) sont installés dans tout nouveau workspace par
  `packages/db/src/seed/defaults.ts`

## Structure

```
apps/
  web/       Produit : espace agent + admin tenant + portail client (Next.js)
  www/       Site vitrine + signup (Next.js)
  worker/    Jobs BullMQ : SLA, envoi et ingestion email, automatisations
packages/
  config/    Constantes partagées (statuts, plans, sous-domaines réservés…)
  crypto/    Chiffrement AES-256-GCM des secrets (SMTP, clés d'API, SSO)
  mail/      Envoi (SMTP, Resend, Brevo, Mailjet) + ingestion + boîte d'envoi
  db/        Schéma PostgreSQL (Drizzle), RLS, seed de démo
  ui/        Design system — tokens extraits des maquettes
ee/          Fonctionnalités sous licence commerciale (SSO, audit log, IA…)
docker/      postgres + redis + minio + mailpit (SMTP de développement)
```

## Démarrage

```bash
corepack enable                 # active pnpm (version épinglée dans package.json)
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
pnpm db:generate && pnpm db:migrate
pnpm --filter @openhelpdesk/db db:rls
pnpm db:seed                    # workspace de démo « Acme Support »
pnpm db:seed:auth               # comptes agents de démo
pnpm dev                        # web :3000 · www :3002 · worker
```

Les emails de développement sont capturés par **Mailpit** : http://localhost:8026.
Pour envoyer pour de vrai, chaque workspace choisit son fournisseur dans
**Paramètres → Canaux → Email** (SMTP, Resend, Brevo ou Mailjet — identifiants chiffrés
en base). En auto-hébergement mono-tenant, les variables `SMTP_*` / `*_API_KEY` de
`.env` servent de configuration d'instance par défaut.

Puis ouvrir **http://acme.localhost:3000** — le middleware résout le tenant par
sous-domaine ({slug}.BASE_DOMAIN, voir `.env.example`). Connexion de démo :
`marie.dupont@acme.example` / `demo-openhelpdesk`.

## État d'avancement

| Lot | Contenu | État |
|---|---|---|
| Lot 0 — Socle | Monorepo, schéma DB + RLS, multi-tenant par sous-domaine, tokens design, docker, auth (Better Auth) | **Fait** — reste : 2FA, CI |
| Lot 1 — Cœur ticketing | Tickets, conversations, email, contacts/orgs, vues, recherche | **En cours** — fait : AG-01, AG-03, AG-04, AG-05, AG-06 (⌘K), AG-07 (contacts + blocage spam), AG-08 (organisations + domaines éditables + partage), pipeline email entrant/sortant. Reste : vues personnalisées, actions groupées, temps réel, poller IMAP, import CSV, fusion |
| Lot 2 — Productivité | Macros, automatisations, SLA, champs, CSAT, rapports | **Quasi fait** — moteur de règles + worker, administration (ST-02, ST-05, ST-06, ST-07, ST-08 CSAT), rapports AG-09. Reste : équipes, champs custom (ST-04), heures ouvrées, drag & drop, « Tester sur un ticket », export CSV |
| Lot 3 — Portail & KB | KB, portail client, widget, déflexion | **Fait** — portail complet (PT-01→PT-07), gestion KB (AG-10), config portail & widget (ST-09), widget embarquable, pièces jointes S3/MinIO. Reste (Lot 2 rattaché) : formulaires dynamiques ST-04 |
| Lot 4 — Cloud | Signup, provisioning, Stripe, console | À venir |
| Lot 5a/5b/5c — Identité & IA | SSO agents, SSO clients délégué, IA | À venir |
| Lot 6 — Acquisition | Site vitrine, documentation publique | À venir |
