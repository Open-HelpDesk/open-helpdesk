# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Signing in on a device.** `POST /api/v1/auth/login` exchanges an agent's
  credentials for a token bound to one phone, revocable on its own and expiring
  after 90 days of silence. The workspace comes from the host the call lands on,
  never from the body. An API key could not have played this part: it belongs to
  the workspace rather than to a person, it is shared with every integration
  that holds it, and a lost phone would mean rotating what a CRM also uses.
- **Single sign-on from an app.** `GET /api/v1/auth/authorize` ends the browser
  leg of an SSO sign-in on the app's own URL scheme, carrying a one-time code
  that `POST /api/v1/auth/exchange` trades for a device session. PKCE S256 is
  required and the destination scheme is set by the instance — a custom scheme
  is not exclusive to one installed app, and an endpoint that mints a
  credential and sends it wherever a query string says is an open door. The
  login page honours a `next` parameter for the same flow, restricted to
  workspace screens and that one handover route.
- **`POST /api/v1/auth/logout`** revokes the calling device's session and its
  push registrations, and nothing else: signing out of a phone leaves the
  browser and the other phone signed in.
- **`GET /api/v1/me`** — the agent behind the session, their role and their
  teams. Without it, "my tickets" had no way to know whose.
- **Push registrations.** `POST /api/v1/devices` records an APNs or FCM token
  for the signed-in agent (upsert on the token, since the operating system
  rotates it), `DELETE /api/v1/devices/{id}` revokes one.
- **`GET /api/v1/search`** — one query across tickets, contacts, organizations
  and articles, the same one the ⌘K palette runs. Unpublished articles stay
  invisible to a workspace API key, which has no role to justify seeing them.
