import { Fragment } from "react";
import { requireAgent } from "@/lib/session";
import { db, teams, users } from "@openhelpdesk/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { getEdition } from "@openhelpdesk/config";
import { entitlementsFor } from "@/lib/entitlements";
import {
  Field,
  LockedScreen,
  PageHeader,
  PageShell,
  EnterpriseBadge,
  SaveBar,
  Select,
  StatusPill,
} from "@/components/settings-page";
import {
  CopyLink,
  EnforcementRadios,
  ScimEndpoint,
  ScimGroupsField,
} from "./client";
import { regenerateScimToken, saveSamlConfig, saveScimGroups, type AgentSsoConfig } from "./actions";
import { getT, type Translate } from "@/i18n/server";

/** Libellés verbatim du design (les valeurs persistées restent inchangées). */
function idpOptions(t: Translate): { value: string; label: string }[] {
  return [
    { value: "okta", label: "Okta" },
    { value: "entra", label: "Microsoft Entra ID" },
    { value: "google", label: "Google Workspace" },
    { value: "onelogin", label: "OneLogin" },
    { value: "other", label: t("app.settings.sso.idpOther") },
  ];
}

const ATTR_GRID = "minmax(150px,1fr) 34px minmax(180px,1.2fr) 110px";
const SP_GRID = "170px 1fr 80px";

/** Contrôle de formulaire — hauteur 36, padding 7/11, radius 6, 13,5 px. */
const CONTROL: React.CSSProperties = {
  minHeight: 36,
  padding: "7px 11px",
  borderRadius: 6,
  fontSize: 13.5,
};

