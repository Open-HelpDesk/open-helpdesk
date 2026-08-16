import Link from "next/link";
import { getPortalContact, getPortalTenant } from "@/lib/portal-auth";
import { portalSignOut } from "./actions";

/**
 * Shell du portail client (specs/12) : surface publique aux couleurs du tenant,
 * volontairement simple et aérée. Header : logo, « Soumettre une demande »,
 * « Mes demandes », menu compte. Footer « Propulsé par Open HelpDesk ».
 * Corps 16 px (vs 14 px côté agent). L'accent du TENANT remplace l'accent produit.
 */
export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getPortalTenant();
  const session = await getPortalContact();
  const accent =
    ((tenant?.branding as { accentColor?: string } | null)?.accentColor ?? "#0B5F46");

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ fontSize: 16, ["--acc" as never]: accent }}
    >
      <header
        className="border-b"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
          <Link href="/help" className="flex items-center gap-2 font-semibold">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold text-white"
              style={{ background: "var(--acc)" }}
            >
              {tenant?.name[0]?.toUpperCase() ?? "?"}
            </span>
            {tenant?.name ?? "Centre d'aide"}
          </Link>
          <span className="flex-1" />
          <Link href="/help/requests/new" className="text-sm font-medium" style={{ color: "var(--acc)" }}>
            Soumettre une demande
          </Link>
          <Link href="/help/requests" className="text-sm font-medium">
            Mes demandes
          </Link>
          {session ? (
            <form action={portalSignOut}>
              <button
                type="submit"
                className="text-sm"
                style={{ color: "var(--mute)" }}
                title={session.contact.email}
              >
                Se déconnecter
              </button>
            </form>
          ) : (
            <Link href="/help/login" className="text-sm" style={{ color: "var(--mute)" }}>
              Connexion
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>

      <footer className="py-6 text-center text-xs" style={{ color: "var(--mute)" }}>
        Propulsé par Open HelpDesk
      </footer>
    </div>
  );
}