- **An API for the customer app.** `/api/v1/portal/…` lets a customer sign in on
  a phone and read, submit and answer their own requests. Sign-in is the
  portal's emailed link — customers have no password — with the same PKCE
  handover as the agents' SSO: `POST /portal/auth/request-link` sends it,
  `/portal/auth/handoff` catches the browser and hands the app a one-time code,
  `POST /portal/auth/exchange` turns it into a session. Then `/portal/me`,
  `/portal/requests` (`scope=mine` or the company's, where sharing is on),
  `/portal/requests/{number}`, a reply endpoint, and push registrations.
  It is a namespace of its own rather than the agent routes under a narrower
  credential: what a customer is owed is a narrow answer, and routing guarantees
  that better than a filter somebody has to remember. Internal notes are
  excluded by the portal's own query, the one the web portal has always used —
  the two surfaces now share every write (`lib/portal-write.ts`), so a request
  filed from a phone runs the same rules, SLA policies and notifications as one
  filed in a browser.
- **Attachment downloads accept a customer app session**, so the files in a
  thread are reachable from a client that has no cookie jar.
- **Notification feeds over the API.** `GET /api/v1/notifications` serves the
  agent feed the web topbar already draws — SLA targets missed or getting
  close, customer replies, a colleague's note — and
  `POST /api/v1/notifications/read` moves the waterline both surfaces share.
  `/api/v1/portal/notifications` is its customer counterpart: somebody
  answered, a request was resolved. Both are derived from tickets and messages
  rather than stored, so "read" is a waterline and not a per-item flag; the web
  shell and the app now build their wording from the same events instead of the
  shell owning the only copy. There is deliberately no "assigned to you" line:
  an assignment leaves no date behind to sort or to call new, which makes it a
  push notification rather than a feed entry.
- **Files travel with the message that describes them.** `POST /tickets`,
  `POST /tickets/{number}/messages`, `POST /portal/requests` and
  `POST /portal/requests/{number}/messages` now accept
  `multipart/form-data` alongside JSON, so the four compose screens can attach
  a screenshot in the gesture that sends the text — a two-step "post, then
  upload" leaves a message promising a file that a dropped connection never
  delivers. The response names what was stored, with a download URL each.
  Oversized requests are refused with 413 `request_too_large` and the real
  ceiling, rather than the "malformed multipart" the runtime answers when a
  body is too big to parse.
- **`storeAttachments` returns each row's id**, so a caller that has just
  stored a file can name it back without looking it up by storage key.
- **Push notifications actually leave.** Registering a device was only half the
  feature; `@openhelpdesk/push` is the other half. Four things wake an agent's
  phone — a ticket assigned to them, a customer reply on a ticket they own, an
  SLA target getting close, one that was missed — and one wakes a customer's: an
  agent answered their request. Dispatched from the funnels the outbound
  webhooks already use (the rules engine's `onContactMessage`, the SLA scanner)
  plus every place an assignee changes, so no channel is forgotten; queued on
  `push-dispatch` when Redis is there and sent inline when it is not, exactly
  like a webhook. It never throws: a notification is a side effect of somebody
  else's action, and a dead gateway must not fail the reply that triggered it.
  - Who gets woken is derived from the message rather than claimed by the
    caller, which is what lets one function serve every funnel — including the
    public API, where an agent's public reply travels the same path an inbound
    email does. An internal note wakes nobody outside the workspace, and nobody
    is told about what they just did themselves.
  - The text is not built server-side: a workspace runs in one of 25 languages
    and this package has no dictionaries, so a notification carries a
    localisation key, its arguments and an English fallback, and the app writes
    the sentence. Events with no known actor use their own key rather than the
    same one with a hole where a name should be.
  - APNs (HTTP/2, ES256) and FCM (HTTP v1, service account) with no new
    dependency, credentials instance-wide like the mail fallbacks — and a
    `console` provider that logs what would be sent, so a local install can
    check the fan-out before an Apple key exists. A token a gateway calls dead
    revokes its registration instead of being retried forever.
  - The payload carries a readable sentence as well as the localisation key.
    iOS renders `loc-key` against the app bundle's own strings and displays the
    key verbatim when it is missing, so a notification that carried only a key
    would have read "push.ticketReply" to a real person until the app shipped
    those strings. `mutable-content` is set, which is what lets an app rewrite
    the text in the reader's language once there is a translation to use.
- **`PATCH /api/v1/me`** sets `available` — whether this agent is taking work.
  Round-robin only ever picks an available agent, so the switch the app draws
  (MA-07) had to be able to move something: it was readable over the API and
  settable nowhere. It is the only writable field, because an endpoint named
  `/me` that could change a role would be a privilege escalation with a
  friendly name.
- **Tickets carry their SLA clock.** `first_reply_due_at`, `next_reply_due_at`,
  `resolve_due_at`, `first_replied_at` and the `warned_at` / `breached_at` the
  workspace stamps itself now travel with every ticket, as instants rather than
  as a remaining duration — a client that has been asleep would otherwise draw
  an hour-old countdown as current. Found by building the inbox it is for: a row
  that says "Open" without saying "42 min left" is missing the half an agent
  triages on, and the API had no way to say it.
- **Per-agent unread state.** Tickets carry `unread` for an agent session — is
  there a message I have not seen, written by somebody other than me, since I
  last marked this ticket read — and `POST /tickets/{number}/read` clears it for
  that agent alone. It is a comparison against `app.ticket_reads` rather than a
  stored flag: a boolean would have meant writing to every assignee's row on
  every inbound message, on the hot path of the mail pipeline, and getting it
  wrong the first time an import backfilled a year of conversations. Marking is
  an explicit call rather than a side effect of `GET /tickets/{number}`: a read
  that happens by fetching cannot be retried, prefetched or cached, and a client
  fetches a ticket for reasons other than a human reading it. The field is
  absent — not false — for a workspace API key, which has no "I" to answer for.
- **Saved views carry their `count`.** The badge next to a view was otherwise
  only reachable by rebuilding its conditions client-side and paging through
  the tickets they match — a filter language reimplemented in every client. An
  agent session also sees the views the web workspace shows them, private ones
  of colleagues excluded.

## [0.2.3-alpha] - 2026-09-07

The integration release: a REST API that reaches the whole workspace, an MCP
server so an assistant can use it, a generated reference, and a way in and out
of the product for the data itself.

### Added

- **A complete REST API.** It covered tickets and contacts; it now reaches
  organizations, agents, teams, macros, SLA policies, views, custom fields,
  tags, satisfaction responses, the knowledge base and the files on a ticket —
  **32 operations across 21 routes**. Every collection is keyset-paginated
  (`{ data, next_cursor }`) rather than offset-paginated, because an integration
  walking two hundred thousand tickets while agents keep working would otherwise
  skip rows and repeat others without saying so. Ticket listing filters by
  status, priority, assignee, organization, requester, tag and `updated_since`,
  which is what an incremental sync needs. Keys are rate-limited to 600 requests
  a minute, and answer `429` with `Retry-After` rather than failing obscurely.
- **An OpenAPI 3.1 document** built from one module and served by every instance
  at `/api/v1/openapi.json`, so what you fetch is what that instance implements.
  The same module generates the reference and the Postman collection — the
  documentation cannot describe a route the product does not have.
- **An MCP server** (`packages/mcp`): nine tools that let an assistant search
  tickets, read a thread with its internal notes, look up the knowledge base,
  find a contact, and — when asked — reply. It talks to the public API rather
  than the database, so it inherits the key's scopes, its rate limit and its
  workspace isolation, and cannot reach round the rules engine. Replies default
  to an internal note; the two tools that reach a customer say so.
- **Import from Zendesk** (`packages/import`), with a screen in
  **Settings → Import**. It writes to the tables directly, which is the only way
  to keep the original ticket numbers, the real dates, and each message
  attributed to whoever actually wrote it. Above all it does **not** run the
  rules engine on an import: bringing thirty thousand closed tickets in through
  the API would have sent thirty thousand acknowledgement emails to real people
  and started as many SLA clocks. Runs are idempotent by
  `(import_source, imported_id)`, so a run that dies halfway is relaunched
  rather than restarted, and a rehearsal reports exactly what a real run would
  do without writing anything.
- **Export** (`packages/export`): the whole history as NDJSON — tickets with
  their numbers and dates, conversations, internal notes, contacts,
  organizations, agents, and the index of attachments. Streamed with
  back-pressure, so a workspace of any size downloads without the server holding
  it in memory. Owner and Admin only, and every export writes an audit event
  before the first byte leaves.
- **Attachments now travel both ways.** A new `packages/storage` makes
  attachment writing reachable from the mail pipeline and from an import, not
  only from the web app.

### Fixed

- **Files attached to an inbound email were parsed, then thrown away.** The IMAP
  poller read them and dropped them, silently, because the only code that could
  store an attachment lived inside the web app. Screenshots customers sent had
  been disappearing for as long as the channel has existed.
- **The "Import CSV" button on the contacts list did nothing** — no handler, no
  route, no importer behind it. It now leads to the screen that does the work.
- **The knowledge base's empty state promised importing articles** from a
  Zendesk or Notion export. That import does not exist and is not planned; the
  sentence is now one the product can keep.
- **Checking whether a workspace name was free could fail** on a bundled
  deployment: the check loaded the mail package, which loaded the storage
  package, which built an S3 client at module load. Clients are built on first
  use now, and the mail pipeline only loads storage when there is a file.

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
