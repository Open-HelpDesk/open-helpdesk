import { requireAgent } from "@/lib/session";
import { SettingsNav } from "@/components/settings-nav";
import { getT } from "@/i18n/server";

/**
 * Shell de l'administration (ST-01 → ST-14, design-notes/administration.md) :
 * navigation secondaire 220 px groupée (codes ST-xx en mono, badges EE) +
 * zone de contenu padding 26px 28px 40px. Accès Owner/Admin uniquement.
 *
 * CSS local : uniquement les entrées d'écran propres à l'administration
 * (st-rise, st-slide, st-pop). L'interrupteur et les survols sont des primitives
 * partagées (.ohd-toggle, .ohd-hover) — ils sont identiques dans les deux
 * maquettes, et les dupliquer ici les laissait dériver.
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
      {/* `both` n'est pas décoratif : sans lui l'écran s'affiche une frame à son
          état final avant de repartir de translateY(6px), et l'entrée saute. */}
      <style>{`
        @keyframes st-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .st-rise { animation: st-rise .18s ease both; }
        @keyframes st-slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        .st-slide { animation: st-slide .18s ease both; }
        @keyframes st-pop { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
        .st-pop { animation: st-pop .16s ease both; }
      `}</style>
      <SettingsNav />
      {/* Le padding et la largeur maximale vivent dans PageShell, comme dans le design. */}
      <div className="min-w-0 flex-1 overflow-y-auto" style={{ background: "var(--canvas)" }}>
        {children}
      </div>
    </div>
  );
}
