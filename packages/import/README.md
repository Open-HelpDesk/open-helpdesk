# @openhelpdesk/import

Brings a support history over from another product — Zendesk today.

## Why this is not a loop over the public API

The REST API creates *new requests*. An import resumes an *old history*, and the
difference is not cosmetic. Creating 30 000 tickets through `POST /api/v1/tickets`
would:

- renumber every ticket, so the reference a customer quotes in an email no longer
  resolves;
- stamp a decade of history with today's date;
- record every customer reply as an agent reply, because that endpoint has no
  other author type;
- and call `onTicketCreated()` once per ticket — which runs the rules, sends the
  acknowledgement emails **to real people**, and starts an SLA clock that
  immediately breaches.

This package writes to the tables directly, which is what makes it possible to
keep numbers, keep dates, attribute each message to whoever wrote it, and send
nothing to anyone.

## Shape

```
zendesk.ts      Zendesk export → SourceExport (defensive parsing, reports what it cannot map)
write.ts        SourceExport → rows (batched, idempotent, no side effects)
attachments.ts  fetches the files the export only names, stores them via @openhelpdesk/storage
run.ts          bookkeeping in app.import_runs (progress, anomalies, stale-run recovery)
cli.ts          command-line entry point
```

Adding another product means writing one adapter to `SourceExport`. The writer —
the expensive, dangerous part — stays as it is.

## Running one

Rehearse first. It reads everything, writes nothing, and prints the report the
real run would print:

```bash
pnpm --filter @openhelpdesk/import run import -- \
  --tenant acme --file export.json --dry-run
```

Then, for real:

```bash
pnpm --filter @openhelpdesk/import run import -- \
  --tenant acme --file export.json --auth "Bearer <zendesk token>"
```

`--auth` is what lets the attachments come across. A Zendesk export lists files by
URL, not by content, so without credentials the run counts them and reports them as
skipped — never silently forgotten. `ZENDESK_AUTHORIZATION` works too.

**Fetch the files while the source account is still open.** Tickets can be
re-imported next month; the URLs stop working the day the account closes.

`export.json` is a Zendesk export carrying `tickets`, `users` and
`organizations`, and optionally `comments` keyed by ticket id. Both bare arrays
and the `{ tickets: [...] }` envelopes the API returns are accepted, because
both are what people have on disk.

## Idempotent, and therefore resumable

Every imported row carries `(import_source, imported_id)` under a partial unique
index. A run that dies halfway can simply be relaunched: rows already written are
recognised and skipped, not duplicated. Re-running a finished import is a no-op.

## What it deliberately loses

Reported per row in `import_runs.anomalies`, and told to the customer up front
rather than discovered afterwards:

| Source | Outcome |
|---|---|
| Custom statuses | Fall back to `open` — arriving in the wrong column beats not arriving |
| Unknown priority | Falls back to `normal` |
| Phone, chat and social channels | Recorded as `email`: our channel list has no value for them, and inventing one would skew reports for years |
| End-user without an email | Not imported — `contacts.email` is `NOT NULL` and is the only unique key |
| Ticket whose requester is gone | Not imported — `tickets.requester_id` is `NOT NULL` |
| Attachment over 10 MB | Refused, and named in the report — half a PDF is worse than a missing one |
| Attachment behind a dead URL | Reported as unreachable; the rest of the run continues |
| Comment with neither text nor files | Counted, nothing to write |
| Ticket number already taken | Imported on a fresh number, and the clash is reported |

`first_replied_at` is derived from the first non-internal message written by
someone who is not the requester, rather than taken from the source: Zendesk does
not publish it on the ticket, and inventing it from the ticket's update time
would falsify the one metric support teams are judged on.

## Before a big run

- `import_runs.counts` is saved about once a second, so a long run visibly moves.
- A process killed mid-run leaves a row stuck at `running`; the worker closes
  those at start-up (`reapStaleRuns`).
- Zendesk's incremental export API is capped at 10 requests per minute, so
  extracting a large history is measured in hours. Extract first, import after.
- Attachments are fetched four at a time with a 30-second ceiling per file: brisk
  without getting the migration throttled by the source.
