import { getPortalTenant } from "@/lib/portal-auth";
import { getT } from "@/i18n/server";
// Le widget vit hors du groupe /help : il charge lui-même les styles .pt-* du portail.
import "../help/portal.css";

/**
 * Widget embarquable (aperçu ST-09 « Portail & widget ») — rendu dans l'iframe,
 * hors chrome du portail : bandeau d'accent portant le titre du widget, formulaire
 * compact (email / sujet / message / pièce jointe), bouton d'accent pleine largeur.
 * Palette du portail (.surface-portal), accent = couleur du widget puis du tenant.
 * POST multipart vers /api/portal/widget-submit (noms de champs inchangés).
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Accent du design system : on laisse alors les tokens de .surface-portal faire foi. */
const DEFAULT_ACCENT = "#0b5f46";

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const t = await getT();
  const tenant = await getPortalTenant();
  const { sent } = await searchParams;
  if (!tenant) return null;

  const config = (tenant.portalConfig ?? {}) as {
    welcomeText?: string;
    widget?: { color?: string; title?: string };
  };
  const widget = config.widget ?? {};
  const candidate = HEX.test(widget.color ?? "")
    ? widget.color!
    : ((tenant.branding as { accentColor?: string } | null)?.accentColor ?? "");
  const accent =
    HEX.test(candidate) && candidate.toLowerCase() !== DEFAULT_ACCENT ? candidate : null;
  // Mêmes replis que l'accueil du portail : le texte réglé dans ST-09 prime,
  // sinon la traduction. C'est ici que le widget divergeait — il retombait sur
  // du français en dur pendant que /help retombait sur t("home.title").
  const title = widget.title?.trim() || t("widget.defaultTitle");
  const intro = config.welcomeText?.trim() || t("home.title");

  return (
    <div
      className="surface-portal flex min-h-screen flex-col"
      style={{
        fontSize: 15,
        lineHeight: 1.55,
        background: "var(--panel)",
        color: "var(--ink)",
        ...(accent ? ({ "--acc": accent, "--acc-2": accent } as React.CSSProperties) : {}),
      }}
    >
      <header
        className="flex-none px-4 py-3.5 text-[15px] font-semibold text-white"
        style={{ background: "var(--acc)" }}
      >
        {title}
      </header>

      {sent ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-[11px] p-6 text-center">
          <span
            className="grid h-11 w-11 place-items-center rounded-full text-[22px]"
            style={{ background: "var(--ok-t)", color: "var(--ok)" }}
          >
            ✓
          </span>
          <p className="text-[19px] font-semibold tracking-[-0.02em]">{t("submitted.title")}</p>
          <p className="text-[14.5px]" style={{ color: "var(--ink-2)", textWrap: "pretty" }}>
            {t("widget.sentBody")}
          </p>
          <a href="/widget" className="pt-link text-sm">
            {t("widget.another")}
          </a>
        </main>
      ) : (
        <main className="flex flex-1 flex-col gap-[13px] p-4">
          <p className="text-[13.5px]" style={{ color: "var(--ink-2)", textWrap: "pretty" }}>
            {intro}
          </p>
          <form
            action="/api/portal/widget-submit"
            method="post"
            encType="multipart/form-data"
            className="flex flex-1 flex-col gap-[9px]"
          >
            <label className="sr-only" htmlFor="ohd-w-email">
              {t("newRequest.email")}
            </label>
            <input
              id="ohd-w-email"
              name="email"
              type="email"
              required
              placeholder={t("newRequest.email")}
              className="pt-input h-[42px] px-[13px] text-[14.5px]"
            />
            <label className="sr-only" htmlFor="ohd-w-subject">
              {t("newRequest.subject")}
            </label>
            <input
              id="ohd-w-subject"
              name="subject"
              required
              placeholder={t("newRequest.subject")}
              className="pt-input h-[42px] px-[13px] text-[14.5px]"
            />
            <label className="sr-only" htmlFor="ohd-w-body">
              {t("widget.messageLabel")}
            </label>
            <textarea
              id="ohd-w-body"
              name="body"
              required
              placeholder={t("widget.messagePlaceholder")}
              className="pt-input min-h-[104px] flex-1 resize-y p-[13px] text-[14.5px] leading-[1.6]"
            />
            <label className="flex cursor-pointer flex-col gap-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
              📎 {t("widget.attach")}
              <input name="files" type="file" className="block w-full text-[12.5px]" />
            </label>
            <button
              type="submit"
              className="mt-1 grid h-[46px] w-full flex-none place-items-center rounded-[9px] text-[15px] font-semibold text-white"
              style={{ background: "var(--acc)" }}
            >
              {t("newRequest.send")}
            </button>
          </form>
        </main>
      )}
    </div>
  );
}
