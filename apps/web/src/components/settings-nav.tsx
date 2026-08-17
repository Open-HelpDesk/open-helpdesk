"use client";

/**
 * Navigation secondaire 220 px de l'administration (gabarit commun) :
 * titre « Paramètres » 15px/600, groupes 10.5px/700 uppercase, items 13px avec
 * badges EE sur les écrans réservés au plan Pro.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href: string; ee?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Espace de travail",
    items: [
      { label: "Général", href: "/app/settings/general" },
      { label: "Agents & équipes", href: "/app/settings/team" },
    ],
  },
  {
    title: "Canaux",
    items: [
      { label: "Email", href: "/app/settings/email" },
      { label: "Portail & widget", href: "/app/settings/portal" },
    ],
  },
  {
    title: "Productivité",
    items: [
      { label: "Champs & formulaires", href: "/app/settings/fields" },
      { label: "Automatisations", href: "/app/settings/automations" },
      { label: "Macros", href: "/app/settings/macros" },
      { label: "SLA", href: "/app/settings/sla" },
      { label: "Satisfaction", href: "/app/settings/csat" },
    ],
  },
  {
    title: "Sécurité",
    items: [
      { label: "SSO des agents", href: "/app/settings/agent-sso", ee: true },
      { label: "SSO clients", href: "/app/settings/customer-sso", ee: true },
      { label: "Audit log", href: "/app/settings/audit", ee: true },
    ],
  },
  {
    title: "Développeurs",
    items: [{ label: "API & webhooks", href: "/app/settings/api" }],
  },
  {
    title: "Compte",
    items: [{ label: "Abonnement", href: "/app/settings/billing" }],
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
                <li key={item.href}>
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
