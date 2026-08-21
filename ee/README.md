# /ee — Édition Entreprise

Ce dossier contient les fonctionnalités sous **licence commerciale** (modèle
open-core, voir la section « Editions & licensing » du README) :

- SSO SAML/SCIM des agents (ST-13) — `ee/web/src/settings/agent-sso`
- SSO délégué des organisations clientes (ST-14, PT-08) — `ee/web/src/settings/customer-sso`, `ee/web/src/portal`
- Audit log avancé (ST-12) — `ee/web/src/settings/audit`
- À venir : domaines personnalisés, multi-marques, IA (triage, suggestions, résumé de fil)

Le reste du dépôt est sous AGPL-3.0. Les packages de ce dossier ne sont **pas** couverts
par cette licence — voir [`ee/LICENSE`](LICENSE) : usage libre en développement et en
test, la production requiert un accord commercial. Convention des packages :
`"license": "SEE LICENSE IN ../LICENSE"`.

Les écrans restent servis par `apps/web` via des coquilles d'export minces
(`export { default } from "@openhelpdesk/ee-web/…"`) : les URLs ne changent pas, la
frontière de licence si.
