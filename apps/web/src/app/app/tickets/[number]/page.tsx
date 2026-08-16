import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { requireAgent } from "@/lib/session";
import { getTicketByNumber } from "@/lib/data";
import { relativeFr, PRIORITY_LABELS_FR, STATUS_LABELS_FR } from "@/lib/format";
import { Avatar, PriorityDot, SlaBadge, StatusChip } from "@/components/ticket-bits";
import { sendReply, updateTicketProps } from "../actions";

/**
 * AG-04 — Détail ticket (specs/10) : en-tête, fil de conversation (réponses publiques /
 * notes internes jaunes / événements système), éditeur à onglets avec bouton scindé
 * « répondre & passer à », panneau propriétés 320 px.
 * Restent à venir : macros (/), variables, fusion, collision temps réel, pièces jointes.
 */
export default async function TicketPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { tenant } = await requireAgent();
  const { number: numberParam } = await params;
  const number = Number(numberParam);
  if (!Number.isInteger(number)) notFound();

  const data = await getTicketByNumber(tenant.id, number);
  if (!data) notFound();
  const { ticket, requester, organization, messages, agents, requesterTicketCount } = data;

  const authorName = (authorId: string | null, authorType: string) => {
    if (authorType === "contact") return requester.name ?? requester.email;
    if (authorType === "agent") return agents.find((a) => a.id === authorId)?.name ?? "Agent";
    return "Système";
  };

  return (
    <div className="flex h-full">
      {/* Colonne conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tête */}
        <header
          className="flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-3"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <Link href="/app/tickets" className="font-mono text-xs" style={{ color: "var(--mute)" }}>
            ← Inbox
          </Link>
          <span className="font-mono text-xs" style={{ color: "var(--mute)" }}>
            #{ticket.number}
          </span>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{ticket.subject}</h1>
          <StatusChip status={ticket.status} />
          <PriorityDot priority={ticket.priority} withLabel />
        </header>

        {/* Fil */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {messages.map((m) =>
            m.kind === "system_event" ? (
              <p key={m.id} className="text-center text-xs" style={{ color: "var(--mute)" }}>
                {m.bodyText} · {relativeFr(m.createdAt)}
              </p>
            ) : (
              <article
                key={m.id}
                className="rounded-lg border p-4"
                style={
                  m.kind === "internal_note"
                    ? { background: "var(--note)", borderColor: "var(--note-line)" }
                    : m.authorType === "agent"
                      ? { background: "var(--acc-t)", borderColor: "var(--line)" }
                      : { background: "var(--panel)", borderColor: "var(--line)" }
                }
              >
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <Avatar name={authorName(m.authorId, m.authorType)} size={20} />
                  <span className="font-semibold">{authorName(m.authorId, m.authorType)}</span>
                  {m.kind === "internal_note" && (
                    <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--wait)" }}>
                      <Lock size={11} /> Note interne
                    </span>
                  )}
                  <span style={{ color: "var(--mute)" }}>{relativeFr(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.bodyText}</p>
              </article>
            ),
          )}
        </div>

        {/* Éditeur */}
        <form
          action={sendReply}
          className="shrink-0 border-t p-4"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div className="mb-2 flex gap-4 text-sm">
            <label className="inline-flex items-center gap-1.5 font-medium">
              <input type="radio" name="kind" value="public_reply" defaultChecked /> Réponse
            </label>
            <label className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--wait)" }}>
              <input type="radio" name="kind" value="internal_note" /> Note interne
            </label>
          </div>
          <textarea
            name="body"
            required
            rows={3}
            placeholder={`Répondre à ${requester.name ?? requester.email}…`}
            className="w-full resize-y rounded-md border p-3 text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--bg)" }}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <label className="text-xs" style={{ color: "var(--mute)" }}>
              Envoyer &amp; passer à
            </label>
            <select
              name="nextStatus"
              defaultValue="waiting"
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--line)", background: "var(--bg)" }}
            >
              <option value="">— sans changement —</option>
              <option value="open">Ouvert</option>
              <option value="waiting">En attente</option>
              <option value="resolved">Résolu</option>
            </select>
            <button
              type="submit"
              className="rounded-md px-4 py-1.5 text-sm font-semibold text-white"
              style={{ background: "var(--acc)" }}
            >
              Envoyer
            </button>
          </div>
        </form>
      </div>

      {/* Panneau propriétés — 320 px */}
      <aside
        className="w-80 shrink-0 overflow-y-auto border-l p-4"
        style={{ background: "var(--sunk)", borderColor: "var(--line)" }}
      >
        <form action={updateTicketProps} className="flex flex-col gap-3">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <input type="hidden" name="number" value={ticket.number} />

          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            ASSIGNÉ
            <select
              name="assigneeId"
              defaultValue={ticket.assigneeId ?? ""}
              className="rounded-md border px-2 py-1.5 text-sm font-normal"
              style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
            >
              <option value="">Non assigné</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            PRIORITÉ
            <select
              name="priority"
              defaultValue={ticket.priority}
              className="rounded-md border px-2 py-1.5 text-sm font-normal"
              style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
            >
              {Object.entries(PRIORITY_LABELS_FR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            STATUT
            <select
              name="status"
              defaultValue={ticket.status}
              className="rounded-md border px-2 py-1.5 text-sm font-normal"
              style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
            >
              {Object.entries(STATUS_LABELS_FR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--line)", background: "var(--bg)" }}
          >
            Mettre à jour
          </button>
        </form>

        {/* SLA */}
        <div className="mt-5">
          <p className="mb-1.5 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            SLA
          </p>
          <div className="flex flex-col gap-1.5 text-xs">
            <SlaBadge
              firstRepliedAt={ticket.firstRepliedAt}
              firstReplyDueAt={ticket.firstReplyDueAt}
              resolveDueAt={ticket.resolveDueAt}
            />
            {ticket.firstReplyDueAt && (
              <span style={{ color: "var(--mute)" }}>
                1ʳᵉ réponse due : {ticket.firstReplyDueAt.toLocaleString("fr-FR")}
              </span>
            )}
            {ticket.resolveDueAt && (
              <span style={{ color: "var(--mute)" }}>
                Résolution due : {ticket.resolveDueAt.toLocaleString("fr-FR")}
              </span>
            )}
          </div>
        </div>

        {/* Contact */}
        <div className="mt-5 rounded-lg border p-3" style={{ background: "var(--bg)", borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2">
            <Avatar name={requester.name ?? requester.email} size={28} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{requester.name ?? requester.email}</p>
              <p className="truncate text-xs" style={{ color: "var(--mute)" }}>
                {requester.email}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--mute)" }}>
            {organization ? `${organization.name} · ` : ""}
            {requesterTicketCount} ticket{requesterTicketCount > 1 ? "s" : ""}
          </p>
        </div>

        {ticket.tags.length > 0 && (
          <div className="mt-5">
            <p className="mb-1.5 text-xs font-semibold" style={{ color: "var(--mute)" }}>
              TAGS
            </p>
            <div className="flex flex-wrap gap-1">
              {ticket.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                  style={{ background: "var(--sunk)", border: "1px solid var(--line)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
