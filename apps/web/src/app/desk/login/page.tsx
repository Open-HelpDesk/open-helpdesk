import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalTenant } from "@/lib/portal-auth";
import { getT } from "@/i18n/server";
import { getDeskViewer } from "../session";
import { requestDeskMagicLink } from "./actions";
import { BrandMark } from "@/components/desk/portal/brand-mark";

/**
 * Employee portal sign-in (spec 19 §5.3): one field, a magic link. No
 * password — an employee never has one with us. Already signed in as an
 * employee: straight to the catalogue.
 */
export default async function DeskLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; e?: string }>;
}) {
  const viewer = await getDeskViewer();
  if (viewer.kind === "employee") redirect("/desk");
  const t = await getT();
  const tenant = await getPortalTenant();
  const { sent, error, e } = await searchParams;
  const name = tenant?.name ?? "";

  return (
    <div
      className="grid min-h-screen place-items-center px-4 py-14"
      style={{ background: "linear-gradient(180deg, var(--brand-t) 0%, var(--canvas) 60%)" }}
    >
      <div className="sd-rise flex w-[414px] max-w-full flex-col gap-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <span className="sd-title text-[18px]">{name}</span>
          </div>
          <h1 className="sd-title text-[24px] leading-tight">{t("desk.portal.login.title")}</h1>
        </div>
        <div className="sd-card flex flex-col gap-4 p-[26px]" style={{ borderRadius: 18 }}>
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div
                className="grid h-[52px] w-[52px] place-items-center rounded-full text-[23px]"
                style={{ background: "var(--brand-t)", color: "var(--brand)" }}
                aria-hidden
              >
                ✉
              </div>
              <p className="sd-title text-[20px]">{t("desk.portal.login.sentTitle")}</p>
              <p className="text-[14.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
                {e ? t("desk.portal.login.sentBody", { email: e }) : t("desk.portal.login.sentBodyNoEmail")}
              </p>
              <Link href="/desk/login" className="sd-link text-sm">
                {t("desk.portal.login.otherAddress")}
              </Link>
            </div>
          ) : (
            <>
              <p className="text-[14.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
                {t("desk.portal.login.intro")}
              </p>
              {error === "expired" && (
                <p
                  className="rounded-[11px] px-3.5 py-2.5 text-sm"
                  style={{ background: "var(--dang-t)", color: "var(--dang)" }}
                >
                  {t("desk.portal.login.expired")}
                </p>
              )}
              <form action={requestDeskMagicLink} className="flex flex-col gap-4">
                <div className="flex flex-col gap-[7px]">
                  <label htmlFor="sd-login-email" className="text-[13px] font-semibold" style={{ color: "var(--ink-2)" }}>
                    {t("desk.portal.login.email")}
                  </label>
                  <input
                    id="sd-login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="sd-input h-12 px-3.5 text-[15px]"
                  />
                </div>
                <button type="submit" className="sd-btn sd-btn-primary h-12 text-[15px]">
                  {t("desk.portal.login.send")}
                </button>
              </form>
            </>
          )}
        </div>
        <p className="text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
          {t("desk.portal.login.footer")}
        </p>
      </div>
    </div>
  );
}
