"use client";

/**
 * Agent workspace shell — V2.
 *
 * The V2 design moves the topbar above the rail so it spans the full width, and
 * it changes what each part is for:
 *
 *  · the wordmark replaces the tenant square, which had migrated to the rail and
 *    said nothing an agent needed twenty times a day;
 *  · a breadcrumb replaces the title/subtitle pair — the page already has a
 *    heading, so the bar says where you are, not what you are looking at;
 *  · the search field is centred and is the primary way into ⌘K, so the rail
 *    loses its magnifier;
 *  · the bell and the avatar open real menus. They used to be a button with no
 *    handler and an icon with none either.
 *
 * The rail keeps the five destinations. Administration left it for the user
 * menu, following the design: it is a place you go to occasionally, not a peer
 * of the inbox.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";
import { setAvailability, markNotificationsRead } from "@/app/app/shell-actions";

export type ShellCounts = {
  inbox: number;
  contacts: number;
  organizations: number;
  kbArticles: number;
  kbCategories: number;
};

/** One entry of the derived notification feed (see lib/notifications.ts). */
export type ShellNotification = {
  id: string;
  text: string;
  at: string;
  href: string;
  tone: "dang" | "wait" | "open" | "mute";
};

export type ShellAgent = {
  name: string;
  email: string;
  roleLabel: string;
  initials: string;
  available: boolean;
  isManager: boolean;
};

/* ---------- Icons, drawn from the design's own paths ---------- */

const RAIL = [
  {
    href: "/app/tickets",
    match: "/app/tickets",
    labelKey: "app.shell.inbox",
    d: "M22 12h-6l-2 3h-4l-2-3H2 M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  },
  {
    href: "/app/contacts",
    match: "/app/contacts",
    labelKey: "app.shell.contacts",
    d: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87",
  },
  {
    href: "/app/organizations",
    match: "/app/organizations",
    labelKey: "app.shell.organizations",
    d: "M3 21h18 M5 21V7l7-4v18 M19 21V11l-7-4 M9 9h.01M9 13h.01M9 17h.01",
  },
  {
    href: "/app/reports",
    match: "/app/reports",
    labelKey: "app.shell.reports",
    d: "M18 20V10 M12 20V4 M6 20v-6",
  },
  {
    href: "/app/kb",
    match: "/app/kb",
    labelKey: "app.shell.knowledgeBase",
    d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  },
] as const;

function RailIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={19}
      height={19}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/** The wordmark's asterisk — three strokes, as in the design. */
export function Asterisk({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flex: "none" }} aria-hidden>
      <g stroke="var(--brand)" strokeWidth={8} strokeLinecap="round">
        <path d="M24 8v32" />
        <path d="M10.1 16l27.8 16" />
        <path d="M37.9 16L10.1 32" />
      </g>
    </svg>
  );
}

/* ---------- Rail ---------- */

export function RailNav({ inboxBadge }: { inboxBadge: number }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      className="flex shrink-0 flex-col items-center border-r"
      style={{
        width: 60,
        padding: "12px 0",
        gap: 6,
        background: "var(--panel)",
        borderColor: "var(--line)",
      }}
    >
      {RAIL.map(({ href, match, labelKey, d }) => {
        const active = pathname.startsWith(match);
        return (
          <Link
            key={labelKey}
            href={href}
            title={t(labelKey)}
            aria-current={active ? "page" : undefined}
            className="ohd-row relative grid place-items-center"
            style={
              {
                width: 40,
                height: 40,
                borderRadius: 11,
                background: active ? "var(--brand-t)" : "transparent",
                color: active ? "var(--brand)" : "var(--ink-3)",
                "--row-bg": active ? "var(--brand-t)" : "transparent",
              } as React.CSSProperties
            }
          >
            <RailIcon d={d} />
            {labelKey === "app.shell.inbox" && inboxBadge > 0 && (
              <span
                className="absolute grid place-items-center font-bold text-white"
                style={{
                  top: 3,
                  right: 3,
                  height: 15,
                  minWidth: 15,
                  padding: "0 3px",
                  borderRadius: 8,
                  fontSize: 9,
                  lineHeight: 1,
                  background: "var(--dang)",
                  border: "2px solid var(--panel)",
                }}
              >
                {inboxBadge > 99 ? "99+" : inboxBadge}
              </span>
            )}
          </Link>
        );
      })}

      <span className="flex-1" />
      <ThemeToggle />
    </nav>
  );
}

