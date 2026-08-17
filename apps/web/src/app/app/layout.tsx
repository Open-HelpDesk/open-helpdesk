import { Suspense } from "react";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import {
  contacts,
  db,
  kbArticles,
  kbCategories,
  organizations,
  tickets,
} from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { Avatar } from "@/components/ticket-bits";
import { CommandPalette } from "@/components/command-palette";
import { RailNav, TopBar, type ShellCounts } from "@/components/app-shell";
import { SignOutButton } from "./sign-out-button";

/**
 * Shell commun de l'espace agent (AG-03 → AG-10) : rail 64 px (logo 32×32, 7 icônes
 * 40×40 avec états actifs, badge rouge sur Inbox = tickets ouverts de l'agent, avatar
 * 30×30 en bas) + topbar 48 px (titre + sous-titre dynamiques, ⌘K, cloche, « + Nouveau
 * ticket »).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { tenant, agent } = await requireAgent();
  const branding = (tenant.branding ?? {}) as { accentColor?: string };

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
      db.select({ n: count() }).from(kbArticles).where(eq(kbArticles.tenantId, tenant.id)),
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Rail 64 px */}
      <aside
        className="flex w-16 shrink-0 flex-col items-center border-r py-3"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div
          className="mb-3 flex items-center justify-center font-bold text-white"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: branding.accentColor || "var(--acc)",
          }}
          title={tenant.name}
        >
          {tenant.name[0]?.toUpperCase()}
        </div>

        <RailNav inboxBadge={counts.inbox} />

        <div className="mt-auto flex flex-col items-center gap-1.5">
          <SignOutButton />
          <Avatar name={agent.name} size={30} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div style={{ height: 48 }} />}>
          <TopBar counts={counts} />
        </Suspense>

        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>

      <CommandPalette />
    </div>
  );
}
