import { getEdition } from "@openhelpdesk/config";
import { requireAgent } from "@/lib/session";
import { SettingsNav } from "@/components/settings-nav";
import { getT } from "@/i18n/server";

/**
 * Admin shell (ST-01 → ST-14): grouped 220 px
 * secondary navigation (ST-xx codes in mono, EE badges) +
 * content area with padding 26px 28px 40px. Owner/Admin access only.
 *
 * Local CSS: only the screen entrances specific to the admin area
 * (st-rise, st-slide, st-pop). The toggle and the hovers are shared
 * primitives (.ohd-toggle, .ohd-hover) — they are identical in both
 * mockups, and duplicating them here let them drift.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { agent } = await requireAgent();
  const t = await getT();

  if (agent.role !== "owner" && agent.role !== "admin") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
          {t("app.settings.shell.roleRestricted")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* `both` is not decorative: without it the screen shows for one frame at its
          final state before starting over from translateY(6px), and the entrance jumps. */}
      <style>{`
        @keyframes st-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .st-rise { animation: st-rise .18s ease both; }
        @keyframes st-slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        .st-slide { animation: st-slide .18s ease both; }
        @keyframes st-pop { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
        .st-pop { animation: st-pop .16s ease both; }
      `}</style>
      <SettingsNav edition={getEdition()} />
      {/* The padding and the max width live in PageShell, as in the design. */}
      <div className="min-w-0 flex-1 overflow-y-auto" style={{ background: "var(--canvas)" }}>
        {children}
      </div>
    </div>
  );
}
