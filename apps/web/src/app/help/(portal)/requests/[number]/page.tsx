import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { csatSignature } from "@openhelpdesk/rules";
import { getPortalContact } from "@/lib/portal-auth";
import { PORTAL_STATUS_LABELS, getContactRequest } from "@/lib/portal-data";
import { relativeFr } from "@/lib/format";
import { replyToRequest, toggleRequestResolved } from "../../../actions";

/**
 * PT-06 — Détail d'une demande (specs/12) : fil épuré (messages publics uniquement),
 * réponse, résoudre/rouvrir, bloc CSAT inline après résolution.
 */
export default async function RequestPage({ params }: { params: Promise<{ number: string }> }) {
  const session = await getPortalContact();
  if (!session) redirect("/help/login");
  const { number: numberParam } = await params;
  const number = Number(numberParam);
  if (!Number.isInteger(number)) notFound();

  const data = await getContactRequest(session.tenant.id, session.contact.id, number);
  if (!data) notFound();
  const { ticket, messages, attachmentsByMessage } = data;
  const isMine = ticket.requesterId === session.contact.id;
  const csatEnabled = (session.tenant.csatConfig as { enabled?: boolean }).enabled === true;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/help/requests" className="text-sm" style={{ color: "var(--mute)" }}>
        ← Mes demandes
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 text-xl font-semibold">{ticket.subject}</h1>
        <span
          className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={
            ticket.status === "waiting"
              ? { background: "var(--wait-t)", color: "var(--wait)" }
              : ticket.status === "resolved" || ticket.status === "closed"
                ? { background: "var(--ok-t)", color: "var(--ok)" }
                : { background: "var(--open-t)", color: "var(--open)" }
          }
        >
          {PORTAL_STATUS_LABELS[ticket.status]}
        </span>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--mute)" }}>
        Référence #{ticket.number} · créée le {ticket.createdAt.toLocaleDateString("fr-FR")}
      </p>

      {/* Fil — publics uniquement */}
      <div className="mt-5 flex flex-col gap-3">
        {messages.map((m) => (
          <article
            key={m.id}
            className="rounded-lg border p-4"
            style={
              m.authorType === "agent"
                ? { background: "var(--acc-t)", borderColor: "var(--line)" }
                : { background: "var(--panel)", borderColor: "var(--line)" }
            }
          >
            <p className="mb-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
              {m.authorType === "agent" ? "L'équipe support" : "Vous"} ·{" "}
              {relativeFr(m.createdAt)}
            </p>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.bodyText}</p>
            {(attachmentsByMessage.get(m.id) ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attachmentsByMessage.get(m.id)!.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/attachments/${a.id}`}
                    className="rounded border px-2 py-0.5 font-mono text-xs"
                    style={{ borderColor: "var(--line)", background: "var(--sunk)" }}
                  >
                    📎 {a.filename}
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* CSAT inline après résolution */}
      {isMine && ticket.status === "resolved" && csatEnabled && (
        <div
          className="mt-5 flex items-center gap-3 rounded-lg border p-4"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <p className="flex-1 text-sm font-medium">
            Comment évaluez-vous la réponse apportée ?
          </p>
          <a
            href={`/api/csat?t=${ticket.id}&s=good&sig=${csatSignature(ticket.id, "good")}`}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: "var(--ok)" }}
          >
            Bonne réponse
          </a>
          <a
            href={`/api/csat?t=${ticket.id}&s=bad&sig=${csatSignature(ticket.id, "bad")}`}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: "var(--dang)" }}
          >
            Mauvaise réponse
          </a>
        </div>
      )}

      {/* Répondre + résoudre/rouvrir */}
      {isMine && ticket.status !== "closed" && (
        <div className="mt-5">
          <form action={replyToRequest} className="flex flex-col gap-2">
            <input type="hidden" name="number" value={ticket.number} />
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Votre réponse…"
              className="resize-y rounded-md border px-3 py-2.5 text-[15px] outline-none"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}
            />
            <div className="flex items-center gap-2">
              <input name="files" type="file" multiple className="text-xs" title="10 Mo max par fichier" />
              <span className="flex-1" />
              <button
                type="submit"
                className="rounded-md px-4 py-2 text-sm font-semibold text-white"
                style={{ background: "var(--acc)" }}
              >
                Répondre
              </button>
            </div>
          </form>
          <form action={toggleRequestResolved} className="mt-2">
            <input type="hidden" name="number" value={ticket.number} />
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: "var(--line)", color: "var(--mute)" }}
            >
              {ticket.status === "resolved" ? "Rouvrir la demande" : "Marquer comme résolue"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
