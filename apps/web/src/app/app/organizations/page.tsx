import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { listOrganizations } from "@/lib/directory";

/**
 * AG-08 — Organisations : liste (specs/10) — nom, domaines, contacts, tickets ouverts.
 */
export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { q } = await searchParams;
  const rows = await listOrganizations(tenant.id, q?.trim() || undefined);

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="sticky top-0 flex h-12 items-center gap-3 border-b px-5"
        style={{ background: "var(--canvas)", borderColor: "var(--line)" }}
      >
        <h1 className="text-sm font-semibold">Organisations</h1>
        <span className="font-mono text-xs tabular-nums" style={{ color: "var(--mute)" }}>
          {rows.length}
        </span>
        <form className="ml-auto">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Rechercher…"
            className="w-64 rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg)" }}
          />
        </form>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b text-left font-mono text-[11px] uppercase tracking-wider"
            style={{ borderColor: "var(--line)", color: "var(--mute)" }}
          >
            <th className="py-2 pl-5 font-semibold">Nom</th>
            <th className="font-semibold">Domaines</th>
            <th className="text-right font-semibold">Contacts</th>
            <th className="pr-5 text-right font-semibold">Tickets ouverts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <td className="py-2.5 pl-5">
                <Link href={`/app/organizations/${o.id}`} className="font-medium">
                  {o.name}
                </Link>
              </td>
              <td>
                <span className="flex flex-wrap gap-1">
                  {o.emailDomains.map((d) => (
                    <span
                      key={d}
                      className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                      style={{ background: "var(--sunk)", border: "1px solid var(--line)" }}
                    >
                      {d}
                    </span>
                  ))}
                </span>
              </td>
              <td className="text-right tabular-nums">{o.contactCount}</td>
              <td className="pr-5 text-right tabular-nums">{o.openTickets}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
