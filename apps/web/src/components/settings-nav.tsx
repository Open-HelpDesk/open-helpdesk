"use client";

/**
 * Navigation secondaire 220 px de l'administration (gabarit commun) :
 * titre « Paramètres » 15px/600, groupes 10.5px/700 uppercase, items 13px avec
 * code ST-xx en mono 9.5px devant le libellé, badges EE sur ST-13/14/12.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { code: string; label: string; href: string; ee?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Espace de travail",
    items: [
      { code: "ST-01", label: "Général", href: "/app/settings/general" },
      { code: "ST-02", label: "Agents & équipes", href: "/app/settings/team" },
    ],
  },
  {
    title: "Canaux",
    items: [
      { code: "ST-03", label: "Email", href: "/app/settings/email" },
      { code: "ST-09", label: "Portail & widget", href: "/app/settings/portal" },
    ],
  },
  {
    title: "Productivité",
    items: [
      { code: "ST-04", label: "Champs & formulaires", href: "/app/settings/fields" },
      { code: "ST-05", label: "Automatisations", href: "/app/settings/automations" },
      { code: "ST-06", label: "Macros", href: "/app/settings/macros" },
      { code: "ST-07", label: "SLA", href: "/app/settings/sla" },
      { code: "ST-08", label: "Satisfaction", href: "/app/settings/csat" },
    ],
  },
  {
    title: "Sécurité",
    items: [
      { code: "ST-13", label: "SSO des agents", href: "/app/settings/agent-sso", ee: true },
      { code: "ST-14", label: "SSO clients", href: "/app/settings/customer-sso", ee: true },
      { code: "ST-12", label: "Audit log", href: "/app/settings/audit", ee: true },
    ],
  },
  {
    title: "Développeurs",
    items: [{ code: "ST-10", label: "API & webhooks", href: "/app/settings/api" }],
  },
  {
    title: "Compte",
    items: [{ code: "ST-11", label: "Abonnement", href: "/app/settings/billing" }],
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      className="shrink-0 overflow-y-auto border-r"
      style={{ width: 220, background: "var(--bg)", borderColor: "var(--line)", paddingBottom: 18 }}
    >
      <p
        className="font-semibold"
        style={{ fontSize: 15, color: "var(--ink)", padding: "16px 16px 6px" }}
      >
        Paramètres
      </p>
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p
            className="font-bold uppercase"
            style={{
              fontSize: 10.5,
              letterSpacing: "0.07em",
              color: "var(--ink-3)",
              padding: "12px 16px 5px",
            }}
          >
            {group.title}
          </p>
          <ul className="flex flex-col" style={{ padding: "0 8px" }}>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.code}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2"
                    style={{
                      padding: "7px 9px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      background: active ? "var(--acc-t)" : "transparent",
                      color: active ? "var(--acc)" : "var(--ink)",
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{ fontSize: 9.5, color: "var(--ink-3)", minWidth: 34 }}
                    >
                      {item.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.ee && (
                      <span
                        className="rounded-full font-bold"
                        style={{
                          fontSize: 9.5,
                          padding: "1px 6px",
                          background: "var(--new-t)",
                          color: "var(--new)",
                        }}
                      >
                        EE
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
