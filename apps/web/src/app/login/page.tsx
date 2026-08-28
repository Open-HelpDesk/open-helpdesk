import { headers } from "next/headers";
import { requireTenant } from "@/lib/tenant";
import { LoginForm } from "./login-form";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";

/**
 * AG-01 — Login (V2): a brand-tinted gradient, a 400 px column, the workspace
 * identity above a radius-16 card that leads with SSO.
 *
 * The mockup titles the screen "Sign in to the agent workspace" and puts the
 * host underneath. The title says the workspace name instead — the password
 * field already says what the screen is for, and the name is what tells an
 * agent they are on their own workspace. The host stays as the subtitle: it is
 * the line that distinguishes this page from a copy of it.
 *
 * The mockup's closing line, "a 2FA code will be asked after signing in", is not
 * reproduced: the agent workspace has no second factor. Announcing one would
 * promise a protection nobody gets.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; accepted?: string }>;
}) {
  const t = await getT();
  const { error, accepted } = await searchParams;
  // The one page that must never render for a workspace that does not exist:
  // a password field plus Google and Microsoft buttons, reachable under any
  // invented subdomain, is a phishing page wearing our certificate. It used to
  // fall back to the product name and render anyway (see requireTenant).
  const tenant = await requireTenant();
  const host = (await headers()).get("host") ?? "";
  const branding = (tenant.branding ?? {}) as { accentColor?: string; logoUrl?: string };
  const accent = branding.accentColor || "var(--brand)";

  return (
    <main
      className="ohd grid min-h-screen"
      style={{
        placeItems: "center",
        padding: 40,
        background: "linear-gradient(180deg,var(--brand-t) 0%,var(--canvas) 55%)",
      }}
    >
      <div
        className="ohd-rise-slow flex w-full flex-col"
        style={{ maxWidth: 400, gap: 18 }}
      >
        {accepted === "1" && (
          <p
            className="text-center"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 13,
              background: "var(--ok-t)",
              color: "var(--ok)",
            }}
          >
            {t("app.login.invited")}
          </p>
        )}
        {(tenant.status === "suspended" || tenant.status === "deleting") && (
          <p
            className="text-center"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 13,
              background: "var(--dang-t)",
              color: "var(--dang)",
            }}
          >
            {t("app.login.suspended")}
          </p>
        )}

        {/* Workspace identity — its logo when it has one, its initial otherwise. */}
        <div className="flex flex-col items-center" style={{ gap: 12 }}>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant asset, arbitrary origin
            <img
              src={branding.logoUrl}
              alt=""
              style={{ width: 40, height: 40, borderRadius: 10, objectFit: "contain" }}
            />
          ) : (
            <div
              className="grid place-items-center font-bold text-white"
              style={{ width: 40, height: 40, borderRadius: 10, background: accent, fontSize: 18 }}
              aria-hidden
            >
              {tenant.name[0]?.toUpperCase()}
            </div>
          )}
          <h1
            className="text-center"
            style={{
              fontFamily: "var(--font-title)",
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: "-.015em",
            }}
          >
            {tenant.name}
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{host}</p>
        </div>

        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: 24,
            boxShadow:
              "0 2px 4px rgba(13,28,23,.04), 0 24px 48px -20px rgba(11,95,70,.25)",
          }}
        >
          {/* The provider is placed here: /login sits under no shell that
              carries it, and the form is a client component. */}
          <I18nProvider locale={t.locale} dict={t.dict}>
            <LoginForm initialError={error} />
          </I18nProvider>
        </div>

        <p className="text-center" style={{ color: "var(--ink-3)", fontSize: 12.5 }}>
          {t("chrome.poweredBy", { product: "Open HelpDesk" })}
        </p>
      </div>
    </main>
  );
}
