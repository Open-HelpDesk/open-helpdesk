import { db, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { getTenantSlug } from "@/lib/tenant";
import { LoginForm } from "./login-form";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";

/**
 * AG-01 — Login (agent space design): 40×40 "A" logo + workspace name above it,
 * 400 px card padding 24 radius 10, email + password ("Forgot password?"
 * link), error with --dang border, "OR" separator, Google/Microsoft SSO,
 * "Powered by Open HelpDesk" footer.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; accepted?: string }>;
}) {
  const t = await getT();
  const { error, accepted } = await searchParams;
  const slug = await getTenantSlug();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  const workspaceName = tenant?.name ?? "Open HelpDesk";
  const branding = (tenant?.branding ?? {}) as { accentColor?: string };
  const accent = branding.accentColor || "var(--acc)";

  return (
    <main className="ohd flex min-h-screen items-center justify-center p-4">
      <div className="ohd-rise-slow w-full" style={{ maxWidth: 400 }}>
        {accepted === "1" && (
          <p
            className="mb-4 rounded-md px-3.5 py-2.5 text-center"
            style={{ fontSize: 13, background: "var(--ok-t)", color: "var(--ok)" }}
          >
            {t("app.login.invited")}
          </p>
        )}
        {(tenant?.status === "suspended" || tenant?.status === "deleting") && (
          <p
            className="mb-4 rounded-md px-3.5 py-2.5 text-center"
            style={{ fontSize: 13, background: "var(--dang-t)", color: "var(--dang)" }}
          >
            {t("app.login.suspended")}
          </p>
        )}
        {/* Logo + workspace name */}
        <div className="mb-5 flex flex-col items-center gap-2.5">
          <div
            className="flex items-center justify-center font-bold text-white"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: accent,
              fontSize: 18,
            }}
            aria-hidden
          >
            {workspaceName[0]?.toUpperCase()}
          </div>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{workspaceName}</p>
        </div>

        <div
          className="border shadow-sm"
          style={{
            background: "var(--panel)",
            borderColor: "var(--line)",
            borderRadius: 10,
            padding: 24,
          }}
        >
          {/* The provider is placed here: /login sits under no shell that
            carries it, and the form is a client component. */}
        <I18nProvider locale={t.locale} dict={t.dict}>
          <LoginForm initialError={error} />
        </I18nProvider>
        </div>

        <p className="mt-4 text-center" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          {t("chrome.poweredBy", { product: "Open HelpDesk" })}
        </p>
      </div>
    </main>
  );
}
