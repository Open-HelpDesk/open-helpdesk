"use client";

/**
 * Employee portal chrome (spec 19 §6, design "Portail employé"): 60 px header
 * — mark, workspace, "Service desk", tabs with counts, user chip — and the
 * toast every action reports through. The layout stays mounted across client
 * navigations, so a toast raised before `router.push` survives the move.
 * On a phone the tabs drop to a second, horizontally scrolling row.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { BrandMark } from "./brand-mark";
import { avatarTone, initialsOf } from "./format";

type Toast = (message: string) => void;
const ToastContext = createContext<Toast>(() => {});
export const useToast = () => useContext(ToastContext);

export type ShellTab = { href: string; label: string; count: number };

export function PortalShell({
  tenantName,
  person,
  tabs,
  signOut,
  children,
}: {
  tenantName: string;
  person: { name: string; email: string; subtitle: string };
  tabs: ShellTab[];
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback<Toast>((m) => {
    setToast(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const tone = avatarTone(person.name);

  const tabLinks = tabs.map((tab) => {
    const on = tab.href === "/desk" ? pathname === "/desk" : pathname.startsWith(tab.href);
    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-current={on ? "page" : undefined}
        className="sd-tab flex items-center gap-[7px] whitespace-nowrap px-3 text-[13.5px] font-semibold"
      >
        {tab.label}
        {tab.count > 0 && (
          <span
            className="rounded-full px-[7px] text-[11px] font-bold leading-[18px]"
            style={{ background: "var(--brand)", color: "var(--on-brand)" }}
          >
            {t.fmt.number(tab.count)}
          </span>
        )}
      </Link>
    );
  });

  return (
    <ToastContext.Provider value={show}>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex-none border-b" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
          <div className="flex h-[60px] items-center gap-6 px-6 max-sm:gap-3 max-sm:px-4">
            <Link href="/desk" className="flex min-w-0 items-center gap-2.5 hover:no-underline" style={{ color: "var(--ink)" }}>
              <BrandMark />
              <span className="sd-title truncate text-[16px]">{tenantName}</span>
              <span className="h-[18px] w-px flex-none" style={{ background: "var(--line)" }} />
              <span className="whitespace-nowrap text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                {t("desk.portal.shell.product")}
              </span>
            </Link>
            <nav aria-label={t("desk.portal.shell.nav")} className="flex self-stretch max-md:hidden">
              {tabLinks}
            </nav>
            <span className="flex-1" />
            <details className="sd-menu relative">
              <summary className="flex items-center gap-2.5" aria-label={person.name}>
                <span
                  className="grid h-8 w-8 flex-none place-items-center rounded-full text-[11.5px] font-bold"
                  style={{ background: tone.bg, color: tone.c }}
                >
                  {initialsOf(person.name)}
                </span>
                <span className="leading-[1.3] max-sm:hidden">
                  <span className="block whitespace-nowrap text-[13px] font-semibold">{person.name}</span>
                  <span className="block whitespace-nowrap text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    {person.subtitle}
                  </span>
                </span>
              </summary>
              <div
                className="absolute right-0 top-[calc(100%+8px)] z-40 flex w-64 flex-col rounded-2xl border p-1.5"
                style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "0 18px 40px -18px rgb(13 28 23 / 35%)" }}
              >
                <p className="truncate px-2.5 pb-1.5 pt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  {person.email}
                </p>
                <form action={signOut}>
                  <button type="submit" className="sd-menu-item w-full rounded-lg px-2.5 py-2 text-left text-[14px]">
                    {t("desk.portal.shell.signOut")}
                  </button>
                </form>
              </div>
            </details>
          </div>
          <nav
            aria-label={t("desk.portal.shell.nav")}
            className="sd-tabs hidden h-11 overflow-x-auto px-2 max-md:flex"
          >
            {tabLinks}
          </nav>
        </header>
        <main className="flex-1">
          <div className="mx-auto max-w-[1160px] px-7 pb-[72px] pt-8 max-sm:px-4 max-sm:pt-6">{children}</div>
        </main>
      </div>
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-7 z-[80] flex justify-center px-5" role="status" aria-live="polite">
          <div
            className="sd-rise max-w-[620px] rounded-xl px-[18px] py-3 text-[13.5px]"
            style={{ background: "var(--ink)", color: "var(--panel)", boxShadow: "0 14px 36px rgba(0,0,0,.3)" }}
          >
            {toast}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
