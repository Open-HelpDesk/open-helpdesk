## What does this change?

<!-- One topic per PR. Describe the user-visible behaviour it changes. -->

## Checklist

- [ ] `pnpm typecheck` passes (includes the 25-dictionary i18n parity)
- [ ] `pnpm build` passes
- [ ] User-visible strings live in `apps/web/src/i18n/dictionaries/` (French first)
- [ ] For user-facing changes: smoke suite run (`pnpm --filter @openhelpdesk/smoke smoke`)
- [ ] Commits are signed off (DCO, `git commit -s`)
