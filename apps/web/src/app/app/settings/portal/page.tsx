import { requireAgent } from "@/lib/session";
import { savePortalConfig } from "./actions";

type PortalConfig = {
  welcomeText?: string;
  widget?: { enabled?: boolean; color?: string; position?: "right" | "left"; title?: string };
};

/**
 * ST-09 — Portail client & widget (specs/11). Reste à venir : visibilité KB sur
 * connexion, mode mot de passe, domaine custom (Pro), aperçu live.
 */
export default async function PortalSettingsPage() {
  const { tenant } = await requireAgent();
  const config = (tenant.portalConfig ?? {}) as PortalConfig;
  const accent =
    ((tenant.branding as { accentColor?: string } | null)?.accentColor ?? "#0B5F46");
  const widget = config.widget ?? {};
  const snippet = `<script src="https://${tenant.slug}.open-helpdesk.com/api/widget" async></script>`;

  const inputStyle = { borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" } as const;

  return (
    <div>
      <h1 className="mb-5 text-lg font-semibold">Portail client & widget</h1>

      <form action={savePortalConfig} className="flex max-w-xl flex-col gap-6">
        {/* Portail */}
        <fieldset className="rounded-lg border p-4" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
          <legend className="px-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            PORTAIL — {tenant.slug}.open-helpdesk.com/help
          </legend>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            TEXTE D'ACCUEIL
            <input
              name="welcomeText"
              defaultValue={config.welcomeText ?? ""}
              placeholder="Comment pouvons-nous vous aider ?"
              className="rounded-md border px-3 py-2 text-sm font-normal"
              style={inputStyle}
            />
          </label>
        </fieldset>

        {/* Widget */}
        <fieldset className="rounded-lg border p-4" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
          <legend className="px-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            WIDGET EMBARQUABLE
          </legend>
          <div className="flex flex-col gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="widgetEnabled" defaultChecked={widget.enabled !== false} />
              Activer le widget
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
                COULEUR
                <input
                  type="color"
                  name="widgetColor"
                  defaultValue={widget.color ?? accent}
                  className="h-9 w-full rounded-md border"
                  style={{ borderColor: "var(--line)" }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
                POSITION
                <select
                  name="widgetPosition"
                  defaultValue={widget.position ?? "right"}
                  className="rounded-md border px-2 py-2 text-sm font-normal"
                  style={inputStyle}
                >
                  <option value="right">En bas à droite</option>
                  <option value="left">En bas à gauche</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
                TITRE DU BOUTON
                <input
                  name="widgetTitle"
                  defaultValue={widget.title ?? "Besoin d'aide ?"}
                  className="rounded-md border px-2 py-2 text-sm font-normal"
                  style={inputStyle}
                />
              </label>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
                SNIPPET À COLLER SUR VOTRE SITE
              </p>
              <pre
                className="overflow-x-auto rounded-md border p-3 font-mono text-xs"
                style={{ background: "var(--sunk)", borderColor: "var(--line)" }}
              >
                {snippet}
              </pre>
            </div>
          </div>
        </fieldset>

        <button
          type="submit"
          className="self-start rounded-md px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Enregistrer
        </button>
      </form>
    </div>
  );
}
