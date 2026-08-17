import Link from "next/link";
import { getPortalTenant } from "@/lib/portal-auth";
import { requestMagicLink } from "../actions";

/**
 * PT-07 — Connexion portail : une seule saisie, l'email — lien magique par défaut,
 * sans chrome. Reste à venir (v1.1) : découverte par domaine → redirection SSO (Lot 5b),
 * mode mot de passe optionnel (ST-09).
 */
export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; e?: string }>;
}) {
  const tenant = await getPortalTenant();
  const { sent, error, e } = await searchParams;
  const name = tenant?.name ?? "Centre d'aide";

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="pt-rise flex w-[400px] max-w-full flex-col gap-[18px]">
        <div className="flex flex-col items-center gap-[11px]">
          <div
            className="grid h-[42px] w-[42px] place-items-center rounded-[11px] text-lg font-bold text-white"
            style={{ background: "var(--acc)" }}
          >
            {name[0]?.toUpperCase() ?? "?"}
          </div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Suivre vos demandes</h1>
        </div>

        <div
          className="flex flex-col gap-[15px] rounded-xl border p-6"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          {sent ? (
            <div className="flex flex-col items-center gap-[11px] py-2 text-center">
              <div
                className="grid h-12 w-12 place-items-center rounded-full text-[22px]"
                style={{ background: "var(--acc-t)", color: "var(--acc)" }}
              >
                ✉
              </div>
              <p className="text-[17px] font-semibold">Consultez votre boîte de réception</p>
              <p className="text-[15px]" style={{ color: "var(--ink-2)", textWrap: "pretty" }}>
                Nous avons envoyé un lien de connexion{e ? ` à ${e}` : ""}. Il expire dans
                15 minutes.
              </p>
              <Link href="/help/login" className="text-sm" style={{ color: "var(--acc-2)" }}>
                Utiliser une autre adresse
              </Link>
            </div>
          ) : (
            <>
              <p className="text-[15px]" style={{ color: "var(--ink-2)", textWrap: "pretty" }}>
                Saisissez votre email : nous vous enverrons un lien de connexion. Aucun mot de
                passe à retenir.
              </p>
              {error === "expired" && (
                <p
                  className="rounded-[9px] px-3 py-2.5 text-sm"
                  style={{ background: "var(--dang-t)", color: "var(--dang)" }}
                >
                  Ce lien est expiré ou invalide. Demandez-en un nouveau.
                </p>
              )}
              <form action={requestMagicLink} className="flex flex-col gap-[15px]">
                <div className="flex flex-col gap-[7px]">
                  <label
                    htmlFor="pt-login-email"
                    className="text-[13.5px] font-semibold"
                    style={{ color: "var(--ink-2)" }}
                  >
                    Email
                  </label>
                  <input
                    id="pt-login-email"
                    name="email"
                    type="email"
                    required
                    className="pt-input h-[46px] px-[13px] text-[15.5px]"
                  />
                </div>
                <button
                  type="submit"
                  className="grid h-[46px] place-items-center rounded-[9px] text-[15px] font-semibold text-white"
                  style={{ background: "var(--acc)" }}
                >
                  Recevoir le lien
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[13.5px]" style={{ color: "var(--ink-3)" }}>
          Pas encore de demande ? Votre compte est créé automatiquement au premier envoi.
        </p>
      </div>
    </div>
  );
}
