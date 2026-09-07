# Open HelpDesk

**The free, open-source alternative to Zendesk and Freshdesk.** A complete
customer support desk — ticketing, email, automations, SLA, CSAT, knowledge base
and customer portal — that runs on your own servers, with **unlimited agents**
and no per-seat bill.

Everything is scriptable: a **REST API** over the whole workspace, an **MCP
server** so an assistant can use it, an **importer** that brings a Zendesk
history over with its numbers and dates intact, and an **export** that hands it
all back. All of it AGPL, none of it a paid add-on.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![CI](https://github.com/open-helpdesk/open-helpdesk/actions/workflows/ci.yml/badge.svg)](https://github.com/open-helpdesk/open-helpdesk/actions/workflows/ci.yml)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange)](CHANGELOG.md)

![The ticket screen](.github/assets/ticket.png)

## Why Open HelpDesk

- **Unlimited agents.** Seats are not a licence lever here. Add the whole team,
  add the interns, add the people who answer three tickets a month.
- **Your data stays yours.** One `docker compose up`, your PostgreSQL, your
  storage, your email transport. Nothing leaves the machine you chose.
- **Not a toy.** The email channel is bidirectional, the SLA clock respects
  business hours, the automations run on real triggers, and the customer portal
  is a real portal with magic-link accounts and search deflection.
- **Open core, honest boundary.** Everything you need to run a support desk is
  AGPL-3.0. The commercial licence covers exactly three features — agent SSO,
  delegated customer-organization SSO, the advanced audit log — and they live in
  one directory you can read: [`ee/`](ee/).
- **25 languages** out of the box, with dictionary parity enforced at compile
  time — a missing translation fails the build, it does not ship as English.
- **You can leave.** The importer brings your history in; the export hands it
  back as NDJSON, whole. Both are in the core, because a lock-in you have to pay
  to escape is still a lock-in.

> **Alpha.** The product works end to end and is covered by a Playwright smoke
> suite, but APIs, schema and screens still move. Not production-ready yet — a
> very good time to try it and open issues.

## What it looks like

### The inbox — keyboard-first, and it tells you what needs you

Saved views down the left, and every row says the same three things in the same
place: the priority when it is High or Urgent, the SLA countdown, the status.
`j`/`k` to move, `↵` to open, `x` to select.

![The agent inbox](.github/assets/inbox.png)

### Automations — "when X, then Y", and a dry run before you commit

Conditions, actions in order, and a **Test on an existing ticket** panel that
simulates the rule against real data without changing anything.

![The rule editor](.github/assets/automations.png)

### SLA — targets per priority, on working hours

Ordered policies, the first match wins. Targets per priority for the first
reply, the following replies and the resolution — counted against the calendar
you define, not against wall-clock time.

![SLA policies](.github/assets/sla.png)

### Reports — the numbers a support lead actually asks for

Volumes, median first reply, median resolution, SLA compliance, CSAT, breakdown
by channel, and a volume heat map by hour and weekday. CSV export included.

![Reports](.github/assets/reports.png)

### The customer portal — a real help centre, not a form

Public articles with search, an embeddable widget, magic-link accounts so a
customer can follow their own requests, and article voting.

![The help centre](.github/assets/portal.png)

### The API — the whole workspace, scriptable

Fifty-six operations, keys scoped in **Settings → API & webhooks**, and an
OpenAPI 3.1 document every instance serves at `/api/v1/openapi.json` — so the
description you read is the one that instance implements.

```bash
curl https://acme.example.com/api/v1/tickets?status=open,new \
  -H "Authorization: Bearer $OHD_TOKEN"
```

```json
{
  "data": [
    {
      "number": 4821,
      "subject": "Cannot export invoices as PDF",
      "status": "open",
      "priority": "high",
      "requester": { "email": "julien.lambert@nordfil.fr", "name": "Julien Lambert" }
    }
  ],
  "next_cursor": "4788"
}
```

Collections are keyset-paginated: keep passing `cursor` until `next_cursor` is
null. Offsets would silently skip rows while your agents keep working.

Writing goes through the same path the product uses — creating a ticket over the
API runs the same rules, the same SLA policies and the same webhooks as an email
arriving at your support address. There is no quiet back door.

### An MCP server — let an assistant do the reading

```json
{
  "mcpServers": {
    "open-helpdesk": {
      "command": "pnpm",
      "args": ["--filter", "@openhelpdesk/mcp", "run", "start"],
      "env": {
        "OHD_BASE_URL": "https://acme.example.com",
        "OHD_API_KEY": "ohd_live_…"
      }
    }
  }
}
```

Nine tools: search tickets, read a thread with its internal notes, search the
knowledge base, find a contact, list the workspace, and — when asked — create,
reply or update. It calls the REST API rather than the database, so it inherits
the key's scopes, its rate limit and its workspace isolation.

Give it a read-only key unless you want an assistant writing to your helpdesk.
Replies default to an **internal note**: drafting is the common case, and
sending to a customer should be the sentence you typed, not the default you
forgot.

### Coming from Zendesk — with your numbers and your dates

**Settings → Import** takes a Zendesk export. It writes to the tables directly,
which is the only way to keep ticket #48210 as #48210, keep the day each
conversation actually happened, and keep a customer's reply attributed to the
customer.

It also does **not** run the rules engine on the import. Bringing thirty
thousand closed tickets in through the API would send thirty thousand
acknowledgement emails to real people and start as many SLA clocks.

Rehearse first — a dry run reads everything, writes nothing, and reports exactly
what the real run would do, including what cannot come across. Runs are
idempotent, so one that dies halfway is relaunched, not restarted.

Leaving is the same gesture in reverse: the export hands back the whole history
as NDJSON — tickets, conversations, internal notes, contacts, organizations —
readable by anything.

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
- **REST API** — 56 operations over tickets, contacts, organizations, the
  knowledge base and the workspace's configuration; cursor pagination, scoped
  API keys, signed outbound webhooks, and an OpenAPI 3.1 document served by the
  instance itself
- **Mobile-ready** — an agent signs in on a device (password or SSO) and gets a
  token bound to that phone, revocable on its own, with `/me`, full-text
  `/search`, a notification feed and per-agent unread state behind it; push
  notifications go out through APNs and FCM (assignment, customer reply, SLA),
  carrying a localisation key so the app writes the sentence in its own
  language
- **Customer API** — customers sign in by emailed link and read, submit and
  answer their own requests under `/api/v1/portal`; a namespace of its own, so
  internal notes and other people's tickets are out of reach by routing rather
  than by filtering. Files travel with the message that describes them:
  `multipart/form-data` on both sides of the desk
- **MCP server** — nine tools that let an AI assistant search, read and answer
  through the API, with the same key, the same scopes and the same limits
- **Migration & portability** — import a Zendesk history keeping its ticket
  numbers, dates and authors; export everything as NDJSON at any time
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
  reports, the REST API, the MCP server, the Zendesk importer and the export,
  with unlimited seats. None of those is a paid add-on, and none is reserved for
  the hosted version.
- **`ee/` — commercial licence.** Agent SSO (SAML/SCIM), delegated
  customer-organization SSO and the advanced audit log. The source is visible
  and free to use in development and testing, but production use requires a
  commercial agreement — see [`ee/LICENSE`](ee/LICENSE).

## Documentation

- **API reference** — every instance serves its own OpenAPI 3.1 document at
  `/api/v1/openapi.json`, generated from [`packages/openapi`](packages/openapi).
  Point any OpenAPI viewer at it, or import it into Postman. A hosted developer
  portal is being prepared; this README will link it when it exists rather than
  before.
- **Development setup** — [CONTRIBUTING.md](CONTRIBUTING.md).
- **Installation** — the diagnostics card in **Settings → General** tells you
  what is still unconfigured, probe by probe.
- **The MCP server** — [`packages/mcp`](packages/mcp/README.md).
- **Import and export** — [`packages/import`](packages/import/README.md) and
  [`packages/export`](packages/export/README.md), including what a migration
  keeps, transforms and loses.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
