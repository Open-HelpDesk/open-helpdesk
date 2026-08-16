import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { listContacts } from "@/lib/directory";
import { relativeFr } from "@/lib/format";
import { Avatar } from "@/components/ticket-bits";

/**
 * AG-07 — Contacts : liste (specs/10). Demandeurs créés automatiquement au premier
 * email pour la plupart. Reste à venir : import CSV, fusion de contacts.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { q } = await searchParams;
  const rows = await listContacts(tenant.id, q?.trim() || undefined);

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="sticky top-0 flex h-12 items-center gap-3 border-b px-5"
        style={{ background: "var(--canvas)", borderColor: "var(--line)" }}
      >
        <h1 className="text-sm font-semibold">Contacts</h1>
        <span className="font-mono text-xs tabular-nums" style={{ color: "var(--mute)" }}>
          {rows.length}
        </span>
        <form className="ml-auto">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Rechercher un contact…"
            className="w-64 rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg)" }}
          />
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="py-24 text-center text-sm" style={{ color: "var(--mute)" }}>
          Aucun contact{q ? ` pour « ${q} »` : ""}.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b text-left font-mono text-[11px] uppercase tracking-wider"
              style={{ borderColor: "var(--line)", color: "var(--mute)" }}
            >
              <th className="py-2 pl-5 font-semibold">Nom</th>
              <th className="font-semibold">Email</th>
              <th className="font-semibold">Organisation</th>
              <th className="text-right font-semibold">Tickets</th>
              <th className="pr-5 text-right font-semibold">Dernier ticket</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className="border-b"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              >
                <td className="py-2.5 pl-5">
                  <Link href={`/app/contacts/${c.id}`} className="flex items-center gap-2 font-medium">
                    <Avatar name={c.name ?? c.email} size={22} />
                    {c.name ?? "—"}
                    {c.blocked && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: "var(--dang-t)", color: "var(--dang)" }}
                      >
                        Bloqué
                      </span>
                    )}
                  </Link>
                </td>
                <td style={{ color: "var(--mute)" }}>{c.email}</td>
                <td>{c.organizationName ?? "—"}</td>
                <td className="text-right tabular-nums">{c.ticketCount}</td>
                <td className="pr-5 text-right text-xs tabular-nums" style={{ color: "var(--mute)" }}>
                  {c.lastTicketAt ? relativeFr(new Date(c.lastTicketAt)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
