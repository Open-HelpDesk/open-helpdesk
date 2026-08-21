# Contributing to Open HelpDesk

Thanks for your interest! Open HelpDesk is an open-core helpdesk: the core is
AGPL-3.0, the `ee/` directory is commercially licensed (see `ee/LICENSE`).

## Development setup

```bash
corepack enable                 # pnpm is pinned in package.json
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d   # postgres, redis, minio, mailpit
pnpm db:generate && pnpm db:migrate
pnpm --filter @openhelpdesk/db db:rls
pnpm db:seed && pnpm db:seed:auth                   # demo workspace "Acme"
pnpm dev
```

Then open http://acme.localhost:3000 — demo login `marie.dupont@acme.example` /
`demo-openhelpdesk`. Development emails are captured by Mailpit
(http://localhost:8026).

## Before you open a pull request

- `pnpm typecheck` must pass — this includes the strict parity check across the
  25 translation dictionaries (`apps/web/src/i18n/`, French is the source).
- `pnpm build` must pass.
- For user-facing changes, run the end-to-end suite:
  `pnpm --filter @openhelpdesk/smoke smoke` (see `packages/smoke/README.md`
  for the prerequisites).
- Any user-visible string must live in the i18n dictionaries — hardcoded text
  fails the `i18n-source-francais` guard.

## Scope of contributions

- **Core (everything outside `ee/`)**: contributions welcome — bug fixes,
  features from the roadmap (`specs/01-produit-et-architecture.md` § 9),
  translations, documentation.
- **`ee/`**: commercially licensed; contributions are by invitation. By
  submitting changes to `ee/`, you agree they are assigned to the copyright
  holder (see `ee/LICENSE`).

Note: product specifications and design notes (`specs/`, `design-notes/`) are
currently written in French.

## Developer Certificate of Origin

Contributions are accepted under the [DCO](https://developercertificate.org/).
Sign your commits with `git commit -s` (adds a `Signed-off-by` line) to certify
that you have the right to submit the code under the project license.

## Conventions

- One topic per pull request, with a clear description of the user-visible
  behaviour it changes.
- Match the surrounding code: server components + server actions, guards
  duplicated on page and action, comments in the language of the file you edit.
