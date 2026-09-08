# /ee — commercially licensed features

This directory holds the features under a **commercial licence** (open-core
model, see the "Licensing" section of the README):

- Agent SAML/SCIM SSO (ST-13) — `ee/web/src/settings/agent-sso`
- Delegated SSO for customer organizations (ST-14, PT-08) — `ee/web/src/settings/customer-sso`, `ee/web/src/portal`
- Advanced audit log (ST-12) — `ee/web/src/settings/audit`
- The assistant (spec 18) — `ee/ai`: the provider abstraction, redaction,
  per-workspace governance and the call log. Two ways to get it, both licensed
  here: inference hosted by the operator, or **bring your own LLM** — any
  OpenAI-compatible endpoint, including a self-hosted one.
- Planned: custom domains, multi-brand

The rest of the repository is under AGPL-3.0. The packages in this directory are
**not** covered by that licence — see [`ee/LICENSE`](LICENSE): free to use in
development and testing, production requires a commercial agreement. Package
convention: `"license": "SEE LICENSE IN ../LICENSE"`.

The screens are still served by `apps/web` through thin re-export shells
(`export { default } from "@openhelpdesk/ee-web/…"`): the URLs do not change,
the licence boundary does.
