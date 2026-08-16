import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { getContact } from "@/lib/directory";
import { relativeFr } from "@/lib/format";
import { Avatar, PriorityDot, StatusChip } from "@/components/ticket-bits";
import { toggleContactBlocked } from "../actions";

/**
 * AG-07 — Contact : fiche (specs/10). En-tête identité, tickets, infos, blocage spam.
 * Reste à venir : fusion de deux contacts, suppression RGPD avec anonymisation, activité.
 */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireAgent();
  const { id } = await params;
  const data = await getContact(tenant.id, id);
  if (!data) notFound();
  const { contact, orgs, tickets } = data;

  return (
    <div className="h-full overflow-y-auto p-6">
      <Link href="/app/contacts" className="font-mono text-xs" style={{ color: "var(--mute)" }}>
        ← Contacts
      </Link>

      <div className="mt-3 flex items-center gap-4">
        <Avatar name={contact.name ?? contact.email} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            {contact.name ?? contact.email}
            {contact.blocked && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ background: "var(--dang-t)", color: "var(--dang)" }}
              >
                Bloqué (spam)
              </span>
            )}
          </h1>
          <p className="text-sm" style={{ color: "var(--mute)" }}>
            {contact.email}
            {contact.phone ? ` · ${contact.phone}` : ""}
            {orgs.length > 0 && (
              <>
                {" · "}
                {orgs.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ", "}
                    <Link href={`/app/organizations/${o.id}`} className="underline">
                      {o.name}
                    </Link>
                  </span>
                ))}
              </>
            )}
          </p>
        </div>
        <form action={toggleContactBlocked}>
          <input type="hidden" name="contactId" value={contact.id} />
          <button
            type="submit"
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
            style={
              contact.blocked
                ? { borderColor: "var(--line)", color: "var(--ink)" }
                : { borderColor: "var(--dang)", color: "var(--dang)" }
            }
          >
            {contact.blocked ? "Débloquer" : "Bloquer (spam)"}
          </button>
        </form>
      </div>

      <h2 className="mb-2 mt-8 text-sm font-semibold">Tickets ({tickets.length})</h2>
      {tickets.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--mute)" }}>
          Aucun ticket.
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {tickets.map((t) => (
              <tr key={t.number} className="border-b" style={{ borderColor: "var(--line)" }}>
                <td className="w-8 py-2">
                  <PriorityDot priority={t.priority} />
                </td>
                <td className="max-w-0 truncate py-2 pr-3">
                  <Link href={`/app/tickets/${t.number}`} className="font-medium">
                    <span className="font-mono text-xs" style={{ color: "var(--mute)" }}>
                      #{t.number}
                    </span>{" "}
                    {t.subject}
                  </Link>
                </td>
                <td className="whitespace-nowrap pr-3">
                  <StatusChip status={t.status} />
                </td>
                <td
                  className="whitespace-nowrap text-right text-xs tabular-nums"
                  style={{ color: "var(--mute)" }}
                >
                  {relativeFr(t.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
