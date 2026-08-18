import Link from "next/link";
import { saveSsoConnection, toggleSsoEnabled } from "./actions";
import { CopyButton } from "./copy-button";
import { getT, type Translate } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/fr";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "localhost:3000";
const PROTOCOL = BASE_DOMAIN.includes("localhost") ? "http" : "https";

export const SSO_PROVIDERS = [
  { key: "entra", name: "sso.providerEntra", proto: "sso.protoOidc3" },
  { key: "google", name: "sso.providerGoogle", proto: "sso.protoOidc3" },
  { key: "okta", name: "sso.providerOkta", proto: "sso.protoOktaBoth" },
  { key: "generic", name: "sso.providerGeneric", proto: "sso.protoSamlXml" },
] as const satisfies readonly { key: string; name: MessageKey; proto: MessageKey }[];
export type SsoProviderKey = (typeof SSO_PROVIDERS)[number]["key"];

type Connection = {
  id: string;
  provider: string;
  status: string;
  encryptedConfig: string;
  secretHint: string | null;
  strictMode: boolean;
  jitEnabled: boolean;
} | null;

function decodeConfig(conn: Connection): Record<string, string> {
  if (!conn) return {};
  try {
    const parsed = JSON.parse(Buffer.from(conn.encryptedConfig, "base64").toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  mono = true,
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
        {label}
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={`pt-input mt-[7px] h-[50px] w-full px-[15px] text-[14.5px] font-normal ${mono ? "font-mono" : ""}`}
          style={{ color: "var(--ink)" }}
        />
      </label>
      {hint && (
        <p className="text-[13px] leading-[1.5]" style={{ color: "var(--ink-3)", textWrap: "pretty" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * PT-08 · onglet Connexion SSO — UI fidèle à la maquette, persistance minimale
 * dans orgSsoConnections (statut "pending"). Le flux OIDC réel arrive au Lot 5b.
 */
export async function SsoSection({
  tenantSlug,
  orgId,
  orgName,
  strictDomain,
  conn,
  provider,
}: {
  tenantSlug: string;
  orgId: string;
  orgName: string;
  strictDomain: string | null;
  conn: Connection;
  provider: SsoProviderKey;
}) {
  const t = await getT();
  const config = decodeConfig(conn);
  const isSaml = provider === "generic";
  const enabled = Boolean(conn && conn.status !== "disabled");
  const active = conn?.status === "active";
  const base = `${PROTOCOL}://${tenantSlug}.${BASE_DOMAIN}`;
  const spValues: [string, string][] = isSaml
    ? [
        [t("sso.acsUrl"), `${base}/help/auth/saml/${orgId}`],
        [t("sso.entityId"), `${base}/help/org/${orgId}`],
      ]
    : [
        [t("sso.redirectUri"), `${base}/help/auth/oidc/${orgId}`],
        [t("sso.scopes"), "openid profile email"],
      ];
  const secretPlaceholder = conn?.secretHint
    ? `••••••••••••••••••••••••••${conn.secretHint}`
    : undefined;

  return (
    <div className="flex flex-col gap-7">
      {/* Bandeau d'activation */}
      <div
        className="flex items-start gap-[15px] rounded-2xl border px-5 py-[18px]"
        style={{
          boxShadow: "var(--sh-1)",
          ...(active
            ? { borderColor: "var(--acc-b)", background: "var(--acc-t)" }
            : { borderColor: "var(--line)", background: "var(--panel)" }),
        }}
      >
        <form action={toggleSsoEnabled} className="flex-none">
          <button
            type="submit"
            className="pt-switch mt-0.5"
            data-on={enabled ? "true" : "false"}
            disabled={!conn}
            aria-label="Connexion par compte d'entreprise"
          />
        </form>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-[16.5px] font-semibold tracking-[-0.01em]">
              {t("sso.enterpriseLogin")}
            </p>
            <span
              className="rounded-full px-2.5 py-[3px] text-xs font-semibold"
              style={
                active
                  ? { background: "var(--ok-t)", color: "var(--ok)" }
                  : { background: "var(--closed-t)", color: "var(--closed)" }
              }
            >
              {active ? t("sso.active") : t("sso.inactive")}
            </span>
          </div>
          <p
            className="text-[14.5px] leading-[1.6]"
            style={{ color: "var(--ink-2)", textWrap: "pretty" }}
          >
            {t("sso.enterpriseLoginDesc")}
          </p>
        </div>
      </div>

      {/* Fournisseur d'identité */}
      <div className="flex flex-col gap-3.5">
        <p className="pt-eyebrow">{t("sso.provider")}</p>
        <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
          {SSO_PROVIDERS.map((p) => {
            const selected = p.key === provider;
            return (
              <Link
                key={p.key}
                href={`/help/organization?tab=sso&provider=${p.key}`}
                className="flex flex-col gap-1 rounded-xl border px-4 py-[15px] transition-all duration-150 hover:no-underline"
                style={{
                  boxShadow: selected ? "var(--sh-1)" : "none",
                  ...(selected
                    ? { borderColor: "var(--acc)", background: "var(--acc-t)" }
                    : { borderColor: "var(--line)", background: "var(--panel)" }),
                }}
              >
                <span
                  className="text-[15px] font-semibold"
                  style={{ color: selected ? "var(--acc)" : "var(--ink)" }}
                >
                  {t(p.name)}
                </span>
                <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {t(p.proto)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <form action={saveSsoConnection} className="flex flex-col gap-7">
        <input type="hidden" name="provider" value={provider} />

        {/* Paramètres de connexion */}
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="pt-eyebrow">{t("sso.settings")}</p>
            <span
              className="rounded-full px-[9px] py-0.5 font-mono text-[11.5px]"
              style={{ background: "var(--sunk)", color: "var(--ink-3)" }}
            >
              {isSaml ? "SAML 2.0" : "OpenID Connect"}
            </span>
          </div>
          {isSaml ? (
            <>
              <Field
                label={t("sso.metadataUrl")}
                name="metadataUrl"
                defaultValue={config.metadataUrl ?? ""}
                placeholder="https://idp.entreprise.fr/saml/metadata"
                hint={t("sso.metadataUrlHint")}
              />
              <div className="flex flex-col gap-1.5">
                <p className="text-[13.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
                  {t("sso.certificate")}
                </p>
                <div
                  className="flex min-h-[50px] items-center rounded-[11px] border px-[15px] text-[14.5px]"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink-2)",
                  }}
                >
                  {config.metadataUrl
                    ? t("sso.certificateLoadedPending")
                    : t("sso.certificateLoaded")}
                </div>
              </div>
            </>
          ) : (
            <>
              <Field label={t("sso.clientId")} name="clientId" defaultValue={config.clientId ?? ""} />
              <Field
                label={t("sso.clientSecret")}
                name="clientSecret"
                type="password"
                placeholder={secretPlaceholder}
                hint={t("sso.clientSecretHint")}
              />
              <Field
                label={t("sso.idpTenant")}
                name="idpTenant"
                defaultValue={config.idpTenant ?? ""}
              />
            </>
          )}
        </div>

        {/* À copier dans votre fournisseur */}
        <div className="flex flex-col gap-3">
          <p className="pt-eyebrow">{t("sso.copyToProvider")}</p>
          <div
            className="overflow-hidden rounded-[14px] border"
            style={{
              background: "var(--panel)",
              borderColor: "var(--line)",
              boxShadow: "var(--sh-1)",
            }}
          >
            {spValues.map(([k, v]) => (
              <div
                key={k}
                className="grid grid-cols-[minmax(150px,180px)_1fr_80px] items-center gap-3 border-b px-[17px] py-3.5 max-sm:grid-cols-1"
                style={{ borderColor: "var(--line-2)" }}
              >
                <span className="text-[13.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
                  {k}
                </span>
                <span
                  className="min-w-0 truncate font-mono text-[13px]"
                  style={{ color: "var(--ink-2)" }}
                >
                  {v}
                </span>
                <CopyButton
                  text={v}
                  label={t("sso.copy")}
                  className="text-right text-[13.5px] font-semibold max-sm:text-left"
                  style={{ color: "var(--acc-2)" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Mode strict + JIT */}
        <div className="flex flex-col gap-[11px]" data-sso-toggles>
          <label
            className="pt-switch-label relative flex items-start gap-3.5 rounded-[14px] border px-[18px] py-4"
            style={{
              background: "var(--panel)",
              borderColor: "var(--line)",
              boxShadow: "var(--sh-1)",
            }}
          >
            <input type="checkbox" name="strict" defaultChecked={conn?.strictMode ?? false} />
            <span className="pt-switch mt-px" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium">{t("sso.strict")}</span>
              <span
                className="block text-[13.5px] leading-[1.55]"
                style={{ color: "var(--ink-3)", textWrap: "pretty" }}
              >
                {strictDomain
                  ? t("sso.strictDesc", { domain: strictDomain })
                  : t("sso.strictDescNoDomain")}
              </span>
            </span>
          </label>
          <div
            className="pt-strict-warning rounded-[14px] border px-[18px] py-[15px] text-sm leading-[1.6]"
            style={{
              background: "var(--wait-t)",
              borderColor: "var(--wait)",
              color: "var(--wait)",
              textWrap: "pretty",
            }}
          >
            {t("sso.strictWarning")}
          </div>
          <label
            className="pt-switch-label relative flex items-start gap-3.5 rounded-[14px] border px-[18px] py-4"
            style={{
              background: "var(--panel)",
              borderColor: "var(--line)",
              boxShadow: "var(--sh-1)",
            }}
          >
            <input type="checkbox" name="jit" defaultChecked={conn?.jitEnabled ?? true} />
            <span className="pt-switch mt-px" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium">{t("sso.jit")}</span>
              <span
                className="block text-[13.5px] leading-[1.55]"
                style={{ color: "var(--ink-3)", textWrap: "pretty" }}
              >
                {t("sso.jitDesc", { org: orgName })}
              </span>
            </span>
          </label>
        </div>

        {/* Test de connexion — seul état idle (le flux réel arrive au Lot 5b) */}
        <div
          className="flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-[18px]"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <button
            type="submit"
            className="grid min-h-[46px] place-items-center whitespace-nowrap rounded-[10px] px-[22px] py-[11px] text-[15px] font-semibold text-white"
            style={{ background: "var(--cta-a)", boxShadow: "var(--sh-1)" }}
          >
            {t("sso.test")}
          </button>
          <p
            className="min-w-[200px] flex-1 text-[14.5px] font-[450] leading-[1.6]"
            style={{ color: "var(--ink-2)", textWrap: "pretty" }}
          >
            {t("sso.testIdle")}
          </p>
        </div>
      </form>
    </div>
  );
}
