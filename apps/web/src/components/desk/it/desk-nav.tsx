"use client";

/**
 * The service desk's 220 px secondary navigation (spec 19, agent shell):
 * five groups — Requests, Assets, Governance, Lifecycle, Settings — with the
 * design's counters. A module the workspace does not include stays listed with
 * a lock: its page explains what is missing instead of answering a 404.
 */
import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";
import type { DeskNavCounts } from "@/lib/desk/it-data";

export type DeskNavLocks = {
  licences: boolean;
  hardware: boolean;
  reviews: boolean;
  shadow: boolean;
  lifecycle: boolean;
};

type Item = {
  key: string;
  href: string;
  labelKey: MessageKey;
  count?: string;
  countTone?: string;
  locked?: boolean;
  exact?: string[];
};

export function DeskNav({ counts, locks, isManager }: { counts: DeskNavCounts; locks: DeskNavLocks; isManager: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const n = (v: number) => (v > 0 ? t.fmt.number(v) : undefined);

  const groups: Array<{ titleKey: MessageKey; items: Item[] }> = [
    {
      titleKey: "desk.it.nav.groupRequests",
      items: [
        { key: "requests", href: "/app/desk", labelKey: "desk.it.nav.requests", count: n(counts.openRequests), exact: ["/app/desk", "/app/desk/requests"] },
      ],
    },
    {
      titleKey: "desk.it.nav.groupAssets",
      items: [
        { key: "apps", href: "/app/desk/apps", labelKey: "desk.it.nav.apps", count: n(counts.apps) },
        { key: "licences", href: "/app/desk/licences", labelKey: "desk.it.nav.licences", locked: locks.licences },
        { key: "hardware", href: "/app/desk/hardware", labelKey: "desk.it.nav.hardware", count: locks.hardware ? undefined : n(counts.hardware), locked: locks.hardware },
      ],
    },
    {
      titleKey: "desk.it.nav.groupGovernance",
      items: [
        {
          key: "reviews",
          href: "/app/desk/reviews",
          labelKey: "desk.it.nav.reviews",
          count: !locks.reviews && counts.reviewPct != null ? t("desk.it.nav.percent", { pct: counts.reviewPct }) : undefined,
          locked: locks.reviews,
        },
        {
          key: "shadow",
          href: "/app/desk/shadow",
          labelKey: "desk.it.nav.shadow",
          count: locks.shadow ? undefined : n(counts.newShadow),
          countTone: "var(--dang)",
          locked: locks.shadow,
        },
      ],
    },
    {
      titleKey: "desk.it.nav.groupLifecycle",
      items: [
        { key: "people", href: "/app/desk/people", labelKey: "desk.it.nav.people" },
        { key: "lifecycle", href: "/app/desk/lifecycle", labelKey: "desk.it.nav.lifecycle", locked: locks.lifecycle },
      ],
    },
    ...(isManager
      ? [{ titleKey: "desk.it.nav.groupSettings" as MessageKey, items: [{ key: "config", href: "/app/desk/config", labelKey: "desk.it.nav.config" as MessageKey }] }]
      : []),
  ];

  const isActive = (item: Item) =>
    item.exact
      ? pathname === item.exact[0] || item.exact.slice(1).some((p) => pathname === p || pathname.startsWith(`${p}/`))
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <nav
      aria-label={t("desk.it.rail")}
      className="flex shrink-0 flex-col overflow-y-auto border-r"
      style={{ width: 220, background: "var(--panel)", borderColor: "var(--line)", padding: "16px 10px", gap: 2 }}
    >
      {groups.map((g, gi) => (
        <div key={g.titleKey} className="flex flex-col" style={{ gap: 2 }}>
          <p
            className="uppercase"
            style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", color: "var(--ink-3)", padding: gi === 0 ? "0 10px 8px" : "16px 10px 8px" }}
          >
            {t(g.titleKey)}
          </p>
          {g.items.map((item) => {
            const on = isActive(item);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={on ? "page" : undefined}
                title={item.locked ? t("desk.it.nav.locked") : undefined}
                className="ohd-row flex items-center"
                style={
                  {
                    gap: 9,
                    padding: "8px 10px",
                    borderRadius: 9,
                    fontSize: 13.5,
                    fontWeight: on ? 650 : 500,
                    color: on ? "var(--brand)" : item.locked ? "var(--ink-3)" : "var(--ink-2)",
                    "--row-bg": on ? "var(--brand-t)" : "transparent",
                  } as CSSProperties
                }
              >
                <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                {item.locked ? (
                  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label={t("desk.it.nav.locked")}>
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                ) : (
                  item.count && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: item.countTone ?? "var(--ink-3)" }}>
                      {item.count}
                    </span>
                  )
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
