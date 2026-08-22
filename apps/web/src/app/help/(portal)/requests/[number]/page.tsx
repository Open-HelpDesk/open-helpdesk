import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { csatSignature } from "@openhelpdesk/rules";
import { getPortalContact } from "@/lib/portal-auth";
import { getContactRequest } from "@/lib/portal-data";
import { statusKey } from "../../../portal-format";
import { displayName, firstName, initials } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { replyToRequest, toggleRequestResolved } from "../../../actions";
import { AttachButton } from "../attach";

function statusInk(status: string): string {
  if (status === "waiting") return "var(--wait)";
  if (status === "resolved") return "var(--ok)";
  if (status === "closed") return "var(--closed)";
  return "var(--open)";
}

/**
 * PT-06 — Request detail: thread with an avatar rail (customer panel / tinted agent),
 * reply area, CSAT block when resolved, meta sidebar + resolve/reopen.
 */
export default async function RequestPage({ params }: { params: Promise<{ number: string }> }) {
  const t = await getT();
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
              {t("chrome.myRequests")}
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

          {/* Thread — public messages only. The avatar sits outside the card and
              is linked to the next message by a rail: the conversation is followed
              vertically instead of stacking independent cards. */}
          <div className="flex flex-col">
            {messages.map((m) => {
              const isAgent = m.authorType === "agent";
              const agentName = isAgent && m.authorId ? agentsById.get(m.authorId) : null;
              const isMe = m.authorType === "contact" && m.authorId === session.contact.id;
              const author = isAgent
                ? t("request.agentAuthor", {
                    name: agentName ? firstName(agentName) : t("request.team"),
                    tenant: session.tenant.name,
                  })
                : isMe
                  ? t("request.you")
                  : displayName(requester?.name ?? null, requester?.email ?? "");
              const avatar = isAgent
                ? initials(agentName ?? session.tenant.name)
                : initials(
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
                      {avatar}
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
                        {t.fmt.messageTime(m.createdAt)}
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

          {/* CSAT block after resolution */}
          {showCsat && (
            <div
              className="flex flex-col gap-3.5 rounded-2xl border p-[22px]"
              style={{ background: "var(--acc-t)", borderColor: "var(--acc-b)" }}
            >
              <p className="pt-title text-xl tracking-[-0.01em]">{t("csat.question")}</p>
              <div className="flex flex-wrap gap-2.5">
                <a
                  href={`/api/csat?t=${ticket.id}&s=good&sig=${csatSignature(ticket.id, "good")}`}
                  className="flex h-[46px] items-center gap-2 rounded-full border px-[22px] text-[15px] font-semibold hover:no-underline"
                  style={{ borderColor: "var(--ok)", background: "var(--panel)", color: "var(--ok)" }}
                >
                  😊 {t("csat.satisfied")}
                </a>
                <a
                  href={`/api/csat?t=${ticket.id}&s=bad&sig=${csatSignature(ticket.id, "bad")}`}
                  className="flex h-[46px] items-center gap-2 rounded-full border px-[22px] text-[15px] font-medium hover:no-underline"
                  style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--ink)" }}
                >
                  😕 {t("csat.unsatisfied")}
                </a>
              </div>
              <form method="post" action="/api/csat" className="flex flex-col gap-2">
                <input type="hidden" name="t" value={ticket.id} />
                <input type="hidden" name="s" value="good" />
                <input type="hidden" name="sig" value={csatSignature(ticket.id, "good")} />
                <textarea
                  name="comment"
                  placeholder={t("csat.comment")}
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
                  {t("csat.send")}
                </button>
              </form>
            </div>
          )}

          {/* Reply area */}
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
                  placeholder={t("reply.placeholder")}
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
                    {t("reply.send")}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Meta sidebar */}
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
              <span style={{ color: "var(--ink-3)" }}>{t("meta.status")}</span>
              <span className="text-right font-semibold" style={{ color: statusInk(ticket.status) }}>
                {t(statusKey(ticket.status))}
              </span>
            </div>
            <div
              className="flex items-center justify-between gap-3 border-b px-4 py-3.5 text-sm"
              style={{ borderColor: "var(--line-2)" }}
            >
              <span style={{ color: "var(--ink-3)" }}>{t("meta.created")}</span>
              <span className="text-right font-semibold">{t.fmt.dateLong(ticket.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
              <span style={{ color: "var(--ink-3)" }}>{t("meta.reference")}</span>
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
                {ticket.status === "resolved" ? t("request.reopen") : t("request.markSolved")}
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
