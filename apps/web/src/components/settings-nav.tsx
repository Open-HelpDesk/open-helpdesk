"use client";

/**
 * 220 px secondary navigation of the admin area (shared template):
 * "Settings" title 15px/600, 10.5px/700 uppercase groups, 13px items with EE
 * badges on the screens reserved for the Pro plan.
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
      className="shrink-0 overflow-y-auto border-r"
      style={{ width: 220, background: "var(--bg)", borderColor: "var(--line)", paddingBottom: 18 }}
    >
      <p
        className="font-semibold"
        style={{ fontSize: 15, color: "var(--ink)", padding: "16px 16px 6px" }}
      >
        {t("app.shell.settings")}
      </p>
      {groups.map((group) => (
        <div key={group.titleKey}>
          <p
            className="font-bold uppercase"
            style={{
              fontSize: 10.5,
              letterSpacing: "0.07em",
              color: "var(--ink-3)",
              padding: "12px 16px 5px",
            }}
          >
            {t(group.titleKey)}
          </p>
          <ul className="flex flex-col" style={{ padding: "0 8px" }}>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="ohd-row flex items-center gap-2"
                    style={{
                      padding: "7px 9px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      "--row-bg": active ? "var(--acc-t)" : "transparent",
                      color: active ? "var(--acc)" : "var(--ink)",
                    } as CSSProperties}
                  >
                    <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
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
