import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import {
  contacts,
  db,
  kbArticles,
  kbCategories,
  organizations,
  tickets,
} from "@openhelpdesk/db";
import { isManager, requireAgent } from "@/lib/session";
import { Avatar } from "@/components/ticket-bits";
import { getEdition } from "@openhelpdesk/config";
import { CommandPalette } from "@/components/command-palette";
import { RailNav, TopBar, type ShellCounts } from "@/components/app-shell";
import { SignOutButton } from "./sign-out-button";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";

/**
 * Shared shell for the agent workspace (AG-03 → AG-10): 64 px rail (32×32 logo, 7 icons
 * 40×40 with active states, red badge on Inbox = the agent's open tickets, 30×30 avatar
 * at the bottom) + 48 px topbar (dynamic title + subtitle, ⌘K, bell, "+ New
 * ticket").
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { tenant, agent } = await requireAgent();
  const t0 = await getT();

  // Suspended workspace (unpaid, trial over…): everything is blocked, except
  // Subscription & billing for the Owner — that is where the suspension gets lifted.
  if (tenant.status === "suspended" || tenant.status === "deleting") {
    const pathname = (await headers()).get("x-pathname") ?? "";
    const ownerOnBilling =
      agent.role === "owner" && pathname.startsWith("/app/settings/billing");
    if (!ownerOnBilling) {
      return (
        <main className="ohd flex min-h-screen items-center justify-center p-6">
          <div className="w-full text-center" style={{ maxWidth: 440 }}>
            <h1 className="font-bold" style={{ fontSize: 22, color: "var(--ink)" }}>
              {t0("app.shell.suspendedTitle")}
            </h1>
            <p className="mt-3" style={{ fontSize: 14, color: "var(--ink-2)" }}>
              {agent.role === "owner"
                ? t0("app.shell.suspendedOwnerText")
                : t0("app.shell.suspendedText")}
            </p>
            {agent.role === "owner" && (
              <Link
                href="/app/settings/billing"
                className="mt-5 inline-flex items-center rounded-md px-4 font-semibold text-white"
                style={{ height: 36, fontSize: 13.5, background: "var(--acc)" }}
              >
                {t0("app.shell.suspendedBillingCta")}
              </Link>
            )}
          </div>
        </main>
      );
    }
  }

  const branding = (tenant.branding ?? {}) as { accentColor?: string; logoUrl?: string };

  const [[myOpen], [contactCount], [orgCount], [articleCount], [categoryCount]] =
    await Promise.all([
      db
        .select({ n: count() })
        .from(tickets)
        .where(
          and(
            eq(tickets.tenantId, tenant.id),
            eq(tickets.assigneeId, agent.id),
            inArray(tickets.status, ["new", "open", "waiting", "on_hold"]),
            isNull(tickets.deletedAt),
            isNull(tickets.mergedIntoId),
          ),
        ),
      db.select({ n: count() }).from(contacts).where(eq(contacts.tenantId, tenant.id)),
      db
        .select({ n: count() })
        .from(organizations)
        .where(eq(organizations.tenantId, tenant.id)),
      // The topbar's "N articles" subtitle follows the same rule as the list:
      // a non-manager only counts what is published, otherwise the gap gives away the
      // drafts we hide from them elsewhere.
      db
        .select({ n: count() })
        .from(kbArticles)
        .where(
          and(
            eq(kbArticles.tenantId, tenant.id),
            ...(isManager(agent.role) ? [] : [eq(kbArticles.status, "published")]),
          ),
        ),
      db
        .select({ n: count() })
        .from(kbCategories)
        .where(eq(kbCategories.tenantId, tenant.id)),
    ]);

  const counts: ShellCounts = {
    inbox: myOpen?.n ?? 0,
    contacts: contactCount?.n ?? 0,
    organizations: orgCount?.n ?? 0,
    kbArticles: articleCount?.n ?? 0,
    kbCategories: categoryCount?.n ?? 0,
  };

  const t = await getT();

  return (
    <I18nProvider locale={t.locale} dict={t.dict}>
      <div className="ohd flex h-screen overflow-hidden">
        {/* Rail 64 px */}
        <aside
          className="flex w-16 shrink-0 flex-col items-center border-r"
          style={{ padding: "10px 0", background: "var(--panel)", borderColor: "var(--line)" }}
        >
          {/* The tenant logo (ST-01) takes the place of the initial square,
              here just as in the portal header. */}
          {branding.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- an SVG or an
               ICO uploaded by the tenant does not go through the image optimizer. */
            <img
              src={branding.logoUrl}
              alt={tenant.name}
              title={tenant.name}
              className="mb-2 object-contain"
              style={{ width: 32, height: 32, borderRadius: 8, background: "var(--sunk)" }}
            />
          ) : (
            <div
              className="mb-2 flex items-center justify-center font-bold text-white"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                fontSize: 14,
                background: branding.accentColor || "var(--acc)",
              }}
              title={tenant.name}
            >
              {tenant.name[0]?.toUpperCase()}
            </div>
          )}

          <RailNav inboxBadge={counts.inbox} />

          <div className="mt-auto flex flex-col items-center gap-1.5">
            <SignOutButton />
            <Avatar name={agent.name} size={30} bordered />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<div style={{ height: 48 }} />}>
            <TopBar counts={counts} />
          </Suspense>

          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>

        <CommandPalette edition={getEdition()} />
      </div>
    </I18nProvider>
  );
}
