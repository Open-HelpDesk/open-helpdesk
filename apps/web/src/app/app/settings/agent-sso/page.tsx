import { requireAgent } from "@/lib/session";
import { db, teams } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { entitlementsFor } from "@/lib/entitlements";
import {
  Card,
  Field,
  LockedScreen,
  PageHeader,
  PageShell,
  PlanProBadge,
  SaveBar,
  Select,
  StatusPill,
  TextInput,
  Toggle,
} from "@/components/settings-page";
import { CopyButton } from "@/components/settings-overlays";
import { EnforcementRadios, ScimGroupsField, ScimTokenForm } from "./client";
import { regenerateScimToken, saveSamlConfig, saveScimGroups, type AgentSsoConfig } from "./actions";

const IDPS: { value: string; label: string }[] = [
  { value: "okta", label: "Okta" },
  { value: "entra", label: "Microsoft Entra" },
  { value: "google", label: "Google" },
  { value: "onelogin", label: "OneLogin" },
  { value: "other", label: "Autre" },
];

const TEST_STEPS = [
  "Redirection HTTP 302",
  "Signature RSA-SHA256",
  "Audience",
  "Attributs requis",
  "Résolution du compte",
];

/**
 * ST-13 — SSO des agents (1000 px, EE). Verrouillé hors plan Pro. Onglet SAML 2.0 :
 * configuration persistée dans tenants.agentSsoConfig, valeurs SP réelles (slug),
 * application 3 radios, test à l'état idle. Onglet SCIM : URL réelle, jeton haché
 * régénérable, correspondance des groupes, journal vide honnête.
 */
