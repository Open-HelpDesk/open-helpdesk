# End-to-end smoke test

Replays the product's journeys against an instance that really runs — its
database, its SMTP, its sessions. It does not replace unit tests: it catches the
class of defect that costs the most here, the one no type system sees.

The eight defects that motivated this suite, all real, all invisible at compile
time:

| Defect | What the test now checks |
|---|---|
| A setting that is saved but never read (`portalEnabled`, `kbPublished`, `tenants.locale`) | Flipping the switch off really does close the portal |
| A redirect that loses the tenant subdomain | The magic link does open a session |
| A role guard that only exists in the interface | An agent is refused by the direct URL and by the API |
| A missing translation, or a format lost along the way | German shows up, and "4.182" keeps its separator |
| A plural form missing from a language that has four of them | Polish picks `few` or `many` when it must |
| A control that is drawn but inert | The logo field is a real `input[type=file]`, and the dropped file is displayed |
| Two statuses translated by the same word | No duplicate label within a set, across 24 languages |
| A label hardcoded in a component | No accented text outside the dictionary |

## Before you run

```bash
# 1. The services
docker compose -f docker/docker-compose.yml up -d      # Postgres, Mailpit, MinIO

# 2. The database
pnpm db:migrate && pnpm db:seed && pnpm db:seed:auth

# 3. The application — BASE_DOMAIN MUST match the port
pnpm --filter @openhelpdesk/web build
BASE_DOMAIN=localhost:3006 pnpm --filter @openhelpdesk/web exec next start --port 3006
```

Without the `BASE_DOMAIN` ↔ port match, the middleware resolves no tenant at all
and **everything answers 404**: the first trap of the local environment.

## Run

```bash
pnpm --filter @openhelpdesk/smoke smoke          # the suite
pnpm --filter @openhelpdesk/smoke smoke:ui       # interactive mode
SMOKE_HEADED=1 pnpm --filter @openhelpdesk/smoke smoke   # visible browser
```

Variables: `SMOKE_PORT` (3006), `SMOKE_BASE_URL`, `SMOKE_TENANT` (acme),
`SMOKE_MAILPIT_URL` (http://localhost:8026).

The browser is the Chrome installed on the machine (`channel: "chrome"`): no
binary to download.

## What is covered

| File | Journey |
|---|---|
| `request-lifecycle` | Submitting a request → magic link → agent reply → read by the customer |
| `portal-public` | Home, typeahead, category, article, vote, search, empty state |
| `agent-workflow` | Sign-in, inbox, views, ticket, priority, ⌘K palette, sign-out |
| `kb-permissions` | Read-only Agent vs writing Admin, on the screens **and** the API |
| `settings-toggles` | The ST-09 switches close the portal and the knowledge base |
| `branding` | Uploading the logo and the favicon, display in both shells, isolation between tenants |
| `i18n` | Switching to German/Polish/French, thousands separators, plural selection, untranslated tenant content |
| `i18n-source` | Plural tables and vocabulary sets of the 24 dictionaries — **no browser** |
| `i18n-hardcoded` | No translatable text lives outside `i18n/` — **no browser** |

## The static checks

`i18n-source` starts no browser at all: it reads the 24 dictionaries as text.
Two families of defects are covered there.

**The plural tables.** It compares the forms provided against those
`Intl.PluralRules` can select in the language.

It exists because the type system cannot replace it. `Message` only requires an
`other` form — every other one is optional, since no two languages use the same
set. A Polish dictionary stripped of its `many` form therefore compiles without
a word, and shows a wrong sentence as soon as a counter reaches 5.

Two categories are deliberately out of scope, and the test says so in its own
code: the `many` of Czech, Slovak and Lithuanian, which only concerns decimal
numbers — no `{count}` in the product ever receives one; and the `many` of
French, Spanish, Italian and Portuguese, which triggers at exactly one million.

**The vocabulary sets** — statuses, priorities, urgencies, channels. These
labels live in lookup tables, away from the screens that display them, and the
risk specific to a set is collision: two statuses translated by the same word
give a filter with two identical entries, without anything crashing. French
cannot reveal that defect, since French is the source.

The static check does not prove that the product *selects* the right form,
though: that is the job of the Polish test in `i18n`, which reads the number
displayed by the portal home, derives the category with `Intl.PluralRules` and
requires the matching sentence. Polish is chosen because no integer selects
`other` there: a broken selection cannot hide behind the fallback.

## Writing rules

Three traps met while writing this suite, worth knowing before adding a test:

1. **Never wait for a duration**, wait for a signal from the product: a URL, an
   element, an HTTP status. For anything that takes time, `expect(...).toPass()`.
2. **`getByText` also matches the content of a `<textarea>`** — React renders the
   value there as a text node. An assertion on the text you just typed turns
   green without anything having been sent. Check the result where it counts,
   never the state of the input field.
3. **The tenant is shared.** Whatever a test changes in the settings, it puts
   back — `try/finally` or `afterEach`. That is why the worker count is 1.

## Known limitations

- The suite **writes** to the development database: it leaves behind the requests
  it submits and an orphan image file in MinIO. Run it against a throwaway
  database, not against data you care about.
- Better Auth caps sign-in at three attempts per ten seconds per IP.
  `signInAgent` retries, which is enough — but two concurrent runs of the suite
  will get in each other's way.
- `i18n` and `settings-toggles` flip settings of the shared tenant. They put them
  back in `afterEach`, but a run interrupted midway can leave the workspace in
  another language, or with its portal closed.