/** Cadre encadrant un toggle (padding 13/14, radius 9). */
function Panel({
  children,
  accent,
  style,
}: {
  children: React.ReactNode;
  accent?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="flex items-start border"
      style={{
        gap: 12,
        padding: accent ? "14px 15px" : "13px 14px",
        borderRadius: accent ? 10 : 9,
        borderColor: accent ? "var(--acc-b)" : "var(--line)",
        background: accent ? "var(--acc-t)" : "var(--panel)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Titre de section — 14,5 px/600, avec complément optionnel aligné sur la ligne de base. */
function Section({
  title,
  aside,
  gap = 12,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  gap?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col" style={{ gap }}>
      <div className="flex flex-wrap items-baseline" style={{ gap: 10 }}>
        <h2 className="font-semibold" style={{ fontSize: 14.5, color: "var(--ink)" }}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Phrase du mapping des rôles : deux noms de groupe en mono dans une même
 * phrase. `t.parts` ne découpe qu'un emplacement, on marque donc les deux
 * bornes et on redécoupe — l'ordre des mots peut changer d'une langue à l'autre.
 */
function RolesHint({ t }: { t: Translate }) {
  const mark = "\u0000";
  const chunks = t("app.settings.sso.rolesFromIdpHint", {
    admins: `${mark}ohd-admins${mark}`,
    agents: `${mark}ohd-agents${mark}`,
  }).split(mark);
  return (
    <>
      {chunks.map((chunk, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-mono">
            {chunk}
          </span>
        ) : (
          <Fragment key={i}>{chunk}</Fragment>
        ),
      )}
    </>
  );
}

/** En-tête de table 11 px/700 sur fond --sunk, hauteur 34. */
function TableHead({
  template,
  columns,
  minWidth,
}: {
  template: string;
  columns: (string | null)[];
  minWidth: number;
}) {
  return (
    <div
      className="grid items-center border-b font-bold"
      style={{
        gridTemplateColumns: template,
        minWidth,
        height: 34,
        padding: "0 15px",
        background: "var(--sunk)",
        borderColor: "var(--line)",
        fontSize: 11,
        color: "var(--ink-3)",
      }}
    >
      {columns.map((c, i) => (
        <span key={i} className={i === columns.length - 1 ? "text-right" : ""}>
          {c}
        </span>
      ))}
    </div>
  );
}

/**
 * ST-13 — SSO des agents (1000 px, EE). Verrouillé hors plan Pro. Onglet SAML 2.0 :
 * activation, fournisseur d'identité, valeurs SP réelles (slug), correspondance des
 * attributs, application & sessions, test de connexion. Onglet SCIM : point de
 * terminaison, correspondance des groupes, journal de synchronisation.
 */
export default async function AgentSsoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const ent = entitlementsFor(tenant);
  const { tab, saved } = await searchParams;
  const activeTab = tab === "scim" ? "scim" : "saml";

  const header = (tabs?: { label: string; href: string; active: boolean }[]) => (
    <PageHeader
      title={t("app.settings.sso.agentTitle")}
      subtitle={t("app.settings.sso.agentSubtitle")}
      tabs={tabs}
    />
  );

  if (!ent.agentSso) {
    const edition = getEdition();
    return (
      <PageShell maxWidth={1000}>
        {header()}
        <LockedScreen
          variant={edition}
          title={t(
            edition === "cloud"
              ? "app.settings.sso.agentLockedTitle"
              : "app.settings.shell.eeSelfHostedTitle",
          )}
          text={t(
            edition === "cloud"
              ? "app.settings.sso.agentLockedText"
              : "app.settings.shell.eeSelfHostedText",
          )}
          ghost={<GhostForm />}
        />
      </PageShell>
    );
  }

  const config = ((tenant.agentSsoConfig as AgentSsoConfig) ?? {}) as AgentSsoConfig;
  const saml = config.saml ?? {};
  const scim = config.scim ?? {};
  const [teamRows, agentRows] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.tenantId, tenant.id))
      .orderBy(asc(teams.name)),
    db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), ne(users.status, "disabled"))),
  ]);

  // Domaines des comptes agents — aucune table de domaines vérifiés au niveau workspace.
  const agentDomains = [
    ...new Set(
      agentRows
        .map((a) => a.email.split("@")[1])
        .filter((d): d is string => Boolean(d)),
    ),
  ].sort();

  const host = `https://${tenant.slug}.open-helpdesk.com`;
  const spValues: [string, string][] = [
    [t("app.settings.sso.spAcsUrl"), `${host}/api/auth/saml/callback`],
    [t("app.settings.sso.spEntityId"), host],
    [t("app.settings.sso.spMetadataUrl"), `${host}/api/auth/saml/metadata`],
    [t("app.settings.sso.spNameIdFormat"), "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"],
  ];
  const attrMap: [string, string, string, boolean][] = [
    ["m_email", t("app.settings.sso.attrEmail"), saml.mapping?.email ?? "user.email", true],
    ["m_firstName", t("app.settings.sso.attrFirstName"), saml.mapping?.firstName ?? "user.firstName", true],
    ["m_lastName", t("app.settings.sso.attrLastName"), saml.mapping?.lastName ?? "user.lastName", true],
    ["m_role", t("app.settings.sso.attrRole"), saml.mapping?.role ?? "user.groups", false],
    ["m_team", t("app.settings.sso.team"), saml.mapping?.team ?? "user.department", false],
  ];
  const connected = Boolean(saml.enabled && saml.ssoUrl);
  const scimEnabled = scim.enabled === true;

  const tabs = [
    { label: "SAML 2.0", href: "/app/settings/agent-sso", active: activeTab === "saml" },
    { label: "SCIM", href: "/app/settings/agent-sso?tab=scim", active: activeTab === "scim" },
  ];

  return (
    <PageShell maxWidth={1000}>
      {/* Chips de fournisseur d'identité : état sélectionné en CSS (radio caché). */}
      <style>{`
        .sso-chip { position: relative; min-height: 38px; padding: 8px 14px; display: flex;
          align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 8px;
          background: var(--panel); color: var(--ink-2); font-size: 13px; font-weight: 450;
          white-space: nowrap; cursor: pointer; }
        .sso-chip input { position: absolute; opacity: 0; width: 0; height: 0; }
        .sso-chip:has(input:checked) { border-color: var(--acc); background: var(--acc-t);
          color: var(--acc); font-weight: 600; }
        .sso-chip:has(input:focus-visible) { outline: 2px solid var(--acc); outline-offset: 2px; }
      `}</style>

      {header(tabs)}

      {activeTab === "saml" ? (
        <form action={saveSamlConfig} className="st-rise flex flex-col" style={{ gap: 24 }}>
          {/* Activation */}
          <Panel accent={saml.enabled === true}>
            <label className="ohd-toggle flex items-start" style={{ gap: 12 }}>
              <input type="checkbox" name="enabled" defaultChecked={saml.enabled === true} />
              <span className="ohd-knob" aria-hidden />
              <span className="sr-only">{t("app.settings.sso.samlToggleLabel")}</span>
            </label>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center" style={{ gap: 9 }}>
                <span className="font-semibold" style={{ fontSize: 13.5, color: "var(--ink)" }}>
                  {t("app.settings.sso.samlHeading")}
                </span>
                <EnterpriseBadge />
                {connected ? (
                  <StatusPill tone="ok">{t("app.settings.sso.statusConnected")}</StatusPill>
                ) : (
                  <StatusPill tone="closed">{t("app.settings.sso.statusInactive")}</StatusPill>
                )}
              </div>
              <p style={{ fontSize: 12.5, color: "var(--ink-2)", textWrap: "pretty" }}>
                {t("app.settings.sso.samlIntro")}
              </p>
            </div>
          </Panel>

          {/* Fournisseur d'identité */}
          <Section title={t("app.settings.sso.idpSection")}>
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {idpOptions(t).map((idp) => (
                <label key={idp.value} className="sso-chip">
                  <input
                    type="radio"
                    name="idp"
                    value={idp.value}
                    defaultChecked={(saml.idp ?? "other") === idp.value}
                  />
                  {idp.label}
                </label>
              ))}
            </div>

            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
            >
              <Field label={t("app.settings.sso.issuerId")}>
                <input
                  name="entityId"
                  defaultValue={saml.entityId ?? ""}
                  placeholder="http://www.idp.com/exk4f2c91ab44de7013"
                  className="border font-mono"
                  style={{
                    ...CONTROL,
                    fontSize: 13,
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink)",
                  }}
                />
              </Field>
              <Field label={t("app.settings.sso.ssoUrl")}>
                <input
                  name="ssoUrl"
                  defaultValue={saml.ssoUrl ?? ""}
                  placeholder="https://idp.entreprise.fr/app/ohd/sso/saml"
                  className="border font-mono"
                  style={{
                    ...CONTROL,
                    fontSize: 13,
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink)",
                  }}
                />
              </Field>
              <Field
                label={t("app.settings.sso.certificate")}
                hint={t("app.settings.sso.certificateHint")}
                style={{ gridColumn: "1 / -1" }}
              >
                <textarea
                  name="certificate"
                  defaultValue={saml.certificate ?? ""}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  className="border font-mono"
                  style={{
                    minHeight: 96,
                    padding: "10px 11px",
                    borderRadius: 6,
                    fontSize: 13,
                    lineHeight: 1.55,
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink-2)",
                    wordBreak: "break-all",
                  }}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center" style={{ gap: 9 }}>
              <button
                type="button"
                disabled
                title={t("app.settings.sso.comingSoon")}
                className="ohd-hover-edge-ink grid place-items-center border font-semibold disabled:opacity-50"
                style={{
                  minHeight: 32,
                  padding: "6px 13px",
                  borderRadius: 6,
                  fontSize: 13,
                  borderColor: "var(--line)",
                  background: "var(--panel)",
                  color: "var(--ink-2)",
                  whiteSpace: "nowrap",
                }}
              >
                {t("app.settings.sso.importMetadata")}
              </button>
              <span style={{ fontSize: 12.5, color: "var(--ink-3)", textWrap: "pretty" }}>
                {t("app.settings.sso.metadataHint")}
              </span>
            </div>
          </Section>

          {/* Valeurs à renseigner côté IdP */}
          <Section title={t("app.settings.sso.spSection")}>
            <div
              className="overflow-hidden border"
              style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--panel)" }}
            >
              {spValues.map(([label, value]) => (
                <div
                  key={label}
                  className="grid items-center border-b"
                  style={{
                    gridTemplateColumns: SP_GRID,
                    gap: 12,
                    padding: "12px 15px",
                    borderColor: "var(--line-2)",
                  }}
                >
                  <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {label}
                  </span>
                  <span
                    className="min-w-0 truncate font-mono"
                    style={{ fontSize: 12.5, color: "var(--ink)" }}
                  >
                    {value}
                  </span>
                  <span className="text-right">
                    <CopyLink text={value} />
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Correspondance des attributs */}
          <Section title={t("app.settings.sso.attrSection")}>
            <div
              className="overflow-x-auto border"
              style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--panel)" }}
            >
              <TableHead
                template={ATTR_GRID}
                columns={[
                  t("app.settings.sso.colOhdField"),
                  null,
                  t("app.settings.sso.colSamlAttribute"),
                  t("app.settings.sso.required"),
                ]}
                minWidth={620}
              />
              {attrMap.map(([name, label, value, required]) => (
                <div
                  key={name}
                  className="grid items-center border-b"
                  style={{
                    gridTemplateColumns: ATTR_GRID,
                    minWidth: 620,
                    padding: "11px 15px",
                    gap: 9,
                    borderColor: "var(--line-2)",
                    fontSize: 12.5,
                  }}
                >
                  <span className="font-medium" style={{ color: "var(--ink)" }}>
                    {label}
                  </span>
                  <span className="text-center" style={{ color: "var(--ink-3)" }}>
                    ←
                  </span>
                  <input
                    name={name}
                    defaultValue={value}
                    className="min-w-0 border font-mono"
                    style={{
                      minHeight: 32,
                      padding: "6px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      borderColor: "var(--line)",
                      background: "var(--bg)",
                      color: "var(--ink)",
                    }}
                  />
                  <span
                    className="text-right font-semibold"
                    style={{ fontSize: 12, color: required ? "var(--dang)" : "var(--ink-3)" }}
                  >
                    {required ? t("app.settings.sso.required") : t("app.settings.sso.optional")}
                  </span>
                </div>
              ))}
            </div>

            <Panel>
              <label className="ohd-toggle flex items-start" style={{ gap: 12 }}>
                <input
                  type="checkbox"
                  name="rolesFromIdp"
                  defaultChecked={saml.rolesFromIdp === true}
                />
                <span className="ohd-knob" aria-hidden />
                <span className="sr-only">{t("app.settings.sso.rolesFromIdp")}</span>
              </label>
              <div className="min-w-0 flex-1">
                <div className="font-medium" style={{ fontSize: 13.5, color: "var(--ink)" }}>
                  {t("app.settings.sso.rolesFromIdp")}
                </div>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", textWrap: "pretty" }}>
                  <RolesHint t={t} />
                </p>
              </div>
            </Panel>
          </Section>

          {/* Application et sessions */}
          <Section title={t("app.settings.sso.enforcementSection")}>
            <EnforcementRadios initial={saml.enforcement ?? "verified_domains"} />
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
            >
              <Field label={t("app.settings.sso.sessionDuration")}>
                <Select
                  name="sessionHours"
                  defaultValue={String(saml.sessionHours ?? 8)}
                  style={CONTROL}
                >
                  <option value="4">{t("app.settings.sso.sessionHours", { count: 4 })}</option>
                  <option value="8">{t("app.settings.sso.sessionHours", { count: 8 })}</option>
                  <option value="12">{t("app.settings.sso.sessionHours", { count: 12 })}</option>
                  <option value="24">{t("app.settings.sso.sessionHours", { count: 24 })}</option>
                </Select>
              </Field>
              <Field label={t("app.settings.sso.backupAccount")}>
                <input
                  name="backupEmail"
                  type="email"
                  defaultValue={saml.backupEmail ?? ""}
                  placeholder="admin@entreprise.fr"
                  className="border font-mono"
                  style={{
                    ...CONTROL,
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink)",
                  }}
                />
              </Field>
              <Field label={t("app.settings.sso.agentDomains")}>
                <div
                  className="flex flex-wrap items-center border"
                  style={{
                    minHeight: 36,
                    padding: "7px 10px",
                    gap: 6,
                    borderRadius: 6,
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                  }}
                >
                  {agentDomains.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>—</span>
                  )}
                  {agentDomains.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center border font-mono"
                      style={{
                        padding: "2px 8px",
                        gap: 6,
                        borderRadius: 5,
                        fontSize: 11.5,
                        borderColor: "var(--line)",
                        background: "var(--sunk)",
                        color: "var(--ink)",
                      }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          {/* Test de connexion */}
          <Section title={t("app.settings.sso.testSection")} gap={11}>
            <div
              className="overflow-hidden border"
              style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--panel)" }}
            >
              <div
                className="flex flex-wrap items-center"
                style={{ padding: "13px 15px", gap: 12 }}
              >
                <button
                  type="button"
                  disabled
                  title={t("app.settings.sso.comingSoon")}
                  className="grid place-items-center font-semibold text-white disabled:opacity-50"
                  style={{
                    minHeight: 34,
                    padding: "7px 15px",
                    borderRadius: 7,
                    fontSize: 13,
                    background: "var(--acc)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t("app.settings.sso.runTest")}
                </button>
                <span
                  className="min-w-0 flex-1"
                  style={{ fontSize: 13, color: "var(--ink-2)", textWrap: "pretty" }}
                >
                  {t("app.settings.sso.testHint")}
                </span>
              </div>
            </div>
          </Section>

          <SaveBar saved={saved === "1"} cancelHref="/app/settings/agent-sso" />
        </form>
      ) : (
        <div className="st-rise flex flex-col" style={{ gap: 24 }}>
          {/* Activation SCIM — associée au formulaire « scim-config » ci-dessous */}
          <Panel accent={scimEnabled}>
            <label className="ohd-toggle flex items-start" style={{ gap: 12 }}>
              <input
                type="checkbox"
                name="scimEnabled"
                form="scim-config"
                defaultChecked={scimEnabled}
              />
              <span className="ohd-knob" aria-hidden />
              <span className="sr-only">{t("app.settings.sso.scimToggleLabel")}</span>
            </label>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center" style={{ gap: 9 }}>
                <span className="font-semibold" style={{ fontSize: 13.5, color: "var(--ink)" }}>
                  {t("app.settings.sso.scimHeading")}
                </span>
                <EnterpriseBadge />
              </div>
              <p style={{ fontSize: 12.5, color: "var(--ink-2)", textWrap: "pretty" }}>
                {t("app.settings.sso.scimIntro")}
              </p>
            </div>
          </Panel>

          {/* Point de terminaison */}
          <Section title={t("app.settings.sso.endpointSection")}>
            <ScimEndpoint
              url={`${host}/api/scim/v2`}
              hint={scim.tokenHint ?? null}
              action={regenerateScimToken}
            />
          </Section>

          {/* Correspondance des groupes */}
          <Section title={t("app.settings.sso.groupsSection")}>
            <ScimGroupsField
              formId="scim-config"
              initial={(scim.groups ?? []).map((g) => ({
                group: g.group,
                team: g.team ?? "",
                role: g.role ?? "agent",
              }))}
              teams={teamRows}
            />
          </Section>

          {/* Journal de synchronisation */}
          <Section title={t("app.settings.sso.syncLogSection")}>
            <div
              className="overflow-x-auto border"
              style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--panel)" }}
            >
              <TableHead
                template="150px 120px minmax(200px,1fr) 130px"
                columns={[
                  t("app.settings.sso.colDate"),
                  t("app.settings.sso.colOperation"),
                  t("app.settings.sso.colUser"),
                  t("app.settings.sso.colResult"),
                ]}
                minWidth={640}
              />
              <p style={{ padding: "18px 15px", fontSize: 12.5, color: "var(--ink-2)" }}>
                {t("app.settings.sso.syncLogEmpty")}
              </p>
            </div>
          </Section>

          <form id="scim-config" action={saveScimGroups}>
            <SaveBar saved={saved === "1"} cancelHref="/app/settings/agent-sso?tab=scim" />
          </form>
        </div>
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
