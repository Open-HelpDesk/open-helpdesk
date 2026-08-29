# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2-alpha] - 2026-08-29

The redesign release: all 29 screens of the agent workspace and the
administration were rebuilt against the V2 design. Nothing about self-hosting
changes — this is what the product looks like and how it reads.

### Added

- **A V2 foundation** shared by every screen: one palette valued per theme, the
  shipped typefaces, a shell with a full-width top bar, a breadcrumb, derived
  notifications, and administration primitives (a 236 px rail, one centred
  1040 column, r14 cards, h40 fields) that the eighteen settings screens now go
  through instead of each choosing its own measurements.
- **The inbox becomes cards** with five orders and faceted filters that say how
  many tickets each value would bring. A row names its priority only when it is
  High or Urgent — the two levels that ask for a decision — and a ticket nobody
  has touched shows *New* for its first twenty-four hours, then stops saying so.
- **The ticket screen** gains four tabs (Conversation, Tasks, Activity,
  Resolution), real tasks, five side panels behind five icons — requester,
  pinned notes, SLA timeline, linked tickets, properties — and a Resolution tab
  that records the cause, the article to propose and the summary sent to the
  customer.
- **The view builder**, the ⌘K palette, the sign-in card and an onboarding that
  became a checklist instead of a wizard.
- **A default favicon**: a workspace that has not uploaded its own now shows the
  product's mark instead of nothing.

### Changed

- **The ticket thread lies on the canvas**, so its cards read as cards; the
  composer is no longer a bar docked at the bottom but the last card of the
  thread, behind the agent's own avatar, with its Reply / Internal note tabs at
  its head. The header spans the whole screen, which is what stopped the subject
  being truncated.
- **The properties panel becomes three cards** — status and priority as pills,
  each SLA with its verdict, its bar and its instants, then the requester and
  the editable properties. Status is editable there at last.
- **The attachment control is the paperclip**, not the browser's native file
  widget: a browser draws that one in its own language, not the workspace's.
- French names the `open` status **En cours**, and *Waiting* joins the blue of
  *Open* — both are tickets in flight, and the amber read as a second warning
  next to a red SLA badge.

### Fixed

- **Contrast on filled buttons**: `--brand` was serving as both a text colour
  and a button fill, which made white on mint 2.3:1 in the dark theme. Tokens
  `--on-brand` and `--on-ok` split the roles across 47 elements; two header
  buttons that were reading their own background followed.
- The inbox no longer moves the keyboard cursor when the mouse crosses it, and
  the card hover class finally has a rule behind it.
- Delays past 48 h are said in days, and chart deltas are formatted in the
  reader's locale rather than a hardcoded `fr-FR`.
- Below `xl` the ticket screen's two columns no longer overlap.

## [0.2.0-alpha] - 2026-08-21

Control-plane-ready release — the groundwork an external control plane hooks
into. Self-hosted behaviour is unchanged: every entitlement mechanism stays
dormant without `OPENHELPDESK_EDITION=cloud`.

### Added

- **Agent invitations**: invitation emails (sent in the workspace language via
  its own email transport), a 7-day signed acceptance link, and the
  `/invite/[token]` page — password or OAuth — that finally activates invited
  agents (`invited → active` transition, verified end to end).
- **Workspace lifecycle**: `tenants.status` with a dedicated suspended screen
  (the Owner keeps access to Billing), a login notice, a read-only customer
  portal (submissions and widget refused), and outbound email cut while
  inbound keeps being ingested — a suspended workspace loses no tickets.
- **Denormalized entitlement columns** on `tenants` (`entitlements`,
  `planName`, `billing`, `trialEndsAt`) written by the control plane and read
  synchronously by the app, with self-hosted defaults as fallback.
- **Provided-address groundwork**: `MANAGED_MAIL_DOMAIN` unifies the provided
  address domain (four diverging literals, two TLDs), ingress webhooks compare
  secrets in constant time and skip tenant resolution, `SIGNUP_URL` turns the
  unknown-workspace 404 into a pointer to the instance's sign-up page.
- **Control-plane auth options** (inert when self-hosted):
  `AUTH_COOKIE_DOMAIN` for cross-subdomain sessions,
  `REQUIRE_EMAIL_VERIFICATION` with instance-level verification emails.

### Changed

- **Feature entitlements are now resolved per workspace**, provided by an
  optional control plane; the core is unlimited when self-hosted. Entitlements
  gain `maxStorageBytes`, and `ai` splits into `aiBasic`/`aiFull`. Seat limits
  follow the seat count the control plane reports — the hardcoded 10-seat
  display cap is gone, and ST-02/ST-11 now share one seat definition.
- **English is now the source language**, in the code as in the data: `en.ts`
  is the dictionary the other twenty-four are typed against, a new workspace
  starts in English, and the install defaults, the demo data set and the ticket
  type vocabulary come in English (existing tickets are carried over by a
  migration, and keep their displayed wording in every language).
- **The product describes no commercial offer.** Feature entitlements are
  resolved from the workspace row, never from a named tier: `CORE_ENTITLEMENTS`
  replaces the plan grid, `tenants.plan` becomes an opaque nullable identifier,
  and ST-11 renders only what a control plane wrote — no price, no plan
  comparison, no payment SDK.
- ~70 reserved subdomains (was 5); workspace deletion retention correctly
  documented as 60 days; Docker images keep `latest` for stable tags only.
- `apps/www` (marketing site stub) moved out of this repository.

## [0.1.0-alpha] - 2026-08-21

First public release — the self-hostable core (roadmap milestones 0–3).

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
  the full AGPL core with unlimited seats; `cloud` defers entitlement
  resolution to a control plane.
- **Commercially licensed features (`ee/`)**: agent SSO (SAML/SCIM) and
  customer-organization SSO administration screens, audit log with CSV export
  (ST-12→ST-14) — runtime SSO flows land in a later release.
- **i18n**: 25 languages (the 24 official EU languages + Norwegian), strict
  dictionary parity enforced at compile time.
- **Self-hosting**: single-command production stack (`docker compose up -d`)
  building web, worker, migrations, PostgreSQL 17, Redis and MinIO; row-level
  security applied per tenant.

[0.2.0-alpha]: https://github.com/open-helpdesk/open-helpdesk/releases/tag/v0.2.0-alpha
[0.1.0-alpha]: https://github.com/open-helpdesk/open-helpdesk/releases/tag/v0.1.0-alpha
