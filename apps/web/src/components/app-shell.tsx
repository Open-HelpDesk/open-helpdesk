"use client";

/**
 * Agent workspace shell (AG-03 → AG-10) — client parts:
 * 64 px rail with per-route active states + Inbox badge, 48 px topbar with dynamic
 * title/subtitle, fake ⌘K search field, bell, "+ New ticket".
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Inbox,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { useT } from "@/i18n/client";

export type ShellCounts = {
  inbox: number;
  contacts: number;
  organizations: number;
  kbArticles: number;
  kbCategories: number;
};

/* ---------- Rail 64 px ---------- */

const RAIL_ITEMS = [
  { href: "/app/tickets", icon: Inbox, labelKey: "app.shell.inbox", match: "/app/tickets" },
  { href: null, icon: Search, labelKey: "app.shell.search", match: null },
  { href: "/app/contacts", icon: Users, labelKey: "app.shell.contacts", match: "/app/contacts" },
  {
    href: "/app/organizations",
    icon: Building2,
    labelKey: "app.shell.organizations",
    match: "/app/organizations",
  },
  { href: "/app/reports", icon: BarChart3, labelKey: "app.shell.reports", match: "/app/reports" },
  { href: "/app/kb", icon: BookOpen, labelKey: "app.shell.knowledgeBase", match: "/app/kb" },
  {
    href: "/app/settings/team",
    icon: Settings,
    labelKey: "app.shell.settings",
    match: "/app/settings",
  },
] as const;

