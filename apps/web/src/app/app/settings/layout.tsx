import Link from "next/link";
import { requireAgent } from "@/lib/session";

/**
 * Shell de l'administration (specs/11, shell v1.1) : navigation secondaire 220 px
 * groupée — Espace de travail, Canaux, Productivité, Sécurité, Développeurs, Compte.
 * Accès Owner/Admin uniquement.
 */
const NAV_GROUPS: { title: string; items: { label: string; href: string | null }[] }[] = [
  {
    title: "Espace de travail",
    items: [
      { label: "Général", href: null },
      { label: "Agents & équipes", href: "/app/settings/team" },
    ],
  },
  {
    title: "Canaux",
    items: [
      { label: "Email", href: null },
      { label: "Portail", href: null },
      { label: "Widget", href: null },
    ],
  },
  {
    title: "Productivité",
    items: [
      { label: "Champs & formulaires", href: null },
      { label: "Automatisations", href: "/app/settings/automations" },
      { label: "Macros", href: "/app/settings/macros" },
      { label: "SLA", href: "/app/settings/sla" },
      { label: "Satisfaction", href: "/app/settings/csat" },
    ],
  },
  {
    title: "Sécurité",
    items: [
      { label: "SSO des agents (EE)", href: null },
      { label: "SSO clients (EE)", href: null },
      { label: "Audit log (EE)", href: null },
    ],
  },
  {
    title: "Développeurs",
    items: [{ label: "API & webhooks", href: null }],
  },
  {
    title: "Compte",
    items: [{ label: "Abonnement", href: null }],
  },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { agent } = await requireAgent();

  if (agent.role !== "owner" && agent.role !== "admin") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm" style={{ color: "var(--mute)" }}>
          Les paramètres sont réservés aux rôles Owner et Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <nav
        className="w-56 shrink-0 overflow-y-auto border-r p-3"
        style={{ background: "var(--sunk)", borderColor: "var(--line)" }}
      >
        <p className="mb-3 px-2 text-sm font-semibold">Paramètres</p>
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-3">
            <p
              className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wider"
              style={{ color: "var(--mute)" }}
            >
              {group.title}
            </p>
            <ul className="flex flex-col">
              {group.items.map((item) =>
                item.href ? (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="block rounded-md px-2 py-1 text-[13px]"
                      style={{ color: "var(--ink)" }}
                    >
                      {item.label}
                    </Link>
                  </li>
                ) : (
                  <li
                    key={item.label}
                    className="px-2 py-1 text-[13px]"
                    style={{ color: "var(--mute)" }}
                    title="À venir"
                  >
                    {item.label}
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6">{children}</div>
      </div>
    </div>
  );
}
