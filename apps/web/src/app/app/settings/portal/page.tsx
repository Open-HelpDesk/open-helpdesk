import { requireAgent } from "@/lib/session";
import { entitlementsFor } from "@/lib/entitlements";
import {
  Card,
  Field,
  PageHeader,
  PageShell,
  PlanProBadge,
  SaveBar,
  Select,
  StatusPill,
  TextInput,
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

/**
 * ST-09 — Portail client & widget (1100 px, onglets Portail / Widget) : toggles,
 * selects, domaine personnalisé [PLAN PRO] en lecture, aperçus à droite, snippet.
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
  const ent = entitlementsFor(tenant.plan);
  const isPro = ent.multiBrand;
  const portalHost = `${tenant.slug}.open-helpdesk.com`;
  const snippet = `<script src="https://${portalHost}/widget.js" async></script>`;

  const tabs = [
    { label: "Portail", href: "/app/settings/portal", active: activeTab === "portal" },
    { label: "Widget", href: "/app/settings/portal?tab=widget", active: activeTab === "widget" },
  ];

  return (
    <PageShell maxWidth={1100}>
      <PageHeader
        code="ST-09"
        title="Portail client & widget"
        subtitle="Visibilité de la base de connaissances, authentification des contacts et widget embarquable."
        tabs={tabs}
      />

      {activeTab === "portal" ? (
        <form action={savePortalConfig} className="flex flex-col" style={{ gap: 22 }}>
          <input type="hidden" name="section" value="portal" />
          <div
            className="grid items-start gap-4"
            style={{ gridTemplateColumns: "minmax(380px, 1.2fr) minmax(300px, 1fr)" }}
          >
            <div className="flex flex-col gap-4">
              <Card>
                <div className="flex flex-col gap-4">
                  <Toggle
                    name="portalEnabled"
                    defaultChecked={config.portalEnabled !== false}
                    label="Portail client activé"
                    hint={`Accessible sur ${portalHost}/help`}
                  />
                  <Toggle
                    name="kbPublished"
                    defaultChecked={config.kbPublished !== false}
                    label="Base de connaissances publiée"
                    hint="Les articles publiés sont visibles sans connexion."
                  />
                  <Toggle
                    name="hidePoweredBy"
                    defaultChecked={isPro && config.hidePoweredBy === true}
                    disabled={!isPro}
                    label="Masquer « Propulsé par Open HelpDesk »"
                    hint="Disponible à partir du plan Pro."
                  />
                </div>
              </Card>

              <Card>
                <div className="flex flex-col gap-4">
                  <Field label="Visibilité de la base de connaissances">
                    <Select name="kbVisibility" defaultValue={config.kbVisibility ?? "public"}>
                      <option value="public">Publique</option>
                      <option value="authenticated">Sur connexion</option>
                    </Select>
                  </Field>
                  <Field label="Authentification des contacts">
                    <Select name="contactAuth" defaultValue={config.contactAuth ?? "magic_link"}>
                      <option value="magic_link">Lien magique par email</option>
                      <option value="sso">SSO d'organisation</option>
                    </Select>
                  </Field>
                  <Field label="Texte d'accueil">
                    <TextInput
                      name="welcomeText"
                      defaultValue={config.welcomeText ?? ""}
                      placeholder="Comment pouvons-nous vous aider ?"
                    />
                  </Field>
                </div>
              </Card>

              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <h2
                    className="font-mono font-bold uppercase"
                    style={{ fontSize: 10.5, letterSpacing: "0.07em", color: "var(--ink-3)" }}
                  >
                    Domaine personnalisé
                  </h2>
                  <PlanProBadge />
                </div>
                <div
                  className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
                  style={{ borderColor: "var(--line-2)", background: "var(--sunk)" }}
                >
                  <span className="font-mono" style={{ fontSize: 13, color: "var(--ink)" }}>
                    aide.acme.fr
                  </span>
                  <span className="font-mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                    CNAME → portal.open-helpdesk.com
                  </span>
                  <span className="flex-1" />
                  <StatusPill tone="ok">Vérifié</StatusPill>
                </div>
                <p className="mt-2" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  Certificat TLS émis · renouvellement automatique le 12 octobre 2026
                </p>
              </Card>
            </div>

            {/* Aperçu portail */}
            <Card title="Aperçu du portail">
              <div
                className="overflow-hidden rounded-lg border"
                style={{ borderColor: "var(--line-2)" }}
              >
                <div style={{ background: accent, padding: "18px 16px" }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="flex items-center justify-center rounded-md font-bold"
                      style={{ width: 24, height: 24, fontSize: 12, background: "#fff", color: accent }}
                    >
                      {tenant.name[0]?.toUpperCase()}
                    </span>
                    <span className="font-semibold text-white" style={{ fontSize: 13 }}>
                      {tenant.name} — Aide
                    </span>
                  </div>
                  <p className="mt-3 font-semibold text-white" style={{ fontSize: 15 }}>
                    {config.welcomeText || "Comment pouvons-nous vous aider ?"}
                  </p>
                  <span
                    className="mt-2 flex items-center rounded-md px-2.5"
                    style={{ height: 32, background: "#fff", fontSize: 12, color: "var(--ink-3)" }}
                  >
                    Rechercher un article…
                  </span>
                </div>
                <div className="flex flex-col gap-2" style={{ background: "var(--bg)", padding: 14 }}>
                  {["Bien démarrer", "Facturation", "Intégrations"].map((c) => (
                    <span
                      key={c}
                      className="rounded-md border px-3 py-2 font-medium"
                      style={{ fontSize: 12.5, borderColor: "var(--line)", color: "var(--ink)" }}
                    >
                      {c}
                    </span>
                  ))}
                  <span className="text-center" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                    {config.hidePoweredBy && isPro ? " " : "Propulsé par Open HelpDesk"}
                  </span>
                </div>
              </div>
            </Card>
          </div>
          <SaveBar saved={saved === "1"} cancelHref="/app/settings/portal" />
        </form>
      ) : (
        <form action={savePortalConfig} className="flex flex-col" style={{ gap: 22 }}>
          <input type="hidden" name="section" value="widget" />
          <div
            className="grid items-start gap-4"
            style={{ gridTemplateColumns: "minmax(380px, 1.2fr) minmax(300px, 1fr)" }}
          >
            <div className="flex flex-col gap-4">
              <Card>
                <div className="flex flex-col gap-4">
                  <Toggle
                    name="widgetEnabled"
                    defaultChecked={widget.enabled !== false}
                    label="Widget embarquable activé"
                    hint="Le bouton d'aide s'affiche sur votre site avec le snippet ci-dessous."
                  />
                  <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <Field label="Couleur">
                      <input
                        type="color"
                        name="widgetColor"
                        defaultValue={widget.color ?? accent}
                        className="h-9 w-full rounded-md border"
                        style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                      />
                    </Field>
                    <Field label="Position">
                      <Select name="widgetPosition" defaultValue={widget.position ?? "right"}>
                        <option value="right">En bas à droite</option>
                        <option value="left">En bas à gauche</option>
                      </Select>
                    </Field>
                    <Field label="Titre du bouton">
                      <TextInput name="widgetTitle" defaultValue={widget.title ?? "Besoin d'aide ?"} />
                    </Field>
                  </div>
                </div>
              </Card>
              <Card title="Snippet à coller sur votre site">
                <pre
                  className="overflow-x-auto rounded-md border p-3 font-mono"
                  style={{
                    fontSize: 12,
                    background: "var(--sunk)",
                    borderColor: "var(--line)",
                    color: "var(--ink)",
                  }}
                >
                  {snippet}
                </pre>
              </Card>
            </div>

            {/* Aperçu widget */}
            <Card title="Aperçu du widget">
              <div
                className="relative overflow-hidden rounded-lg border"
                style={{ borderColor: "var(--line-2)", background: "var(--canvas)", height: 300 }}
              >
                <div
                  className="absolute bottom-4 flex flex-col gap-2"
                  style={widget.position === "left" ? { left: 16 } : { right: 16 }}
                >
                  <div
                    className="flex flex-col overflow-hidden rounded-lg border"
                    style={{
                      width: 200,
                      borderColor: "var(--line)",
                      background: "var(--bg)",
                      boxShadow: "0 10px 26px rgba(17,33,28,.16)",
                    }}
                  >
                    <span
                      className="px-3 py-2 font-semibold text-white"
                      style={{ fontSize: 12, background: widget.color ?? accent }}
                    >
                      {tenant.name}
                    </span>
                    <span className="px-3 py-2" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
                      {config.welcomeText || "Comment pouvons-nous vous aider ?"}
                    </span>
                    <span
                      className="mx-3 mb-3 rounded-md border px-2 py-1.5"
                      style={{ fontSize: 11, borderColor: "var(--line)", color: "var(--ink-3)" }}
                    >
                      Écrivez votre message…
                    </span>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 self-end rounded-full px-3 font-semibold text-white"
                    style={{
                      height: 34,
                      fontSize: 12,
                      background: widget.color ?? accent,
                      alignSelf: widget.position === "left" ? "flex-start" : "flex-end",
                    }}
                  >
                    💬 {widget.title ?? "Besoin d'aide ?"}
                  </span>
                </div>
              </div>
            </Card>
          </div>
          <SaveBar saved={saved === "1"} cancelHref="/app/settings/portal?tab=widget" />
        </form>
      )}
    </PageShell>
  );
}