export default async function AgentSsoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const ent = entitlementsFor(tenant.plan);
  const { tab, saved } = await searchParams;
  const activeTab = tab === "scim" ? "scim" : "saml";

  const header = (tabs?: { label: string; href: string; active: boolean }[]) => (
    <PageHeader
      code="ST-13"
      title="SSO des agents"
      subtitle="Authentification unique SAML 2.0 et provisionnement SCIM pour votre équipe support."
      tabs={tabs}
    />
  );

  if (!ent.agentSso) {
    return (
      <PageShell maxWidth={1000}>
        {header()}
        <LockedScreen
          title="Le SSO des agents est réservé au plan Pro"
          text="Connectez votre fournisseur d'identité SAML 2.0, provisionnez vos agents en SCIM et imposez l'authentification unique à toute l'équipe."
          ghost={<GhostForm />}
        />
      </PageShell>
    );
  }

  const config = ((tenant.agentSsoConfig as AgentSsoConfig) ?? {}) as AgentSsoConfig;
  const saml = config.saml ?? {};
  const scim = config.scim ?? {};
  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tenantId, tenant.id))
    .orderBy(asc(teams.name));

  const host = `https://${tenant.slug}.open-helpdesk.com`;
  const spValues: [string, string][] = [
    ["URL ACS", `${host}/api/auth/saml/callback`],
    ["Entity ID", host],
    ["Métadonnées", `${host}/api/auth/saml/metadata`],
    ["NameID", "emailAddress"],
  ];
  const connected = Boolean(saml.enabled && saml.ssoUrl);

  const tabs = [
    { label: "SAML 2.0", href: "/app/settings/agent-sso", active: activeTab === "saml" },
    { label: "SCIM", href: "/app/settings/agent-sso?tab=scim", active: activeTab === "scim" },
  ];

  return (
    <PageShell maxWidth={1000}>
      {header(tabs)}

      {activeTab === "saml" ? (
        <form action={saveSamlConfig} className="flex flex-col" style={{ gap: 22 }}>
          <Card>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Toggle
                  name="enabled"
                  defaultChecked={saml.enabled === true}
                  label="Activer le SSO SAML 2.0"
                  hint="Les agents se connectent via votre fournisseur d'identité."
                />
              </div>
              <PlanProBadge />
              {connected && <StatusPill tone="ok">Connecté</StatusPill>}
            </div>
          </Card>

          <Card title="Fournisseur d'identité">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {IDPS.map((idp) => (
                  <label
                    key={idp.value}
                    className="cursor-pointer rounded-full border font-medium"
                    style={{ fontSize: 12.5, padding: "4px 12px", borderColor: "var(--line)", color: "var(--ink)" }}
                  >
                    <input
                      type="radio"
                      name="idp"
                      value={idp.value}
                      defaultChecked={(saml.idp ?? "other") === idp.value}
                      className="mr-1.5 align-middle"
                    />
                    {idp.label}
                  </label>
                ))}
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <Field label="Entity ID de l'IdP">
                  <TextInput
                    name="entityId"
                    defaultValue={saml.entityId ?? ""}
                    placeholder="https://idp.entreprise.fr/saml"
                    className="font-mono"
                  />
                </Field>
                <Field label="URL SSO">
                  <TextInput
                    name="ssoUrl"
                    defaultValue={saml.ssoUrl ?? ""}
                    placeholder="https://idp.entreprise.fr/sso/saml"
                    className="font-mono"
                  />
                </Field>
              </div>
              <Field label="Certificat X.509" hint="Alerte automatique 30 jours avant expiration.">
                <textarea
                  name="certificate"
                  rows={4}
                  defaultValue={saml.certificate ?? ""}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  className="rounded-md border px-2.5 py-1.5 font-mono text-xs"
                  style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
                />
              </Field>
            </div>
          </Card>

          <Card title="Valeurs côté Open HelpDesk (SP)">
            <div className="flex flex-col gap-2">
              {spValues.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                  style={{ borderColor: "var(--line-2)", background: "var(--sunk)" }}
                >
                  <span className="w-28 font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    {label}
                  </span>
                  <code className="min-w-0 flex-1 truncate font-mono" style={{ fontSize: 12, color: "var(--ink)" }}>
                    {value}
                  </code>
                  <CopyButton text={value} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Correspondance des attributs">
            <div className="flex flex-col gap-2">
              {(
                [
                  ["m_email", "Email", saml.mapping?.email ?? "user.email", "requis"],
                  ["m_firstName", "Prénom", saml.mapping?.firstName ?? "user.firstName", "optionnel"],
                  ["m_lastName", "Nom", saml.mapping?.lastName ?? "user.lastName", "optionnel"],
                  ["m_role", "Rôle", saml.mapping?.role ?? "user.groups", "optionnel"],
                  ["m_team", "Équipe", saml.mapping?.team ?? "user.department", "optionnel"],
                ] as const
              ).map(([name, label, value, req]) => (
                <div key={name} className="grid items-center gap-2" style={{ gridTemplateColumns: "110px 1fr 80px" }}>
                  <span className="font-medium" style={{ fontSize: 13, color: "var(--ink)" }}>
                    {label}
                  </span>
                  <TextInput name={name} defaultValue={value} className="font-mono" />
                  <span style={{ fontSize: 11.5, color: req === "requis" ? "var(--dang)" : "var(--ink-3)" }}>
                    {req}
                  </span>
                </div>
              ))}
              <Toggle
                name="rolesFromIdp"
                defaultChecked={saml.rolesFromIdp === true}
                label="Piloter les rôles depuis l'IdP"
                hint="Groupes ohd-admins et ohd-agents synchronisés à chaque connexion."
              />
            </div>
          </Card>

          <Card title="Application">
            <EnforcementRadios initial={saml.enforcement ?? "verified_domains"} />
            <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Durée de session">
                <Select name="sessionHours" defaultValue={String(saml.sessionHours ?? 8)}>
                  <option value="4">4 heures</option>
                  <option value="8">8 heures</option>
                  <option value="12">12 heures</option>
                  <option value="24">24 heures</option>
                </Select>
              </Field>
              <Field
                label="Compte de secours"
                hint="Toujours autorisé à se connecter par mot de passe."
              >
                <TextInput
                  name="backupEmail"
                  type="email"
                  defaultValue={saml.backupEmail ?? ""}
                  placeholder="admin@entreprise.fr"
                />
              </Field>
            </div>
          </Card>

          <Card title="Test de connexion">
            <div className="flex flex-col gap-1.5">
              {TEST_STEPS.map((s) => (
                <div key={s} className="flex items-center gap-2" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 8, height: 8, background: "var(--line)" }}
                  />
                  {s}
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled
              title="Disponible après enregistrement d'une configuration valide."
              className="mt-3 rounded-md border px-3 font-medium disabled:opacity-50"
              style={{
                height: 30,
                fontSize: 12.5,
                borderColor: "var(--line)",
                background: "var(--panel)",
                color: "var(--ink)",
              }}
            >
              Lancer le test
            </button>
          </Card>

          <SaveBar saved={saved === "1"} cancelHref="/app/settings/agent-sso" />
        </form>
      ) : (
        <>
          <Card title="Provisionnement SCIM">
            <div className="flex flex-col gap-3">
              <div
                className="flex items-center gap-2 rounded-md border px-3 py-2"
                style={{ borderColor: "var(--line-2)", background: "var(--sunk)" }}
              >
                <span className="w-24 font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  URL SCIM
                </span>
                <code className="min-w-0 flex-1 truncate font-mono" style={{ fontSize: 12, color: "var(--ink)" }}>
                  {host}/api/scim/v2
                </code>
                <CopyButton text={`${host}/api/scim/v2`} />
              </div>
              <ScimTokenForm action={regenerateScimToken} hint={scim.tokenHint ?? null} />
            </div>
          </Card>

          <form action={saveScimGroups} className="flex flex-col" style={{ gap: 22 }}>
            <Card title="Correspondance des groupes">
              <ScimGroupsField
                initial={(scim.groups ?? []).map((g) => ({
                  group: g.group,
                  team: g.team ?? "",
                  role: g.role ?? "agent",
                }))}
                teams={teamRows}
              />
            </Card>
            <SaveBar saved={saved === "1"} cancelHref="/app/settings/agent-sso?tab=scim" />
          </form>

          <Card title="Journal de synchronisation">
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              Aucun événement de synchronisation.
            </p>
          </Card>
        </>
      )}
    </PageShell>
  );
}

/** Formulaire factice flouté derrière le voile de l'état verrouillé. */
function GhostForm() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[10px] border"
          style={{ background: "var(--panel)", borderColor: "var(--line)", padding: 18 }}
        >
          <span className="mb-3 inline-block rounded" style={{ width: 140, height: 10, background: "var(--sunk)" }} />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <span key={j} className="inline-block rounded" style={{ width: "100%", height: 30, background: "var(--sunk)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
