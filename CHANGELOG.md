# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha] - 2026-08-21

First public release — the self-hostable core (roadmap lots 0–3).

### Added

- **Ticketing**: tickets, conversations, internal notes, statuses and
  priorities, views, macros, tags, spam blocking, agent inbox (AG-01→AG-06).
- **Email channel**: outbound via SMTP, Resend, Brevo or Mailjet (credentials
  encrypted at rest), inbound via provider webhooks or IMAP polling,
  delivery journal and rejected-mail log (ST-03).
- **Contacts & organizations**: directory, editable email domains,
  organization-wide ticket sharing (AG-07, AG-08).
- **Automations**: trigger rules, scheduled rules, round-robin assignment,
  auto-close (ST-05), macros (ST-06).
- **SLA & CSAT**: SLA policies with business hours, satisfaction surveys
  (ST-07, ST-08).
- **Reports**: operational dashboard with CSV export (AG-09).
- **Knowledge base & portal**: public help center, categories and articles,
  article voting, full-text suggestion, embeddable widget, customer requests
  with magic-link authentication (PT-01→PT-08, AG-10, ST-09).
- **Administration**: workspace identity and branding, agents & teams with
  seat accounting, custom fields, portal & widget settings, API keys (ST-01,
  ST-02, ST-04, ST-10).
- **Installation diagnostics**: six-probe health card in Settings → General
  (database, outbound/inbound email, storage, queues and worker liveness,
  secrets encryption).
- **Editions**: `OPENHELPDESK_EDITION` runtime switch — self-hosted unlocks
  the full AGPL core with unlimited seats; cloud enables plan-based gating.
- **Enterprise (`ee/`, commercial license)**: agent SSO (SAML/SCIM) and
  customer-organization SSO administration screens, audit log with CSV export
  (ST-12→ST-14) — runtime SSO flows land in a later release.
- **i18n**: 25 languages (the 24 official EU languages + Norwegian), strict
  dictionary parity enforced at compile time.
- **Self-hosting**: single-command production stack (`docker compose up -d`)
  building web, worker, migrations, PostgreSQL 17, Redis and MinIO; row-level
  security applied per tenant.

[0.1.0-alpha]: https://github.com/open-helpdesk/open-helpdesk/releases/tag/v0.1.0-alpha
