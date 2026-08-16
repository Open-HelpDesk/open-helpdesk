import Link from "next/link";
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Inbox,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { requireAgent } from "@/lib/session";
import { Avatar } from "@/components/ticket-bits";
import { CommandPalette, SearchButton } from "@/components/command-palette";
import { SignOutButton } from "./sign-out-button";

/**
 * Shell commun de l'espace agent (specs/10) : barre latérale 64 px (Inbox, Recherche,
 * Contacts, Organisations, Rapports, KB, Paramètres ; avatar en bas) + barre supérieure
 * fine (« Nouveau ticket », cloche, ⌘K). Densité élevée.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { tenant, agent } = await requireAgent();

  const navItems = [
    { href: "/app/tickets", icon: Inbox, label: "Inbox" },
    { href: "/app/contacts", icon: Users, label: "Contacts" },
    { href: "/app/organizations", icon: Building2, label: "Organisations" },
    { href: "#", icon: BarChart3, label: "Rapports (Lot 2)" },
    { href: "#", icon: BookOpen, label: "Base de connaissances (Lot 3)" },
    { href: "/app/settings/team", icon: Settings, label: "Paramètres" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Barre latérale 64 px */}
      <aside
        className="flex w-16 shrink-0 flex-col items-center gap-1 border-r py-3"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg font-bold text-white"
          style={{ background: "var(--acc)" }}
          title={tenant.name}
        >
          {tenant.name[0]?.toUpperCase()}
        </div>
        <Link
          href="/app/tickets"
          title="Inbox"
          className="rounded-lg p-2.5"
          style={{ color: "var(--ink)" }}
        >
          <Inbox size={18} strokeWidth={1.8} />
        </Link>
        <SearchButton>
          <Search size={18} strokeWidth={1.8} />
        </SearchButton>
        {navItems.slice(1).map(({ href, icon: Icon, label }) => (
          <Link
            key={label}
            href={href}
            title={label}
            className="rounded-lg p-2.5"
            style={{ color: href === "#" ? "var(--mute)" : "var(--ink)" }}
          >
            <Icon size={18} strokeWidth={1.8} />
          </Link>
        ))}
        <div className="mt-auto flex flex-col items-center gap-1">
          <SignOutButton />
          <Avatar name={agent.name} size={30} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre supérieure */}
        <header
          className="flex h-12 shrink-0 items-center gap-3 border-b px-4"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <span className="text-sm font-semibold">{tenant.name}</span>
          <span className="flex-1" />
          <Link
            href="/app/tickets/new"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: "var(--acc)" }}
          >
            <Plus size={15} /> Nouveau ticket
          </Link>
          <button className="p-2" style={{ color: "var(--mute)" }} title="Notifications">
            <Bell size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>

      <CommandPalette />
    </div>
  );
}
