"use client";

/**
 * 236 px secondary navigation of the admin area (V2): groups in 11px/700 ink
 * spaced .12em, items on radius 9 that tint brand when current, EE badges on the
 * screens the Enterprise edition unlocks.
 *
 * The V1 "Settings" heading at the top is gone: the shell's breadcrumb already
 * says Administration, and the rail was repeating it.
 *
 * The mockup folds developers and billing into one "Developers & account" group.
 * They stay apart here because self-hosted has no billing at all — a group whose
 * title promises an account section that is not there reads worse than two
 * groups that each say what they hold.
 */
import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";
import type { Edition } from "@openhelpdesk/config";
import type { MessageKey } from "@/i18n/dictionaries/en";

type NavItem = { labelKey: MessageKey; href: string; ee?: boolean };
type NavGroup = { titleKey: MessageKey; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: "app.settingsNav.groupWorkspace",
    items: [
      { labelKey: "app.settingsNav.itemGeneral", href: "/app/settings/general" },
      { labelKey: "app.settingsNav.itemTeam", href: "/app/settings/team" },
    ],
  },
  {
    titleKey: "app.settingsNav.groupChannels",
    items: [
      { labelKey: "app.settingsNav.itemEmail", href: "/app/settings/email" },
      { labelKey: "app.settingsNav.itemPortal", href: "/app/settings/portal" },
    ],
  },
  {
    titleKey: "app.settingsNav.groupProductivity",
    items: [
      { labelKey: "app.settingsNav.itemFields", href: "/app/settings/fields" },
      { labelKey: "app.settingsNav.itemAutomations", href: "/app/settings/automations" },
      { labelKey: "app.settingsNav.itemMacros", href: "/app/settings/macros" },
      { labelKey: "app.settingsNav.itemSla", href: "/app/settings/sla" },
      { labelKey: "app.settingsNav.itemCsat", href: "/app/settings/csat" },
    ],
  },
  {
    titleKey: "app.settingsNav.groupSecurity",
    items: [
      { labelKey: "app.settingsNav.itemAgentSso", href: "/app/settings/agent-sso", ee: true },
      { labelKey: "app.settingsNav.itemCustomerSso", href: "/app/settings/customer-sso", ee: true },
      { labelKey: "app.settingsNav.itemAudit", href: "/app/settings/audit", ee: true },
    ],
  },
  {
    titleKey: "app.settingsNav.groupDevelopers",
    items: [{ labelKey: "app.settingsNav.itemApi", href: "/app/settings/api" }],
  },
  {
    titleKey: "app.settingsNav.groupAccount",
    items: [{ labelKey: "app.settingsNav.itemBilling", href: "/app/settings/billing" }],
  },
];

export function SettingsNav({ edition }: { edition: Edition }) {
  const t = useT();
  const pathname = usePathname();

  // Self-hosted: no billing, so ST-11 has nothing to show.
  const groups =
    edition === "cloud"
      ? NAV_GROUPS
      : NAV_GROUPS.filter((group) => group.titleKey !== "app.settingsNav.groupAccount");

  return (
    <nav
      className="flex shrink-0 flex-col overflow-y-auto border-r"
      style={{
        width: 236,
        background: "var(--panel)",
        borderColor: "var(--line)",
        padding: "16px 10px",
        gap: 16,
      }}
    >
      {groups.map((group) => (
        <div key={group.titleKey} className="flex flex-col" style={{ gap: 1 }}>
          <p
            className="uppercase"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".12em",
              color: "var(--ink)",
              padding: "0 10px 7px",
            }}
          >
            {t(group.titleKey)}
          </p>
          <ul className="flex flex-col" style={{ gap: 1 }}>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="ohd-row flex items-center"
                    style={{
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 9,
                      fontSize: 13.5,
                      fontWeight: active ? 600 : 450,
                      "--row-bg": active ? "var(--brand-t)" : "transparent",
                      color: active ? "var(--brand)" : "var(--ink-2)",
                    } as CSSProperties}
                  >
                    <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                    {item.ee && (
                      <span
                        className="font-bold"
                        style={{
                          fontSize: 9.5,
                          letterSpacing: ".05em",
                          padding: "1px 6px",
                          borderRadius: 5,
                          background: "var(--viol-t)",
                          color: "var(--viol)",
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
