# @openhelpdesk/export

Takes a workspace's history out again — the counterpart of
[`@openhelpdesk/import`](../import/README.md).

It exists so that "you are never locked in" is true on the hosted version too,
and not only for people who self-host and can run `pg_dump`.

## Format

NDJSON: one JSON object per line, first line a manifest.

```json
{"type":"manifest","version":1,"product":"open-helpdesk","workspace":{"slug":"acme"},…}
{"type":"organization","id":"…","name":"Nordfil SAS","email_domains":["nordfil.fr"],…}
{"type":"contact","id":"…","email":"julien@nordfil.fr","organization_ids":["…"],…}
{"type":"agent","id":"…","email":"marie@acme.fr","role":"admin",…}
{"type":"ticket","number":4821,"subject":"…","status":"resolved","created_at":"…",…}
{"type":"message","ticket_number":4821,"kind":"public_reply","author_type":"contact",…}
{"type":"attachment","ticket_number":4821,"filename":"screenshot.png","url":"/api/attachments/…"}
```

Line-oriented because an export can be enormous and is read by a machine: it
streams out of Postgres and into another product without either side holding the
whole history in memory.

**Deliberately not a database dump.** It carries the business record — tickets,
conversations, people, organisations — not our schema, our internal migration
history or anything a reader would have to understand us to interpret.

## What is in it, and what is not

| In | Not in |
|---|---|
| Tickets with their numbers, dates, tags, custom fields | Attachment *bytes* — files are listed with a download URL |
| Whole conversations, including internal notes | Views, macros, SLA policies and automation rules (configuration, not record) |
| Contacts, organisations and their memberships | Knowledge-base articles |
| Agents, so "assigned to" still resolves | Anything belonging to another workspace |

The manifest says the same thing in the file itself, so whoever opens it a year
from now does not have to guess.

## Running one

From the product: **Settings → Import**, "Take your data out". Owner and Admin
only — the export is the entire customer record, internal notes included.

From a shell:

```bash
pnpm --silent --filter @openhelpdesk/export run export -- --tenant acme > acme.ndjson
pnpm --silent --filter @openhelpdesk/export run export -- --tenant acme --counts
```

**`--silent` matters.** Without it pnpm prints its own banner on stdout, and those
lines land in the middle of the export — a file that looks fine until something
tries to parse it.

`--counts` prints the totals to stderr and writes nothing, so it stays out of a
redirected export.

## Notes

- Reads in pages of 500 rows with a keyset cursor: memory stays flat whatever
  the workspace's size.
- The HTTP route streams with back-pressure and releases its cursor if the
  browser cancels the download.
- Every export writes an audit event before the first byte leaves — an export
  that fails halfway must still leave a trace that someone asked for everything.
- The CLI closes the database pool instead of calling `process.exit()`. When
  stdout is a pipe, Node writes to it asynchronously and `process.exit()` throws
  away what is still buffered: the first version of this command produced a
  **zero-byte file** while reporting success.
