# Open HelpDesk

**Open-core helpdesk you can actually self-host.** Ticketing, email channel,
automations, SLA, CSAT, knowledge base and customer portal — an AGPL-3.0 core,
with commercially licensed features in [`ee/`](ee/).

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![CI](https://github.com/open-helpdesk/open-helpdesk/actions/workflows/ci.yml/badge.svg)](https://github.com/open-helpdesk/open-helpdesk/actions/workflows/ci.yml)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange)](CHANGELOG.md)

> **Alpha.** The core product (roadmap milestones 0–3) works end-to-end and
> is covered by a Playwright smoke suite, but APIs, schema and screens still
> move fast. Not production-ready yet — a good time to try it and open issues.

![Ticket view](.github/assets/ticket.png)

## Features

- **Ticketing** — conversations, internal notes, priorities, views, macros,
  tags, keyboard-first inbox, ⌘K palette
- **Email channel** — outbound via SMTP, Resend, Brevo or Mailjet (credentials
  encrypted at rest); inbound via provider webhooks or IMAP polling
- **Automations** — trigger rules, scheduled rules, round-robin assignment,
  auto-close
- **SLA & CSAT** — policies with business hours, satisfaction surveys
- **Knowledge base & portal** — public help center, embeddable widget,
  magic-link customer accounts, article voting and search deflection
- **Reports** — operational dashboard, CSV export
- **Multi-tenant** — subdomain resolution, PostgreSQL row-level security
- **25 languages** — the 24 official EU languages + Norwegian, with strict
  dictionary parity enforced at compile time
- **Installation diagnostics** — a six-probe health card in Settings → General

## Self-host in three commands

```bash
git clone https://github.com/open-helpdesk/open-helpdesk && cd open-helpdesk
cp .env.example .env   # set BETTER_AUTH_SECRET and ENCRYPTION_KEY
docker compose up -d
```

Open http://localhost:3000 — the stack (web, worker, PostgreSQL 17, Redis,
MinIO) starts with a demo workspace: `marie.dupont@acme.example` /
`demo-openhelpdesk`. Set `SEED_DEMO=false` once your own agents exist. The
diagnostics card in **Settings → General** tells you what is left to configure.

## Development

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d   # deps + Mailpit for emails
pnpm db:generate && pnpm db:migrate
pnpm --filter @openhelpdesk/db db:rls
pnpm db:seed && pnpm db:seed:auth
pnpm dev
```

Then open http://acme.localhost:3000. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licensing

Open HelpDesk is open-core, and the licence boundary is the `ee/` directory:

- **Core — [AGPL-3.0](LICENSE).** Everything outside [`ee/`](ee/): ticketing,
  email channel, automations, SLA, CSAT, knowledge base, customer portal,
  reports and API, with unlimited seats.
- **`ee/` — commercial licence.** Agent SSO (SAML/SCIM), delegated
  customer-organization SSO and the advanced audit log. The source is visible
  and free to use in development and testing, but production use requires a
  commercial agreement — see [`ee/LICENSE`](ee/LICENSE).

## Documentation

English documentation is planned. In the meantime, [CONTRIBUTING.md](CONTRIBUTING.md)
covers the development setup, and the diagnostics card (Settings → General)
covers the installation.

## Roadmap

| | |
|---|---|
| ✅ Milestones 0–3 | Core ticketing, email, automations/SLA/CSAT, portal & KB — this release |
| 🔜 Next | Enterprise identity — SAML/SCIM runtime, delegated customer-organization SSO |
| 🔜 Next | AI — triage, reply suggestions, thread summaries |
| 🔜 Later | Custom domains, multi-brand, public documentation |

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
