import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { csatSignature } from "@openhelpdesk/rules";
import { getPortalContact } from "@/lib/portal-auth";
import { PORTAL_STATUS_LABELS, getContactRequest } from "@/lib/portal-data";
import {
  dateLongFr,
  displayNameFr,
  firstNameFr,
  initialsFr,
  messageTimeFr,
} from "../../../portal-format";
import { replyToRequest, toggleRequestResolved } from "../../../actions";
import { AttachButton } from "../attach";

function statusInk(status: string): string {
  if (status === "waiting") return "var(--wait)";
  if (status === "resolved") return "var(--ok)";
  if (status === "closed") return "var(--closed)";
  return "var(--open)";
}

/**
 * PT-06 — Détail d'une demande : fil à rail d'avatars (client panel / agent teinté),
 * zone de réponse, bloc CSAT si résolue, sidebar méta + résoudre/rouvrir.
 */
export default async function RequestPage({ params }: { params: Promise<{ number: string }> }) {
  const session = await getPortalContact();
  if (!session) redirect("/help/login");
  const { number: numberParam } = await params;
  const number = Number(numberParam);
  if (!Number.isInteger(number)) notFound();

  const data = await getContactRequest(session.tenant.id, session.contact.id, number);
  if (!data) notFound();
  const { ticket, messages, attachmentsByMessage, agentsById, requester } = data;
  const isMine = ticket.requesterId === session.contact.id;
  const csatEnabled = (session.tenant.csatConfig as { enabled?: boolean }).enabled === true;
  const showCsat = isMine && ticket.status === "resolved" && csatEnabled;
  const canReply = isMine && ticket.status !== "closed";

  return (
    <div className="pt-rise px-9 pb-[60px] pt-12 max-sm:px-[18px] max-sm:py-[30px]">
      <div className="mx-auto grid max-w-[960px] grid-cols-[1fr_264px] gap-9 max-md:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-6">
          <nav className="flex items-center gap-[9px] text-[13px]" style={{ color: "var(--ink-3)" }}>
            <Link href="/help/requests" style={{ color: "inherit" }}>
              Mes demandes
            </Link>
            <span>/</span>
            <span className="font-mono" style={{ color: "var(--ink-2)" }}>
              #{ticket.number}
            </span>
          </nav>

          <h1
            className="pt-title text-[31px] leading-[1.12] tracking-[-0.02em] max-sm:text-2xl"
            style={{ textWrap: "balance" }}
          >
            {ticket.subject}
          </h1>

          {/* Fil — messages publics uniquement. L'avatar sort de la carte et se
              relie au message suivant par un rail : la conversation se suit
              verticalement au lieu d'empiler des cartes indépendantes. */}
          <div className="flex flex-col">
            {messages.map((m) => {
              const isAgent = m.authorType === "agent";
              const agentName = isAgent && m.authorId ? agentsById.get(m.authorId) : null;
              const isMe = m.authorType === "contact" && m.authorId === session.contact.id;
              const author = isAgent
                ? `${agentName ? firstNameFr(agentName) : "L'équipe"} — ${session.tenant.name}`
                : isMe
                  ? "Vous"
                  : displayNameFr(requester?.name ?? null, requester?.email ?? "");
              const initials = isAgent
                ? initialsFr(agentName ?? session.tenant.name)
                : initialsFr(
                    (isMe ? session.contact.name ?? session.contact.email : null) ??
                      requester?.name ??
                      requester?.email ??
                      "?",
                  );
              const cardLine = isAgent ? "var(--acc-b)" : "var(--line)";
              const files = attachmentsByMessage.get(m.id) ?? [];
              return (
                <article key={m.id} className="pt-thread-item flex items-stretch gap-3.5 pb-3.5">
                  <div className="flex w-[34px] flex-none flex-col items-center gap-2">
                    <span
                      className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full text-[11px] font-bold"
                      style={{
                        border: `1px solid ${cardLine}`,
                        ...(isAgent
                          ? { background: "var(--acc-t)", color: "var(--acc)" }
                          : { background: "var(--open-t)", color: "var(--open)" }),
                      }}
                    >
                      {initials}
                    </span>
                    <span aria-hidden className="pt-thread-rail w-px flex-1" />
                  </div>
                  <div
                    className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border px-[18px] py-[15px]"
                    style={{
                      borderColor: cardLine,
                      background: isAgent ? "var(--acc-t)" : "var(--panel)",
                      boxShadow: "var(--sh-1)",
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[14.5px] font-semibold">{author}</span>
                      <span className="flex-1" />
                      <span
                        className="text-[12.5px] tabular-nums"
                        style={{ color: "var(--ink-3)" }}
                      >
                        {messageTimeFr(m.createdAt)}
                      </span>
                    </div>
                    <div
                      className="whitespace-pre-wrap text-[15.5px] leading-[1.7]"
                      style={{ textWrap: "pretty" }}
                    >
                      {m.bodyText}
                      {files.length > 0 && (
                        <span className="mt-2.5 flex flex-wrap gap-1.5">
                          {files.map((a) => (
                            <a
                              key={a.id}
                              href={`/api/attachments/${a.id}`}
                              className="rounded-md border px-2 py-0.5 font-mono text-xs hover:no-underline"
                              style={{
                                borderColor: "var(--line)",
                                background: "var(--sunk)",
                                color: "var(--ink-2)",
                              }}
                            >
                              📎 {a.filename}
                            </a>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Bloc CSAT après résolution */}
          {showCsat && (
            <div
              className="flex flex-col gap-3.5 rounded-2xl border p-[22px]"
              style={{ background: "var(--acc-t)", borderColor: "var(--acc-b)" }}
            >
              <p className="pt-title text-xl tracking-[-0.01em]">
                Comment évaluez-vous cette réponse ?
              </p>
              <div className="flex flex-wrap gap-2.5">
                <a
                  href={`/api/csat?t=${ticket.id}&s=good&sig=${csatSignature(ticket.id, "good")}`}
                  className="flex h-[46px] items-center gap-2 rounded-full border px-[22px] text-[15px] font-semibold hover:no-underline"
                  style={{ borderColor: "var(--ok)", background: "var(--panel)", color: "var(--ok)" }}
                >
                  😊 Satisfait
                </a>
                <a
                  href={`/api/csat?t=${ticket.id}&s=bad&sig=${csatSignature(ticket.id, "bad")}`}
                  className="flex h-[46px] items-center gap-2 rounded-full border px-[22px] text-[15px] font-medium hover:no-underline"
                  style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--ink)" }}
                >
                  😕 Insatisfait
                </a>
              </div>
              <form method="post" action="/api/csat" className="flex flex-col gap-2">
                <input type="hidden" name="t" value={ticket.id} />
                <input type="hidden" name="s" value="good" />
                <input type="hidden" name="sig" value={csatSignature(ticket.id, "good")} />
                <textarea
                  name="comment"
                  placeholder="Un commentaire à ajouter ? (facultatif)"
                  className="min-h-[76px] w-full resize-y rounded-[11px] border p-3.5 text-[15px] outline-none"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--panel)",
                    color: "var(--ink)",
                  }}
                />
                <button
                  type="submit"
                  className="grid h-10 w-fit place-items-center rounded-[10px] border px-4 text-sm font-medium"
                  style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--ink)" }}
                >
                  Envoyer le commentaire
                </button>
              </form>
            </div>
          )}

          {/* Zone de réponse */}
          {canReply && (
            <form action={replyToRequest}>
              <input type="hidden" name="number" value={ticket.number} />
              <div
                className="overflow-hidden rounded-2xl border"
                style={{
                  background: "var(--panel)",
                  borderColor: "var(--line)",
                  boxShadow: "var(--sh-1)",
                }}
              >
                <textarea
                  name="body"
                  required
                  placeholder="Écrire une réponse…"
                  className="min-h-[112px] w-full resize-y bg-transparent p-4 text-[15.5px] outline-none"
                  style={{ color: "var(--ink)" }}
                />
                <div
                  className="flex items-center gap-2.5 border-t px-3.5 py-3"
                  style={{ borderColor: "var(--line-2)", background: "var(--canvas)" }}
                >
                  <AttachButton />
                  <span className="flex-1" />
                  <button
                    type="submit"
                    className="grid h-[42px] place-items-center rounded-[10px] px-[22px] text-[14.5px] font-semibold text-white"
                    style={{ background: "var(--cta-a)" }}
                  >
                    Envoyer
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Sidebar méta */}
        <aside className="flex flex-col gap-3.5 self-start">
          <div
            className="overflow-hidden rounded-2xl border"
            style={{
              background: "var(--panel)",
              borderColor: "var(--line)",
              boxShadow: "var(--sh-1)",
            }}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-4 py-3.5 text-sm"
              style={{ borderColor: "var(--line-2)" }}
            >
              <span style={{ color: "var(--ink-3)" }}>Statut</span>
              <span className="text-right font-semibold" style={{ color: statusInk(ticket.status) }}>
                {PORTAL_STATUS_LABELS[ticket.status]}
              </span>
            </div>
            <div
              className="flex items-center justify-between gap-3 border-b px-4 py-3.5 text-sm"
              style={{ borderColor: "var(--line-2)" }}
            >
              <span style={{ color: "var(--ink-3)" }}>Créée le</span>
              <span className="text-right font-semibold">{dateLongFr(ticket.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
              <span style={{ color: "var(--ink-3)" }}>Référence</span>
              <span className="text-right font-mono font-semibold">#{ticket.number}</span>
            </div>
          </div>
          {isMine && ticket.status !== "closed" && (
            <form action={toggleRequestResolved}>
              <input type="hidden" name="number" value={ticket.number} />
              <button
                type="submit"
                className="pt-outline grid h-[46px] w-full place-items-center rounded-[10px] text-[14.5px] font-medium"
              >
                {ticket.status === "resolved" ? "Rouvrir la demande" : "Marquer comme résolue"}
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
