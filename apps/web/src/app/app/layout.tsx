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

import { getEdition } from "@openhelpdesk/config";
import { CommandPalette } from "@/components/command-palette";
import { RailNav, TopBar, type ShellAgent, type ShellCounts } from "@/components/app-shell";
import { agentNotifications } from "@/lib/notifications";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";

/**
 * Shared shell for the agent workspace (AG-03 → AG-10), V2 layout.
 *
 * The 56 px topbar now spans the full width and the 60 px rail sits under it,
 * which is what lets the breadcrumb and the centred search read as belonging to
 * the whole workspace rather than to the pane on the right.
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

  const notifications = await agentNotifications(
    tenant.id,
    agent.id,
    agent.notificationsReadAt ?? null,
    t,
  );

  const shellAgent: ShellAgent = {
    name: agent.name,
    email: agent.email,
    roleLabel: t(
      agent.role === "owner"
        ? "app.settings.workspace.roleOwner"
        : agent.role === "admin"
          ? "app.settings.workspace.roleAdmin"
          : agent.role === "viewer"
            ? "app.settings.workspace.roleViewer"
            : "app.settings.workspace.roleAgent",
    ),
    // Two letters from the name, the same rule the avatars use elsewhere.
    initials:
      agent.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("") || agent.email[0]!.toUpperCase(),
    available: agent.available,
    isManager: isManager(agent.role),
  };

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
      <div className="ohd flex h-screen flex-col overflow-hidden">
        <Suspense fallback={<div style={{ height: 56 }} />}>
          <TopBar
            counts={counts}
            agent={shellAgent}
            notifications={notifications.items}
            unread={notifications.unread}
          />
        </Suspense>

        {banner && (
          <div
            className="flex shrink-0 items-center justify-center gap-3 border-b px-4 text-center"
            style={{
              minHeight: 34,
              fontSize: 12.5,
              fontWeight: 600,
              background: banner.tone === "dang" ? "var(--dang-t)" : "var(--brand-t)",
              borderColor: banner.tone === "dang" ? "var(--dang)" : "var(--brand-b)",
              color: banner.tone === "dang" ? "var(--dang)" : "var(--brand-2)",
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

        <div className="flex min-h-0 flex-1">
          <RailNav inboxBadge={counts.inbox} />
          <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
        </div>

        <CommandPalette edition={getEdition()} />
      </div>
    </I18nProvider>
  );
}
