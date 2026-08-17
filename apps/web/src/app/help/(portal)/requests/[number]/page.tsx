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
 * PT-06 — Détail d'une demande : fil de cartes (client panel / agent teinté),
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
    <div className="pt-rise px-8 py-11 max-sm:px-[18px] max-sm:py-7">
      <div className="mx-auto grid max-w-[940px] grid-cols-[1fr_260px] gap-8 max-md:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-5">
          <nav className="flex items-center gap-2 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
            <Link href="/help/requests" style={{ color: "inherit" }}>
              Mes demandes
            </Link>
            <span>/</span>
            <span className="font-mono" style={{ color: "var(--ink-2)" }}>
              #{ticket.number}
            </span>
          </nav>

          <h1
            className="text-[26px] font-semibold tracking-[-0.02em]"
            style={{ textWrap: "balance" }}
          >
            {ticket.subject}
          </h1>

          {/* Fil — messages publics uniquement */}
          <div className="flex flex-col gap-3.5">
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
                <article
                  key={m.id}
                  className="overflow-hidden rounded-xl border"
                  style={{
                    borderColor: cardLine,
                    background: isAgent ? "var(--acc-t)" : "var(--panel)",
                  }}
                >
                  <div
                    className="flex items-center gap-2.5 border-b px-[15px] py-[11px]"
                    style={{ borderColor: cardLine }}
                  >
                    <span
                      className="grid h-[26px] w-[26px] place-items-center rounded-full text-[10px] font-bold"
                      style={
                        isAgent
                          ? { background: "var(--acc-t)", color: "var(--acc)", border: "1px solid var(--acc-b)" }
                          : { background: "var(--open-t)", color: "var(--open)" }
                      }
                    >
                      {initials}
                    </span>
                    <span className="text-[14.5px] font-semibold">{author}</span>
                    <span className="flex-1" />
                    <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                      {messageTimeFr(m.createdAt)}
                    </span>
                  </div>
                  <div
                    className="whitespace-pre-wrap px-[15px] py-3.5 text-[15.5px] leading-[1.65]"
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
                </article>
              );
            })}
          </div>

          {/* Bloc CSAT après résolution */}
          {showCsat && (
            <div
              className="flex flex-col gap-[13px] rounded-xl border p-5"
              style={{ background: "var(--acc-t)", borderColor: "var(--acc-b)" }}
            >
              <p className="text-[17px] font-semibold">Comment évaluez-vous cette réponse ?</p>
              <div className="flex flex-wrap gap-[9px]">
                <a
                  href={`/api/csat?t=${ticket.id}&s=good&sig=${csatSignature(ticket.id, "good")}`}
                  className="flex h-[46px] items-center gap-2 rounded-[9px] border px-[22px] text-[15px] font-semibold hover:no-underline"
                  style={{ borderColor: "var(--ok)", background: "var(--panel)", color: "var(--ok)" }}
                >
                  😊 Satisfait
                </a>
                <a
                  href={`/api/csat?t=${ticket.id}&s=bad&sig=${csatSignature(ticket.id, "bad")}`}
                  className="flex h-[46px] items-center gap-2 rounded-[9px] border px-[22px] text-[15px] font-medium hover:no-underline"
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
                  className="min-h-[72px] w-full resize-y rounded-[9px] border p-3 text-[15px] outline-none"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--panel)",
                    color: "var(--ink)",
                  }}
                />
                <button
                  type="submit"
                  className="grid h-10 w-fit place-items-center rounded-lg border px-4 text-sm font-medium"
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
                className="overflow-hidden rounded-xl border"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                <textarea
                  name="body"
                  required
                  placeholder="Écrire une réponse…"
                  className="min-h-[110px] w-full resize-y bg-transparent p-3.5 text-[15.5px] outline-none"
                  style={{ color: "var(--ink)" }}
                />
                <div
                  className="flex items-center gap-2.5 border-t px-3.5 py-[11px]"
                  style={{ borderColor: "var(--line)" }}
                >
                  <AttachButton />
                  <span className="flex-1" />
                  <button
                    type="submit"
                    className="grid h-[42px] place-items-center rounded-[9px] px-5 text-[15px] font-semibold text-white"
                    style={{ background: "var(--acc)" }}
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
            className="overflow-hidden rounded-xl border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-[15px] py-3 text-[14.5px]"
              style={{ borderColor: "var(--line-2)" }}
            >
              <span style={{ color: "var(--ink-3)" }}>Statut</span>
              <span className="text-right font-semibold" style={{ color: statusInk(ticket.status) }}>
                {PORTAL_STATUS_LABELS[ticket.status]}
              </span>
            </div>
            <div
              className="flex items-center justify-between gap-3 border-b px-[15px] py-3 text-[14.5px]"
              style={{ borderColor: "var(--line-2)" }}
            >
              <span style={{ color: "var(--ink-3)" }}>Créée le</span>
              <span className="text-right font-semibold">{dateLongFr(ticket.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-[15px] py-3 text-[14.5px]">
              <span style={{ color: "var(--ink-3)" }}>Référence</span>
              <span className="text-right font-mono font-semibold">#{ticket.number}</span>
            </div>
          </div>
          {isMine && ticket.status !== "closed" && (
            <form action={toggleRequestResolved}>
              <input type="hidden" name="number" value={ticket.number} />
              <button
                type="submit"
                className="grid h-[46px] w-full place-items-center rounded-[9px] border text-[14.5px] font-medium"
                style={{
                  borderColor: "var(--line)",
                  background: "var(--panel)",
                  color: "var(--ink)",
                }}
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