export function RailNav({ inboxBadge }: { inboxBadge: number }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="flex flex-col items-center gap-1">
      {RAIL_ITEMS.map(({ href, icon: Icon, labelKey, match }) => {
        const label = t(labelKey);
        const active = match !== null && pathname.startsWith(match);
        const style = {
          width: 40,
          height: 40,
          borderRadius: 8,
          background: active ? "var(--acc-t)" : "transparent",
          color: active ? "var(--acc)" : "var(--ink-3)",
        } as const;
        const inner = (
          <>
            <Icon size={19} strokeWidth={1.7} />
            {labelKey === "app.shell.inbox" && inboxBadge > 0 && (
              <span
                className="absolute flex items-center justify-center font-bold text-white"
                style={{
                  top: 4,
                  right: 4,
                  height: 15,
                  minWidth: 15,
                  padding: "0 3px",
                  borderRadius: 8,
                  fontSize: 9,
                  background: "var(--dang)",
                  border: "2px solid var(--panel)",
                  lineHeight: 1,
                }}
              >
                {inboxBadge > 99 ? "99+" : inboxBadge}
              </span>
            )}
          </>
        );
        return href ? (
          <Link
            key={labelKey}
            href={href}
            title={label}
            className="relative flex items-center justify-center"
            style={style}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={labelKey}
            type="button"
            title={label}
            className="relative flex items-center justify-center"
            style={style}
            onClick={() => window.dispatchEvent(new Event("ohd:open-search"))}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

/* ---------- Topbar 48 px ---------- */

type TopbarInfo = { title: string; subtitle: string };

/** Translation function from the client context, passed to functions outside the component. */
type Translate = ReturnType<typeof useT>;

/** Pages (e.g. AG-04) can override the topbar title through this event. */
export function TopbarOverride({ title, subtitle }: { title: string; subtitle: string }) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<TopbarInfo>("ohd:topbar", { detail: { title, subtitle } }),
    );
    return () => {
      window.dispatchEvent(new CustomEvent<TopbarInfo | null>("ohd:topbar", { detail: null! }));
    };
  }, [title, subtitle]);
  return null;
}

function defaultTopbar(
  pathname: string,
  period: string | null,
  counts: ShellCounts,
  t: Translate,
): TopbarInfo {
  if (pathname.startsWith("/app/tickets/new")) {
    return { title: t("app.shell.newTicket"), subtitle: "" };
  }
  if (/^\/app\/tickets\/\d+/.test(pathname)) {
    return { title: t("app.shell.myTickets"), subtitle: "" };
  }
  if (pathname.startsWith("/app/tickets")) {
    return {
      title: t("app.shell.myTickets"),
      subtitle: t("app.shell.topbarTickets", { count: counts.inbox }),
    };
  }
  if (pathname.startsWith("/app/contacts")) {
    return {
      title: t("app.shell.contacts"),
      subtitle: t("app.shell.topbarContacts", { count: counts.contacts }),
    };
  }
  if (pathname.startsWith("/app/organizations")) {
    return {
      title: t("app.shell.organizations"),
      subtitle: t("app.shell.topbarOrganizations", { count: counts.organizations }),
    };
  }
  if (pathname.startsWith("/app/reports")) {
    const days = period === "7" || period === "90" ? period : "30";
    return {
      title: t("app.shell.reports"),
      subtitle: t("app.shell.topbarReports", { count: Number(days) }),
    };
  }
  if (pathname.startsWith("/app/kb")) {
    return {
      title: t("app.shell.knowledgeBase"),
      subtitle: t("app.shell.topbarKb", {
        count: counts.kbArticles,
        categories: t("app.shell.topbarKbCategories", { count: counts.kbCategories }),
      }),
    };
  }
  if (pathname.startsWith("/app/settings")) {
    return { title: t("app.shell.settings"), subtitle: "" };
  }
  return { title: "", subtitle: "" };
}

export function TopBar({ counts }: { counts: ShellCounts }) {
  const t = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [override, setOverride] = useState<TopbarInfo | null>(null);

  useEffect(() => {
    function onOverride(e: Event) {
      setOverride((e as CustomEvent<TopbarInfo | null>).detail ?? null);
    }
    window.addEventListener("ohd:topbar", onOverride);
    return () => window.removeEventListener("ohd:topbar", onOverride);
  }, []);

  // Reset the override on route change.
  useEffect(() => {
    setOverride(null);
  }, [pathname]);

  const info = override ?? defaultTopbar(pathname, searchParams.get("p"), counts, t);

  return (
    <header
      className="flex shrink-0 items-center gap-3 border-b"
      style={{
        height: 48,
        padding: "0 14px",
        background: "var(--panel)",
        borderColor: "var(--line)",
      }}
    >
      <h1 className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>
        {info.title}
      </h1>
      {info.subtitle && (
        <span
          className="hidden truncate sm:inline"
          style={{ fontSize: 12, color: "var(--ink-3)" }}
        >
          {info.subtitle}
        </span>
      )}

      <span className="flex-1" />

      {/* Fake search field → ⌘K palette */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("ohd:open-search"))}
        className="hidden items-center gap-2 border md:flex"
        style={{
          height: 30,
          minWidth: 200,
          padding: "0 10px",
          borderRadius: 6,
          borderColor: "var(--line)",
          color: "var(--ink-3)",
          fontSize: 12,
        }}
      >
        <span className="flex-1 text-left">{t("app.shell.searchField")}</span>
        <kbd
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "1px 5px",
            border: "1px solid var(--line)",
            borderRadius: 4,
            background: "var(--sunk)",
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Bell */}
      <button
        type="button"
        title={t("app.shell.notifications")}
        className="relative flex items-center justify-center rounded-md"
        style={{ width: 30, height: 30, color: "var(--ink-2)" }}
      >
        <Bell size={17} strokeWidth={1.7} />
        <span
          className="absolute rounded-full"
          style={{
            top: 3,
            right: 3,
            width: 7,
            height: 7,
            background: "var(--dang)",
            border: "1.5px solid var(--panel)",
          }}
        />
      </button>

      <Link
        href="/app/tickets/new"
        className="inline-flex items-center rounded-md font-semibold text-white"
        style={{ height: 30, padding: "0 12px", gap: 6, background: "var(--acc)", fontSize: 13 }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> {t("app.shell.newTicket")}
      </Link>
    </header>
  );
}
