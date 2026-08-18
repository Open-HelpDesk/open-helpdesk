import Link from "next/link";
import { getPortalTenant } from "@/lib/portal-auth";
import { requestMagicLink } from "../actions";
import { getT } from "@/i18n/server";

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
  const t = await getT();
  const tenant = await getPortalTenant();
  const { sent, error, e } = await searchParams;
  const name = tenant?.name ?? t("chrome.defaultName");

  return (
    <div
      className="grid min-h-screen place-items-center px-6 py-14"
      style={{ background: "linear-gradient(180deg, var(--acc-t) 0%, var(--canvas) 60%)" }}
    >
      <div className="pt-rise flex w-[414px] max-w-full flex-col gap-5">
        <div className="flex flex-col items-center gap-[13px]">
          <div
            className="pt-title grid h-[46px] w-[46px] place-items-center rounded-[13px] text-[21px] font-semibold text-white"
            style={{ background: "var(--cta-a)", boxShadow: "var(--sh-2)" }}
          >
            {name[0]?.toUpperCase() ?? "?"}
          </div>
          <h1 className="pt-title text-2xl tracking-[-0.015em]">{t("login.title")}</h1>
        </div>

        <div
          className="flex flex-col gap-4 rounded-[18px] border p-[26px]"
          style={{
            background: "var(--panel)",
            borderColor: "var(--line)",
            boxShadow: "var(--sh-3)",
          }}
        >
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div
                className="grid h-[52px] w-[52px] place-items-center rounded-full text-[23px]"
                style={{ background: "var(--acc-t)", color: "var(--acc)" }}
              >
                ✉
              </div>
              <p className="pt-title text-xl">{t("login.sentTitle")}</p>
              <p
                className="text-[15px] leading-[1.6]"
                style={{ color: "var(--ink-2)", textWrap: "pretty" }}
              >
                {e ? t("login.sentBody", { email: e }) : t("login.sentBodyNoEmail")}
              </p>
              <Link
                href="/help/login"
                className="text-sm font-medium"
                style={{ color: "var(--acc-2)" }}
              >
                {t("login.otherAddress")}
              </Link>
            </div>
          ) : (
            <>
              <p
                className="text-[15px] leading-[1.6]"
                style={{ color: "var(--ink-2)", textWrap: "pretty" }}
              >
                {t("login.magicIntro")}
              </p>
              {error === "expired" && (
                <p
                  className="rounded-[11px] px-3.5 py-2.5 text-sm"
                  style={{ background: "var(--dang-t)", color: "var(--dang)" }}
                >
                  {t("login.expired")}
                </p>
              )}
              <form action={requestMagicLink} className="flex flex-col gap-4">
                <div className="flex flex-col gap-[7px]">
                  <label
                    htmlFor="pt-login-email"
                    className="text-[13.5px] font-semibold"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {t("login.email")}
                  </label>
                  <input
                    id="pt-login-email"
                    name="email"
                    type="email"
                    required
                    className="pt-input h-12 px-3.5 text-[15.5px]"
                  />
                </div>
                <button
                  type="submit"
                  className="grid h-12 place-items-center rounded-[11px] text-[15px] font-semibold text-white"
                  style={{ background: "var(--cta-a)" }}
                >
                  {t("login.sendLink")}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[13.5px]" style={{ color: "var(--ink-3)" }}>
          {t("login.footer")}
        </p>
      </div>
    </div>
  );
}
