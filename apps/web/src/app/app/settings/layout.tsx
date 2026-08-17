import { requireAgent } from "@/lib/session";
import { SettingsNav } from "@/components/settings-nav";

/**
 * Shell de l'administration (ST-01 → ST-14, design-notes/administration.md) :
 * navigation secondaire 220 px groupée (codes ST-xx en mono, badges EE) +
 * zone de contenu padding 26px 28px 40px. Accès Owner/Admin uniquement.
 * CSS local : st-rise (transition d'écran), st-slide (drawer), toggles 34×20.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { agent } = await requireAgent();

  if (agent.role !== "owner" && agent.role !== "admin") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          Les paramètres sont réservés aux rôles Owner et Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <style>{`
        @keyframes st-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .st-rise { animation: st-rise .18s ease; }
        @keyframes st-slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        .st-slide { animation: st-slide .18s ease; }
        @keyframes st-pop { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
        .st-pop { animation: st-pop .16s ease; }
        .st-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
        .st-toggle .st-knob {
          flex: none; position: relative; width: 34px; height: 20px; margin-top: 1px;
          border-radius: 999px; background: var(--line); transition: background .15s ease;
        }
        .st-toggle .st-knob::after {
          content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
          border-radius: 999px; background: var(--bg); box-shadow: 0 1px 2px rgba(17,33,28,.2);
          transition: left .15s ease;
        }
        .st-toggle input:checked + .st-knob { background: var(--acc); }
        .st-toggle input:checked + .st-knob::after { left: 16px; }
      `}</style>
      <SettingsNav />
      <div className="min-w-0 flex-1 overflow-y-auto" style={{ background: "var(--canvas)" }}>
        <div style={{ padding: "26px 28px 40px" }}>{children}</div>
      </div>
    </div>
  );
}
