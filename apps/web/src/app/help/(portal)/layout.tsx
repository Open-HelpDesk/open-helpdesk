import Link from "next/link";
import { entitlementsFor } from "@/lib/entitlements";
import { getPortalContact, getPortalTenant } from "@/lib/portal-auth";
import { getOrgAdminOrg } from "@/lib/portal-data";
import { portalSignOut } from "../actions";
import { initialsFr, shortNameFr } from "../portal-format";

/**
 * Chrome du portail client (maquette PT) : header 62 px (logo 30, liens 14.5,
 * pilule utilisateur) + rangée de navigation mobile (deux boutons h44, maquette
 * « narrow ») + footer « © {année} {tenant} / Propulsé par Open HelpDesk ».
 * /help/login et /help/auth vivent hors de ce groupe — sans chrome (PT-07).
 */
export default async function PortalChromeLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getPortalTenant();
  const session = await getPortalContact();
  const adminOrg = session ? await getOrgAdminOrg(session.tenant.id, session.contact.id) : null;
  const name = tenant?.name ?? "Centre d'aide";
  // « Masquer Propulsé par Open HelpDesk » : réglage ST-09, réservé au plan Pro.
  const hidePoweredBy =
    (tenant?.portalConfig as { hidePoweredBy?: boolean } | null)?.hidePoweredBy === true &&
    entitlementsFor(tenant?.plan ?? "").multiBrand;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <header
        className="flex-none border-b"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div className="flex h-[62px] items-center gap-3.5 px-8 max-sm:px-[18px]">
          <Link href="/help" className="flex items-center gap-2.5 hover:no-underline">
            <span
              className="grid h-[30px] w-[30px] place-items-center rounded-lg text-sm font-bold text-white"
              style={{ background: "var(--acc)" }}
            >
              {name[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="text-base font-semibold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
              {name}
            </span>
          </Link>
          <span className="flex-1" />
          <Link
            href="/help/requests/new"
            className="pt-navlink text-[14.5px] font-medium max-sm:hidden"
          >
            Soumettre une demande
          </Link>
          <Link href="/help/requests" className="pt-navlink text-[14.5px] font-medium max-sm:hidden">
            Mes demandes
          </Link>
          {session ? (
            <details className="pt-menu relative">
              <summary
                className="flex items-center gap-2 rounded-[22px] border py-[5px] pl-[11px] pr-1.5"
                style={{ borderColor: "var(--line)" }}
              >
                <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                  {shortNameFr(session.contact.name, session.contact.email)}
                </span>
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold"
                  style={{ background: "var(--open-t)", color: "var(--open)" }}
                >
                  {initialsFr(session.contact.name ?? session.contact.email)}
                </span>
              </summary>
              <div
                className="absolute right-0 top-[calc(100%+6px)] z-20 flex w-60 flex-col rounded-[10px] border p-1.5 shadow-[0_14px_40px_rgba(0,0,0,.14)]"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
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
                    Mon organisation
                  </Link>
                )}
                <form action={portalSignOut}>
                  <button
                    type="submit"
                    className="pt-menu-item w-full px-2.5 py-2 text-left text-[14.5px]"
                    style={{ color: "var(--ink)" }}
                  >
                    Se déconnecter
                  </button>
                </form>
              </div>
            </details>
          ) : (
            <Link
              href="/help/login"
              className="flex items-center gap-2 rounded-[22px] border py-[5px] pl-[11px] pr-1.5 hover:no-underline"
              style={{ borderColor: "var(--line)" }}
            >
              <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                Se connecter
              </span>
              <span
                className="grid h-6 w-6 place-items-center rounded-full"
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
        <div className="hidden gap-1.5 px-[18px] pb-2.5 max-sm:flex">
          <Link
            href="/help/requests/new"
            className="grid h-11 flex-1 place-items-center rounded-lg border text-sm font-medium hover:no-underline"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            Soumettre
          </Link>
          <Link
            href="/help/requests"
            className="grid h-11 flex-1 place-items-center rounded-lg border text-sm font-medium hover:no-underline"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            Mes demandes
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer
        className="flex-none border-t"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div
          className="flex flex-wrap items-center gap-3.5 px-8 py-[22px] text-[13.5px] max-sm:px-[18px]"
          style={{ color: "var(--ink-3)" }}
        >
          <span>
            © {new Date().getFullYear()} {name}
          </span>
          <span className="flex-1" />
          {!hidePoweredBy && (
            <span>
              Propulsé par{" "}
              <a href="https://open-helpdesk.com" className="pt-link">
                Open HelpDesk
              </a>
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
