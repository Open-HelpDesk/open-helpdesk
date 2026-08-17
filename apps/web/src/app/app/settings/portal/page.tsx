import { requireAgent } from "@/lib/session";
import { entitlementsFor } from "@/lib/entitlements";
import {
  Field,
  PageHeader,
  PageShell,
  PlanProBadge,
  SaveBar,
  Select,
  Toggle,
} from "@/components/settings-page";
import { savePortalConfig } from "./actions";

type PortalConfig = {
  portalEnabled?: boolean;
  kbPublished?: boolean;
  hidePoweredBy?: boolean;
  kbVisibility?: "public" | "authenticated";
  contactAuth?: "magic_link" | "sso";
  welcomeText?: string;
  widget?: { enabled?: boolean; color?: string; position?: "right" | "left"; title?: string };
};

const CONTROL: React.CSSProperties = {
  minHeight: 36,
  padding: "7px 11px",
  borderRadius: 6,
  fontSize: 13.5,
};

/** Panneau encadré autour d'un toggle (padding 13/14, radius 9). */
function TogglePanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border"
      style={{
        padding: "13px 14px",
        borderRadius: 9,
        borderColor: "var(--line)",
        background: "var(--panel)",
      }}
    >
      {children}
    </div>
  );
}

/** Cadre d'aperçu à droite (en-tête --sunk 11.5px + contenu). */
function PreviewPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden border"
      style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--panel)" }}
    >
      <div
        className="border-b"
        style={{
          padding: "9px 13px",
          background: "var(--sunk)",
          borderColor: "var(--line)",
          fontSize: 11.5,
          color: "var(--ink-3)",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * ST-09 — Portail client & widget (1100 px, onglets Portail / Widget) : colonne de
 * réglages (toggles encadrés, selects, texte d'accueil, domaine personnalisé
 * [PLAN PRO]) + colonne d'aperçu (portail ou widget + snippet).
 */
export default async function PortalSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { tab, saved } = await searchParams;
  const activeTab = tab === "widget" ? "widget" : "portal";

  const config = ((tenant.portalConfig as PortalConfig) ?? {}) as PortalConfig;
  const widget = config.widget ?? {};
  const branding = (tenant.branding ?? {}) as { accentColor?: string };
  const accent = branding.accentColor ?? "#0B5F46";
  const widgetColor = widget.color ?? accent;
  const widgetTitle = widget.title ?? "Besoin d'aide ?";
  const ent = entitlementsFor(tenant.plan);
  const isPro = ent.multiBrand;
  const portalHost = `${tenant.slug}.open-helpdesk.com`;
  const snippet = `<script src="https://${portalHost}/widget.js" async></script>`;
  const welcome = config.welcomeText || "Comment pouvons-nous vous aider ?";

  const tabs = [
    { label: "Portail", href: "/app/settings/portal", active: activeTab === "portal" },
    { label: "Widget", href: "/app/settings/portal?tab=widget", active: activeTab === "widget" },
  ];

  return (
    <PageShell maxWidth={1100}>
      <PageHeader
        title="Portail client & widget"
        subtitle="Visibilité de la base de connaissances, authentification des contacts et widget embarquable."
        tabs={tabs}
      />

      {activeTab === "portal" ? (
        <form action={savePortalConfig} className="flex flex-col" style={{ gap: 22 }}>
          <input type="hidden" name="section" value="portal" />
          <div
            className="st-rise grid items-start"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}
          >
            <div className="flex flex-col" style={{ gap: 16 }}>
              <TogglePanel>
                <Toggle
                  name="portalEnabled"
                  defaultChecked={config.portalEnabled !== false}
                  label="Portail client activé"
                  hint={`Accessible sur ${portalHost}/help`}
                />
              </TogglePanel>
              <TogglePanel>
                <Toggle
                  name="kbPublished"
                  defaultChecked={config.kbPublished !== false}
                  label="Base de connaissances publiée"
                  hint="Les articles publiés sont visibles sans connexion."
                />
              </TogglePanel>
              <TogglePanel>
                <Toggle
                  name="hidePoweredBy"
                  defaultChecked={isPro && config.hidePoweredBy === true}
                  disabled={!isPro}
                  label="Masquer « Propulsé par Open HelpDesk »"
                  hint="Disponible à partir du plan Pro."
                />
              </TogglePanel>

              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
              >
                <Field label="Visibilité de la base de connaissances">
                  <Select
                    name="kbVisibility"
                    defaultValue={config.kbVisibility ?? "public"}
                    style={CONTROL}
                  >
                    <option value="public">Publique</option>
                    <option value="authenticated">Sur connexion</option>
                  </Select>
                </Field>
                <Field label="Authentification des contacts">
                  <Select
                    name="contactAuth"
                    defaultValue={config.contactAuth ?? "magic_link"}
                    style={CONTROL}
                  >
                    <option value="magic_link">Lien magique par email</option>
                    <option value="sso">SSO d'organisation</option>
                  </Select>
                </Field>
              </div>

              <Field label="Texte d'accueil">
                <textarea
                  name="welcomeText"
                  rows={2}
                  maxLength={200}
                  defaultValue={config.welcomeText ?? ""}
                  placeholder="Comment pouvons-nous vous aider ?"
                  className="border"
                  style={{
                    minHeight: 60,
                    padding: 11,
                    borderRadius: 6,
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink)",
                  }}
                />
              </Field>

              <div className="flex flex-col" style={{ gap: 9 }}>
                <div className="flex items-center" style={{ gap: 9 }}>
                  <span className="font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    Domaine personnalisé
                  </span>
                  <PlanProBadge />
                </div>
                <div
                  className="overflow-hidden border"
                  style={{ borderRadius: 9, borderColor: "var(--line)", background: "var(--panel)" }}
                >
                  <div
                    className="grid items-center border-b"
                    style={{
                      gridTemplateColumns: "120px 90px 1fr 110px",
                      gap: 11,
                      padding: "11px 14px",
                      fontSize: 12.5,
                      borderColor: "var(--line-2)",
                    }}
                  >
                    <span className="font-mono" style={{ color: "var(--ink-2)" }}>
                      aide.acme.fr
                    </span>
                    <span className="font-mono" style={{ color: "var(--ink-3)" }}>
                      CNAME
                    </span>
                    <span className="truncate font-mono" style={{ color: "var(--ink-2)" }}>
                      portal.open-helpdesk.com
                    </span>
                    <span
                      className="flex items-center justify-end"
                      style={{ gap: 7, color: "var(--ok)" }}
                    >
                      <span
                        className="inline-block rounded-full"
                        style={{ width: 7, height: 7, background: "var(--ok)" }}
                      />
                      Vérifié
                    </span>
                  </div>
                  <div
                    className="flex items-center"
                    style={{
                      padding: "11px 14px",
                      gap: 8,
                      background: "var(--sunk)",
                      fontSize: 12.5,
                      color: "var(--ok)",
                    }}
                  >
                    <span
                      className="inline-block rounded-full"
                      style={{ width: 7, height: 7, background: "var(--ok)" }}
                    />
                    Certificat TLS émis · renouvellement automatique le 12 octobre 2026
                  </div>
                </div>
              </div>
            </div>

            {/* Aperçu du portail */}
            <PreviewPanel label="Aperçu du portail">
              <div
                className="flex flex-col items-center"
                style={{ padding: "22px 18px", gap: 13 }}
              >
                <span
                  className="grid place-items-center font-bold text-white"
                  style={{ width: 28, height: 28, borderRadius: 8, fontSize: 13, background: accent }}
                >
                  {tenant.name[0]?.toUpperCase()}
                </span>
                <p
                  className="text-center font-semibold"
                  style={{ fontSize: 15, color: "var(--ink)" }}
                >
                  {welcome}
                </p>
                <span
                  className="w-full border"
                  style={{
                    height: 38,
                    borderRadius: 20,
                    borderColor: "var(--acc-b)",
                    background: "var(--bg)",
                  }}
                />
                <div
                  className="grid w-full"
                  style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="border"
                      style={{
                        height: 56,
                        borderRadius: 9,
                        borderColor: "var(--line)",
                        background: "var(--bg)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </PreviewPanel>
          </div>
          <SaveBar saved={saved === "1"} cancelHref="/app/settings/portal" />
        </form>
      ) : (
        <form action={savePortalConfig} className="flex flex-col" style={{ gap: 22 }}>
          <input type="hidden" name="section" value="widget" />
          <div
            className="st-rise grid items-start"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}
          >
            <div className="flex flex-col" style={{ gap: 16 }}>
              <TogglePanel>
                <Toggle
                  name="widgetEnabled"
                  defaultChecked={widget.enabled !== false}
                  label="Widget embarquable activé"
                  hint="Le bouton d'aide s'affiche sur votre site avec le snippet ci-contre."
                />
              </TogglePanel>

              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
              >
                <Field label="Titre du bouton">
                  <input
                    name="widgetTitle"
                    defaultValue={widget.title ?? "Besoin d'aide ?"}
                    maxLength={60}
                    className="border"
                    style={{
                      ...CONTROL,
                      borderColor: "var(--line)",
                      background: "var(--bg)",
                      color: "var(--ink)",
                    }}
                  />
                </Field>
                <Field label="Position sur la page">
                  <Select
                    name="widgetPosition"
                    defaultValue={widget.position ?? "right"}
                    style={CONTROL}
                  >
                    <option value="right">En bas à droite</option>
                    <option value="left">En bas à gauche</option>
                  </Select>
                </Field>
              </div>

              <Field label="Couleur du widget" hint="Reprend l'accent du workspace par défaut.">
                <div
                  className="flex items-center border"
                  style={{
                    ...CONTROL,
                    gap: 9,
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                  }}
                >
                  <input
                    type="color"
                    name="widgetColor"
                    defaultValue={widgetColor}
                    aria-label="Couleur du widget"
                    style={{ width: 30, height: 20, border: 0, background: "transparent", padding: 0 }}
                  />
                  <span className="font-mono" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {widgetColor.toUpperCase()}
                  </span>
                </div>
              </Field>
            </div>

            {/* Aperçu du widget */}
            <PreviewPanel label="Aperçu du widget">
              <div className="flex flex-col" style={{ padding: 18, gap: 14 }}>
                <div
                  className="relative overflow-hidden border"
                  style={{
                    height: 200,
                    borderRadius: 9,
                    borderColor: "var(--line)",
                    background: "var(--sunk)",
                  }}
                >
                  <div
                    className="absolute overflow-hidden border"
                    style={{
                      bottom: 14,
                      ...(widget.position === "left" ? { left: 14 } : { right: 14 }),
                      width: 210,
                      borderRadius: 12,
                      borderColor: "var(--line)",
                      background: "var(--panel)",
                      boxShadow: "0 8px 24px rgba(0,0,0,.14)",
                    }}
                  >
                    <div
                      className="truncate font-semibold text-white"
                      style={{ padding: "11px 13px", fontSize: 12.5, background: widgetColor }}
                    >
                      {widgetTitle}
                    </div>
                    <div
                      className="flex flex-col"
                      style={{ padding: "11px 13px", gap: 7 }}
                    >
                      <span
                        className="border"
                        style={{
                          height: 26,
                          borderRadius: 6,
                          borderColor: "var(--line)",
                          background: "var(--bg)",
                        }}
                      />
                      <span
                        className="border"
                        style={{
                          height: 52,
                          borderRadius: 6,
                          borderColor: "var(--line)",
                          background: "var(--bg)",
                        }}
                      />
                      <span style={{ height: 28, borderRadius: 6, background: widgetColor }} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col" style={{ gap: 6 }}>
                  <span className="font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    Snippet à coller avant &lt;/body&gt;
                  </span>
                  <code
                    className="border font-mono"
                    style={{
                      padding: 11,
                      borderRadius: 7,
                      borderColor: "var(--line)",
                      background: "var(--sunk)",
                      fontSize: 11.5,
                      color: "var(--ink-2)",
                      lineHeight: 1.6,
                      wordBreak: "break-all",
                    }}
                  >
                    {snippet}
                  </code>
                </div>
              </div>
            </PreviewPanel>
          </div>
          <SaveBar saved={saved === "1"} cancelHref="/app/settings/portal?tab=widget" />
        </form>
      )}
    </PageShell>
  );
}
