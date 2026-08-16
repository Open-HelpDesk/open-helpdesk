import Link from "next/link";
import { notFound } from "next/navigation";
import { X } from "lucide-react";
import { requireAgent } from "@/lib/session";
import { getOrganization } from "@/lib/directory";
import { relativeFr } from "@/lib/format";
import { Avatar, PriorityDot, StatusChip } from "@/components/ticket-bits";
import { addOrgDomain, removeOrgDomain, toggleOrgSharedTickets } from "../actions";

/**
 * AG-08 — Organisation : fiche (specs/10). Domaines de rattachement en chips éditables,
 * toggle « les contacts peuvent voir les tickets de leur organisation », contacts, tickets.
 */
export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { id } = await params;
  const { error } = await searchParams;
  const data = await getOrganization(tenant.id, id);
  if (!data) notFound();
  const { org, members, tickets } = data;

  return (
    <div className="h-full overflow-y-auto p-6">
      <Link href="/app/organizations" className="font-mono text-xs" style={{ color: "var(--mute)" }}>
        ← Organisations
      </Link>
      <h1 className="mt-2 text-lg font-semibold">{org.name}</h1>

      {/* Domaines de rattachement */}
      <section
        className="mt-4 rounded-lg border p-4"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <p className="mb-1 text-sm font-semibold">Domaines de rattachement</p>
        <p className="mb-3 text-xs" style={{ color: "var(--mute)" }}>
          Tout contact dont l'email porte un de ces domaines est rattaché automatiquement à
          l'organisation. Les domaines grand public sont refusés.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {org.emailDomains.map((d) => (
            <form key={d} action={removeOrgDomain} className="inline-flex">
              <input type="hidden" name="organizationId" value={org.id} />
              <input type="hidden" name="domain" value={d} />
              <span
                className="inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-xs"
                style={{ background: "var(--sunk)", border: "1px solid var(--line)" }}
              >
                {d}
                <button type="submit" title={`Retirer ${d}`} style={{ color: "var(--mute)" }}>
                  <X size={12} />
                </button>
              </span>
            </form>
          ))}
          <form action={addOrgDomain} className="inline-flex items-center gap-1.5">
            <input type="hidden" name="organizationId" value={org.id} />
            <input
              name="domain"
              placeholder="ajouter-un-domaine.fr"
              className="w-44 rounded-md border px-2 py-1 font-mono text-xs"
              style={{ borderColor: "var(--line)", background: "var(--bg)" }}
            />
            <button
              type="submit"
              className="rounded-md border px-2 py-1 text-xs font-medium"
              style={{ borderColor: "var(--line)" }}
            >
              Ajouter
            </button>
          </form>
        </div>
        {error === "invalid-domain" && (
          <p className="mt-2 text-xs" style={{ color: "var(--dang)" }}>
            Domaine invalide, grand public, ou déjà rattaché à une autre organisation.
          </p>
        )}

        <form action={toggleOrgSharedTickets} className="mt-4 flex items-center gap-2">
          <input type="hidden" name="organizationId" value={org.id} />
          <button
            type="submit"
            role="switch"
            aria-checked={org.sharedTickets}
            className="relative h-5 w-9 rounded-full transition-colors"
            style={{ background: org.sharedTickets ? "var(--acc)" : "var(--line)" }}
            title="Basculer"
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
              style={{ left: org.sharedTickets ? 18 : 2 }}
            />
          </button>
          <span className="text-sm">
            Les contacts peuvent voir les tickets de leur organisation
          </span>
        </form>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Contacts */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Contacts ({members.length})</h2>
          {members.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--mute)" }}>
              Aucun contact rattaché.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {members.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/app/contacts/${m.id}`}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                  >
                    <Avatar name={m.name ?? m.email} size={22} />
                    <span className="min-w-0 flex-1 truncate font-medium">{m.name ?? m.email}</span>
                    <span className="text-xs tabular-nums" style={{ color: "var(--mute)" }}>
                      {m.ticketCount} ticket{m.ticketCount > 1 ? "s" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Tickets */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Tickets ({tickets.length})</h2>
          {tickets.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--mute)" }}>
              Aucun ticket.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {tickets.map((t) => (
                <li key={t.number}>
                  <Link
                    href={`/app/tickets/${t.number}`}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                  >
                    <PriorityDot priority={t.priority} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono text-xs" style={{ color: "var(--mute)" }}>
                        #{t.number}
                      </span>{" "}
                      {t.subject}
                    </span>
                    <StatusChip status={t.status} />
                    <span className="text-xs tabular-nums" style={{ color: "var(--mute)" }}>
                      {relativeFr(t.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
