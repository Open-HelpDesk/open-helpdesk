"use client";

/**
 * Shell de l'espace agent (AG-03 → AG-10) — parties clientes :
 * rail 64 px avec états actifs par route + badge Inbox, topbar 48 px avec titre/sous-titre
 * dynamiques, faux champ recherche ⌘K, cloche, « + Nouveau ticket ».
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

export type ShellCounts = {
  inbox: number;
  contacts: number;
  organizations: number;
  kbArticles: number;
  kbCategories: number;
};

/* ---------- Rail 64 px ---------- */

const RAIL_ITEMS = [
  { href: "/app/tickets", icon: Inbox, label: "Inbox", match: "/app/tickets" },
  { href: null, icon: Search, label: "Recherche (⌘K)", match: null },
  { href: "/app/contacts", icon: Users, label: "Contacts", match: "/app/contacts" },
  {
    href: "/app/organizations",
    icon: Building2,
    label: "Organisations",
    match: "/app/organizations",
  },
  { href: "/app/reports", icon: BarChart3, label: "Rapports", match: "/app/reports" },
  { href: "/app/kb", icon: BookOpen, label: "Base de connaissances", match: "/app/kb" },
  {
    href: "/app/settings/team",
    icon: Settings,
    label: "Paramètres",
    match: "/app/settings",
  },
] as const;

export function RailNav({ inboxBadge }: { inboxBadge: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col items-center gap-1">
      {RAIL_ITEMS.map(({ href, icon: Icon, label, match }) => {
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
            {label === "Inbox" && inboxBadge > 0 && (
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
            key={label}
            href={href}
            title={label}
            className="relative flex items-center justify-center"
            style={style}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={label}
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

/** Les pages (ex. AG-04) peuvent surcharger le titre du topbar via cet événement. */
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
): TopbarInfo {
  if (pathname.startsWith("/app/tickets/new")) {
    return { title: "Nouveau ticket", subtitle: "" };
  }
  if (/^\/app\/tickets\/\d+/.test(pathname)) {
    return { title: "Mes tickets", subtitle: "" };
  }
  if (pathname.startsWith("/app/tickets")) {
    return {
      title: "Mes tickets",
      subtitle: `${counts.inbox} ticket${counts.inbox > 1 ? "s" : ""} · mis à jour à l'instant`,
    };
  }
  if (pathname.startsWith("/app/contacts")) {
    return {
      title: "Contacts",
      subtitle: `${counts.contacts} contact${counts.contacts > 1 ? "s" : ""}`,
    };
  }
  if (pathname.startsWith("/app/organizations")) {
    return {
      title: "Organisations",
      subtitle: `${counts.organizations} organisation${counts.organizations > 1 ? "s" : ""}`,
    };
  }
  if (pathname.startsWith("/app/reports")) {
    const days = period === "7" || period === "90" ? period : "30";
    return { title: "Rapports", subtitle: `${days} derniers jours` };
  }
  if (pathname.startsWith("/app/kb")) {
    return {
      title: "Base de connaissances",
      subtitle: `${counts.kbArticles} article${counts.kbArticles > 1 ? "s" : ""} · ${counts.kbCategories} catégorie${counts.kbCategories > 1 ? "s" : ""}`,
    };
  }
  if (pathname.startsWith("/app/settings")) {
    return { title: "Paramètres", subtitle: "" };
  }
  return { title: "", subtitle: "" };
}

export function TopBar({ counts }: { counts: ShellCounts }) {
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

  // Reset de la surcharge au changement de route.
  useEffect(() => {
    setOverride(null);
  }, [pathname]);

  const info = override ?? defaultTopbar(pathname, searchParams.get("p"), counts);

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

      {/* Faux champ recherche → palette ⌘K */}
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
        <span className="flex-1 text-left">Rechercher…</span>
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

      {/* Cloche */}
      <button
        type="button"
        title="Notifications"
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
        <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Nouveau ticket
      </Link>
    </header>
  );
}