/**
 * Theme toggle — the design draws a sun at the foot of the rail and leaves it
 * inert. The product has a real dark theme, so it is wired: the choice is
 * stamped on <html> and kept in localStorage, which is what the boot script in
 * layout.tsx reads back.
 */
function ThemeToggle() {
  const t = useT();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  return (
    <button
      type="button"
      title={t(dark ? "app.shell.themeLight" : "app.shell.themeDark")}
      aria-pressed={dark}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("ohd-theme", next);
        } catch {
          /* private mode — the choice simply does not outlive the tab */
        }
        setDark(!dark);
      }}
      className="ohd-row grid place-items-center"
      style={{ width: 40, height: 40, borderRadius: 11, color: "var(--ink-3)" }}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M2 12h3M19 12h3M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2" />
        </svg>
      )}
    </button>
  );
}

/* ---------- Topbar ---------- */

type Crumb = { root: string; leaf: string };

/** Pages whose leaf the route cannot give (a ticket number, an article title). */
export function BreadcrumbLeaf({ leaf }: { leaf: string }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent<string>("ohd:crumb", { detail: leaf }));
    return () => {
      window.dispatchEvent(new CustomEvent<string>("ohd:crumb", { detail: "" }));
    };
  }, [leaf]);
  return null;
}

function crumbFor(pathname: string, t: ReturnType<typeof useT>): Crumb {
  if (pathname.startsWith("/app/contacts")) return { root: t("app.shell.contacts"), leaf: "" };
  if (pathname.startsWith("/app/organizations"))
    return { root: t("app.shell.organizations"), leaf: "" };
  if (pathname.startsWith("/app/reports")) return { root: t("app.shell.reports"), leaf: "" };
  if (pathname.startsWith("/app/kb")) return { root: t("app.shell.knowledgeBase"), leaf: "" };
  if (pathname.startsWith("/app/settings")) return { root: t("app.shell.settings"), leaf: "" };
  return { root: t("app.shell.inbox"), leaf: "" };
}

