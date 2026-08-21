import Link from "next/link";
import { entitlementsFor } from "@/lib/entitlements";
import { getPortalContact, getPortalTenant } from "@/lib/portal-auth";
import { getOrgAdminOrg } from "@/lib/portal-data";
import { portalSignOut } from "../actions";
import { getT } from "@/i18n/server";
import { initials, shortName } from "@/i18n/format";

/**
 * Chrome du portail client (maquette PT) : header 66 px (logo 32, marque en serif
 * 19, liens 14.5, pilule utilisateur) + rangée de navigation mobile (deux boutons
 * h46, maquette « narrow ») + footer « © {année} {tenant} / Propulsé par Open HelpDesk ».
 * /help/login et /help/auth vivent hors de ce groupe — sans chrome (PT-07).
 */
export default async function PortalChromeLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const tenant = await getPortalTenant();
  const session = await getPortalContact();
  const adminOrg = session ? await getOrgAdminOrg(session.tenant.id, session.contact.id) : null;
  const name = tenant?.name ?? t("chrome.defaultName");
  const logo = (tenant?.branding as { logoUrl?: string } | null)?.logoUrl ?? null;
  // « Masquer Propulsé par Open HelpDesk » : réglage ST-09, réservé au plan Pro.
  const hidePoweredBy =
    tenant != null &&
    (tenant.portalConfig as { hidePoweredBy?: boolean } | null)?.hidePoweredBy === true &&
    entitlementsFor(tenant).multiBrand;

  const [poweredBefore, poweredAfter] = t.parts("chrome.poweredBy", "product");

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <header
        className="flex-none border-b"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
      >
        <div className="flex h-[66px] items-center gap-4 px-9 max-sm:px-[18px]">
          <Link href="/help" className="flex items-center gap-[11px] hover:no-underline">
            {/* Le logo du tenant (ST-01) remplace le carré à l'initiale. Il
                n'est pas passé à l'optimiseur d'images de Next : un SVG ou un
                ICO déposé par le tenant n'y survivrait pas, et le fichier est
                déjà servi avec un cache définitif — son URL porte un UUID qui
                change à chaque remplacement. */}
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element -- voir ci-dessus */
              <img
                src={logo}
                alt={name}
                className="h-8 w-8 rounded-[9px] object-contain"
                style={{ background: "var(--sunk)" }}
              />
            ) : (
              <span
                className="pt-title grid h-8 w-8 place-items-center rounded-[9px] text-base text-white"
                style={{ background: "var(--cta-a)", boxShadow: "var(--sh-1)" }}
              >
                {name[0]?.toUpperCase() ?? "?"}
              </span>
            )}
            <span
              className="pt-title text-[19px] tracking-[-0.01em]"
              style={{ color: "var(--ink)" }}
            >
              {name}
            </span>
          </Link>
          <span className="flex-1" />
          <div className="flex items-center gap-[22px] max-sm:hidden">
            <Link href="/help/requests/new" className="pt-navlink text-[14.5px] font-medium">
              {t("chrome.submitRequest")}
            </Link>
            <Link href="/help/requests" className="pt-navlink text-[14.5px] font-medium">
              {t("chrome.myRequests")}
            </Link>
          </div>
          {session ? (
            <details className="pt-menu relative">
              <summary
                className="pt-pill flex items-center gap-[9px] rounded-full py-1 pl-[13px] pr-[5px]">
                <span className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
                  {shortName(session.contact.name, session.contact.email)}
                </span>
                <span
                  className="grid h-[26px] w-[26px] place-items-center rounded-full text-[10px] font-bold"
                  style={{ background: "var(--open-t)", color: "var(--open)" }}
                >
                  {initials(session.contact.name ?? session.contact.email)}
                </span>
              </summary>
              <div
                className="absolute right-0 top-[calc(100%+6px)] z-20 flex w-60 flex-col rounded-2xl border p-1.5"
                style={{
                  background: "var(--panel)",
                  borderColor: "var(--line)",
                  boxShadow: "var(--sh-3)",
                }}
              >
                <p
                  className="truncate px-2.5 pb-1.5 pt-1 text-[12.5px]"
                  style={{ color: "var(--ink-3)" }}
                >
                  {session.contact.email}
                </p>
                {adminOrg && (
                  <Link
                    href="/help/organization"
                    className="pt-menu-item px-2.5 py-2 text-[14.5px] hover:no-underline"
                    style={{ color: "var(--ink)" }}
                  >
                    {t("chrome.myOrganization")}
                  </Link>
                )}
                <form action={portalSignOut}>
                  <button
                    type="submit"
                    className="pt-menu-item w-full px-2.5 py-2 text-left text-[14.5px]"
                    style={{ color: "var(--ink)" }}
                  >
                    {t("chrome.signOut")}
                  </button>
                </form>
              </div>
            </details>
          ) : (
            <Link
              href="/help/login"
              className="pt-pill flex items-center gap-[9px] rounded-full py-1 pl-[13px] pr-[5px] hover:no-underline"
            >
              <span className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
                {t("chrome.signIn")}
              </span>
              <span
                className="grid h-[26px] w-[26px] place-items-center rounded-full"
                style={{ background: "var(--sunk)", color: "var(--ink-3)" }}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
                </svg>
              </span>
            </Link>
          )}
        </div>

        {/* Rangée mobile de la maquette : les deux liens du header en boutons h44. */}
        <div className="hidden gap-2 px-[18px] pb-3 max-sm:flex">
          <Link
            href="/help/requests/new"
            className="grid h-[46px] flex-1 place-items-center rounded-[10px] border text-sm font-medium hover:no-underline"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            {t("chrome.submitShort")}
          </Link>
          <Link
            href="/help/requests"
            className="grid h-[46px] flex-1 place-items-center rounded-[10px] border text-sm font-medium hover:no-underline"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            {t("chrome.myRequests")}
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer
        className="flex-none border-t"
        style={{ background: "var(--canvas)", borderColor: "var(--line-2)" }}
      >
        <div
          className="flex flex-wrap items-center gap-4 px-9 py-6 text-[13px] max-sm:px-[18px]"
          style={{ color: "var(--ink-3)" }}
        >
          <span>{t("chrome.copyright", { year: String(new Date().getFullYear()), name })}</span>
          <span className="flex-1" />
          {!hidePoweredBy && (
            /* Le nom du produit est un lien : la phrase est découpée autour de
               son emplacement pour que chaque langue garde son ordre de mots. */
            <span>
              {poweredBefore}
              <a href="https://open-helpdesk.com" className="pt-link">
                Open HelpDesk
              </a>
              {poweredAfter}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
