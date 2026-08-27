import type { ReactNode } from "react";
import { getT } from "@/i18n/server";
import { requireTenant } from "@/lib/tenant";

/**
 * The workspace-branded card that /login, /forgot-password and /reset-password
 * share. Factored out so the three auth screens stay visually identical and a
 * change to the shell touches one place.
 *
 * requireTenant is called here: these pages render to anonymous visitors, so an
 * invented subdomain must 404 rather than show a branded form (see the domain
 * hardening of 27/08).
 */
export async function AuthCard({ children }: { children: ReactNode }) {
  const t = await getT();
  const tenant = await requireTenant();
  const workspaceName = tenant.name;
  const accent = (tenant.branding as { accentColor?: string } | null)?.accentColor || "var(--acc)";

  return (
    <main className="ohd flex min-h-screen items-center justify-center p-4">
      <div className="ohd-rise-slow w-full" style={{ maxWidth: 400 }}>
        <div className="mb-5 flex flex-col items-center gap-2.5">
          <div
            className="flex items-center justify-center font-bold text-white"
            style={{ width: 40, height: 40, borderRadius: 10, background: accent, fontSize: 18 }}
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
          {children}
        </div>

        <p className="mt-4 text-center" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          {t("chrome.poweredBy", { product: "Open HelpDesk" })}
        </p>
      </div>
    </main>
  );
}
