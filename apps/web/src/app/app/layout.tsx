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
import { requireTenant } from "@/lib/tenant";
import { billingOf } from "@/lib/entitlements";
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
  // Ahead of requireAgent, which would send an invented subdomain to /login
  // instead of answering the 404 it deserves (see requireTenant).
  await requireTenant();
  const { tenant, agent } = await requireAgent();
  const t0 = await getT();

  // Suspended workspace (unpaid, trial over…): everything is blocked, except —
  // for the Owner — billing (where the suspension gets lifted) plus the team
  // and email settings: shrinking the workspace back into the free allowance
  // is the other way out, and it needs those two screens.
  if (tenant.status === "suspended" || tenant.status === "deleting") {
    const pathname = (await headers()).get("x-pathname") ?? "";
    const allowedWhileSuspended = ["/app/settings/billing", "/app/settings/team", "/app/settings/email"];
    const ownerOnAllowed =
      agent.role === "owner" && allowedWhileSuspended.some((p) => pathname.startsWith(p));
    if (!ownerOnAllowed) {
      /*
       * The advice has to match the reason. Picking a plan or shrinking the team
       * is the way out of a billing suspension and of no other: told to a
       * workspace paused because its address was never confirmed, it sends the
       * owner to the one screen that cannot help, and leaves the real remedy
       * unsaid. An unknown reason keeps the generic wording — a control plane
       * may add reasons before the product knows them.
       */
      const unverified = tenant.suspendedReason === "email_unverified";
      return (
        <main className="ohd flex min-h-screen items-center justify-center p-6">
          <div className="w-full text-center" style={{ maxWidth: 440 }}>
            <h1 className="font-bold" style={{ fontSize: 22, color: "var(--ink)" }}>
              {t0(unverified ? "app.shell.suspendedUnverifiedTitle" : "app.shell.suspendedTitle")}
            </h1>
            <p className="mt-3" style={{ fontSize: 14, color: "var(--ink-2)" }}>
              {unverified
                ? agent.role === "owner"
                  ? t0("app.shell.suspendedUnverifiedOwnerText")
                  : t0("app.shell.suspendedUnverifiedText")
                : agent.role === "owner"
                  ? t0("app.shell.suspendedOwnerText")
                  : t0("app.shell.suspendedText")}
            </p>
            {agent.role === "owner" && !unverified && (
              /* Plain <a>, not <Link>: this screen is rendered by the LAYOUT,
                 which Next.js does not re-render on client navigation — with a
                 soft navigation the URL changed but the suspension screen
                 stayed, locking the owner out of the very page that lifts it. */
              <a
                href="/app/settings/billing"
                className="mt-5 inline-flex items-center rounded-md px-4 font-semibold text-white"
                style={{ height: 36, fontSize: 13.5, background: "var(--acc)" }}
              >
                {t0("app.shell.suspendedBillingCta")}
              </a>
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

  // Shell banners (ST-11): a failed payment shows its deadline in red; a trial
  // in its last three days shows its end date. Managers get the link to act.
  const billing = billingOf(tenant);
  const dunningDeadline = billing.dunningDeadline ? new Date(billing.dunningDeadline) : null;
  const trialDaysLeft =
    tenant.status === "trial" && tenant.trialEndsAt
      ? Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000)
      : null;
  const banner: { tone: "dang" | "acc"; text: string } | null = dunningDeadline
    ? {
        tone: "dang",
        text: t("app.shell.dunningBanner", { date: t.fmt.dateLong(dunningDeadline) }),
      }
    : trialDaysLeft != null && trialDaysLeft <= 3
      ? {
          tone: "acc",
          text: t("app.shell.trialBanner", {
            date: t.fmt.dateLong(tenant.trialEndsAt as Date),
          }),
        }
      : null;

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

          {banner && (
            <div
              className="flex shrink-0 items-center justify-center gap-3 border-b px-4 text-center"
              style={{
                minHeight: 34,
                fontSize: 12.5,
                fontWeight: 600,
                background: banner.tone === "dang" ? "var(--dang-t)" : "var(--acc-t)",
                borderColor: banner.tone === "dang" ? "var(--dang)" : "var(--acc-b)",
                color: banner.tone === "dang" ? "var(--dang)" : "var(--acc-2)",
              }}
            >
              <span>{banner.text}</span>
              {isManager(agent.role) && (
                <a href="/app/settings/billing" className="underline" style={{ fontWeight: 700 }}>
                  {t("app.shell.bannerBillingCta")}
                </a>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>

        <CommandPalette edition={getEdition()} />
      </div>
    </I18nProvider>
  );
}
