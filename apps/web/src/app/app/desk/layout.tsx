import { requireAgent, isManager } from "@/lib/session";
import { entitlementsFor } from "@/lib/entitlements";
import { canUseDesk } from "@/lib/desk/it-guard";
import { deskNavCounts } from "@/lib/desk/it-data";
import { DeskNav } from "@/components/desk/it/desk-nav";
import { ToastProvider } from "@/components/desk/it/ui";
import { getT } from "@/i18n/server";

/**
 * The service desk section of the agent space (spec 19): the 220 px secondary
 * navigation and the pane its screens render in. The breadcrumb of the shared
 * topbar says "Service desk / <screen>"; each screen carries its own heading,
 * as everywhere else in the agent space.
 */
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const ent = entitlementsFor(tenant);

  if (!canUseDesk(agent.role) || !ent.serviceDesk) {
    const locked = !ent.serviceDesk;
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center" style={{ maxWidth: 420 }}>
          {locked && (
            <h1 style={{ fontFamily: "var(--font-title)", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>
              {t("desk.it.shell.lockedTitle")}
            </h1>
          )}
          <p className="mt-2" style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
            {locked ? t("desk.it.shell.lockedText") : t("desk.it.shell.roleRestricted")}
          </p>
        </div>
      </div>
    );
  }

  const counts = await deskNavCounts(tenant.id);

  return (
    <ToastProvider>
      <style>{`
        @keyframes sd-slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        .sd-slide { animation: sd-slide .18s ease both; }
        @keyframes sd-pop { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
        .sd-pop { animation: sd-pop .16s ease both; }
        .sd-revoke:hover { color: var(--dang) !important; }
      `}</style>
      <div className="flex h-full">
        <DeskNav
          counts={counts}
          isManager={isManager(agent.role)}
          locks={{
            licences: !ent.deskLicences,
            hardware: !ent.deskHardware,
            reviews: !ent.deskAccessReviews,
            shadow: !ent.deskShadowIt,
            lifecycle: !ent.deskLifecycle,
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden" style={{ background: "var(--canvas)" }}>
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