export function TopBar({
  counts,
  agent,
  notifications,
  unread,
}: {
  counts: ShellCounts;
  agent: ShellAgent;
  notifications: ShellNotification[];
  unread: number;
}) {
  const t = useT();
  const pathname = usePathname();
  const [leaf, setLeaf] = useState("");
  const [open, setOpen] = useState<"none" | "notifs" | "user">("none");
  const [available, setAvailable] = useState(agent.available);
  const [read, setRead] = useState(unread === 0);
  const wrap = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onCrumb(e: Event) {
      setLeaf((e as CustomEvent<string>).detail ?? "");
    }
    window.addEventListener("ohd:crumb", onCrumb);
    return () => window.removeEventListener("ohd:crumb", onCrumb);
  }, []);

  // Both menus close on an outside click and on Escape: a panel that only closes
  // by clicking its own trigger is a panel you end up navigating around.
  useEffect(() => {
    if (open === "none") return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen("none");
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen("none");
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const crumb = crumbFor(pathname, t);
  const badge = read ? 0 : unread;

  const menuStyle: React.CSSProperties = {
    position: "absolute",
    top: 38,
    right: 0,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    boxShadow: "0 2px 4px rgba(13,28,23,.05), 0 22px 48px -18px rgba(13,28,23,.3)",
    zIndex: 70,
    overflow: "hidden",
  };

  const TONE: Record<ShellNotification["tone"], string> = {
    dang: "var(--dang)",
    wait: "var(--wait)",
    open: "var(--open)",
    mute: "var(--ink-3)",
  };

  return (
    <header
      className="flex shrink-0 items-center border-b"
      style={{
        height: 56,
        gap: 18,
        padding: "0 16px",
        background: "var(--panel)",
        borderColor: "var(--line)",
      }}
    >
      <Link href="/app/tickets" className="flex items-center" style={{ gap: 9 }}>
        <Asterisk />
        <span
          className="whitespace-nowrap"
          style={{
            fontFamily: "var(--font-title)",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "-.015em",
            color: "var(--ink)",
          }}
        >
          Open<span style={{ color: "var(--brand)" }}>*</span>HelpDesk
        </span>
      </Link>

      <div
        className="hidden items-center md:flex"
        style={{ gap: 8, fontSize: 13.5, color: "var(--ink-3)" }}
      >
        <span style={{ color: "var(--brand-2)", fontWeight: 500 }}>{crumb.root}</span>
        {leaf && (
          <>
            <span>/</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink-2)" }}>
              {leaf}
            </span>
          </>
        )}
      </div>

      {/* The search field is a button: the real thing is the ⌘K palette, and a
          text input here would have been a second search to keep in step. */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("ohd:open-search"))}
        className="ohd-hover-edge-ink flex items-center border"
        style={{
          flex: 1,
          maxWidth: 560,
          margin: "0 auto",
          height: 36,
          gap: 10,
          padding: "0 8px 0 12px",
          background: "var(--sunk)",
          borderColor: "var(--line)",
          borderRadius: 10,
        }}
      >
        <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="var(--ink-3)" strokeWidth={2} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="flex-1 truncate text-left" style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
          {t("app.shell.searchField")}
        </span>
        <kbd
          style={{
            padding: "2px 7px",
            borderRadius: 6,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ink-3)",
          }}
        >
          ⌘K
        </kbd>
      </button>

      <Link
        href="/app/tickets/new"
        className="flex items-center whitespace-nowrap font-semibold"
        style={{
          color: "var(--on-brand)",
          height: 36,
          gap: 8,
          padding: "0 14px",
          borderRadius: 9,
          background: "var(--brand)",
          fontSize: 13.5,
        }}
      >
        + {t("app.shell.newTicket")}
      </Link>

      <div ref={wrap} className="flex items-center" style={{ gap: 14, color: "var(--ink-3)" }}>
        {/* Notifications */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            title={t("app.shell.notifications")}
            aria-expanded={open === "notifs"}
            onClick={() => setOpen(open === "notifs" ? "none" : "notifs")}
            className="ohd-row relative grid place-items-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: open === "notifs" ? "var(--brand-t)" : "transparent",
              color: open === "notifs" ? "var(--brand)" : "var(--ink-3)",
            }}
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
              <path d="M13.7 20a2 2 0 0 1-3.4 0" />
            </svg>
            {badge > 0 && (
              <span
                className="absolute grid place-items-center font-bold text-white"
                style={{
                  top: -2,
                  right: -3,
                  minWidth: 15,
                  height: 15,
                  padding: "0 3px",
                  borderRadius: 8,
                  background: "var(--dang)",
                  fontSize: 9.5,
                }}
              >
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </button>

          {open === "notifs" && (
            <div style={{ ...menuStyle, width: 340 }}>
              <div
                className="flex items-center border-b"
                style={{ gap: 10, padding: "12px 15px", borderColor: "var(--line)" }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                  {t("app.shell.notifications")}
                </span>
                <span className="flex-1" />
                {badge > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRead(true);
                      void markNotificationsRead();
                    }}
                    style={{ fontSize: 12, color: "var(--brand-2)", fontWeight: 600 }}
                  >
                    {t("app.shell.notificationsMarkAll")}
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <p style={{ padding: "18px 15px", fontSize: 12.5, color: "var(--ink-3)" }}>
                  {t("app.shell.notificationsEmpty")}
                </p>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setOpen("none")}
                    className="ohd-row flex border-b"
                    style={{
                      gap: 11,
                      padding: "12px 15px",
                      borderColor: "var(--line-2)",
                      background: read ? "transparent" : "var(--brand-t)",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        flex: "none",
                        borderRadius: "50%",
                        marginTop: 5,
                        background: read ? "var(--line)" : TONE[n.tone],
                      }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
                      <span style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.45 }}>
                        {n.text}
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{n.at}</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* Agent menu */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-expanded={open === "user"}
            onClick={() => setOpen(open === "user" ? "none" : "user")}
            className="grid place-items-center font-bold"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--brand-t)",
              color: "var(--brand)",
              fontSize: 11,
              border: `1px solid ${open === "user" ? "var(--brand)" : "var(--brand-b)"}`,
            }}
          >
            {agent.initials}
          </button>

          {open === "user" && (
            <div style={{ ...menuStyle, width: 264 }}>
              <div
                className="flex items-center border-b"
                style={{ gap: 11, padding: "14px 15px", borderColor: "var(--line)" }}
              >
                <span
                  className="grid place-items-center font-bold"
                  style={{
                    width: 36,
                    height: 36,
                    flex: "none",
                    borderRadius: "50%",
                    background: "var(--brand-t)",
                    color: "var(--brand)",
                    fontSize: 12,
                    border: "1px solid var(--brand-b)",
                  }}
                >
                  {agent.initials}
                </span>
                <span className="min-w-0">
                  <span
                    className="block truncate"
                    style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}
                  >
                    {agent.name}
                  </span>
                  <span className="block truncate" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {agent.email} · {agent.roleLabel}
                  </span>
                </span>
              </div>

              {/* Availability — a real switch, saved server-side. */}
              <div
                className="flex items-center border-b"
                style={{ gap: 11, padding: "11px 15px", borderColor: "var(--line-2)" }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: available ? "var(--ok)" : "var(--ink-3)",
                  }}
                />
                <span style={{ flex: 1, fontSize: 13, color: "var(--ink-2)" }}>
                  {t(available ? "app.shell.availableOn" : "app.shell.availableOff")}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={available}
                  aria-label={t("app.shell.availableToggle")}
                  onClick={() => {
                    const next = !available;
                    setAvailable(next);
                    void setAvailability(next);
                  }}
                  style={{
                    width: 36,
                    height: 20,
                    flex: "none",
                    borderRadius: 999,
                    background: available ? "var(--brand)" : "var(--line)",
                    position: "relative",
                    transition: "background .15s ease",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: available ? 18 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                      transition: "left .15s ease",
                    }}
                  />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpen("none");
                  window.dispatchEvent(new Event("ohd:open-search"));
                }}
                className="ohd-row flex w-full items-center"
                style={{ gap: 11, padding: "10px 15px", fontSize: 13, color: "var(--ink-2)" }}
              >
                <span className="flex-1 text-left">{t("app.shell.shortcuts")}</span>
                <kbd
                  style={{
                    padding: "2px 7px",
                    borderRadius: 6,
                    background: "var(--sunk)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--ink-3)",
                  }}
                >
                  ⌘K
                </kbd>
              </button>

              {agent.isManager && (
                <Link
                  href="/app/settings/general"
                  onClick={() => setOpen("none")}
                  className="ohd-row flex items-center"
                  style={{ gap: 11, padding: "10px 15px", fontSize: 13, color: "var(--ink-2)" }}
                >
                  {t("app.shell.settings")}
                </Link>
              )}

              <button
                type="button"
                onClick={async () => {
                  setOpen("none");
                  await authClient.signOut();
                  router.push("/login");
                  router.refresh();
                }}
                className="ohd-row flex w-full items-center text-left"
                style={{ gap: 11, padding: "10px 15px", fontSize: 13, color: "var(--dang)" }}
              >
                {t("app.shell.signOut")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
