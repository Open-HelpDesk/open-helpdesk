/**
 * Endpoint public CSAT (ST-08) — liens signés HMAC depuis l'email d'enquête.
 * GET enregistre la note et affiche la page de remerciement (+ commentaire optionnel) ;
 * POST enregistre le commentaire. Une réponse par ticket, la dernière note gagne.
 */
import { NextResponse, type NextRequest } from "next/server";
import { csatResponses, db, tickets } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { verifyCsatSignature } from "@openhelpdesk/rules";

function page(body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Votre avis</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;background:#f6f8f7;color:#11211c;
       display:flex;justify-content:center;padding:48px 16px;margin:0}
  .card{background:#fff;border:1px solid #e2e7e4;border-radius:12px;padding:32px;
        max-width:420px;width:100%}
  h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#5f6f68;margin:0 0 16px}
  textarea{width:100%;box-sizing:border-box;border:1px solid #e2e7e4;border-radius:8px;
           padding:10px;font:inherit;font-size:14px;min-height:90px}
  button{margin-top:10px;background:#0b5f46;color:#fff;border:0;border-radius:8px;
         padding:9px 16px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
</style></head><body><div class="card">${body}</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function recordScore(ticketId: string, score: "good" | "bad") {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  if (!ticket) return null;
  // Une réponse par ticket — la dernière note remplace la précédente.
  await db
    .delete(csatResponses)
    .where(and(eq(csatResponses.tenantId, ticket.tenantId), eq(csatResponses.ticketId, ticket.id)));
  await db.insert(csatResponses).values({
    tenantId: ticket.tenantId,
    ticketId: ticket.id,
    agentId: ticket.assigneeId,
    score,
  });
  return ticket;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const t = params.get("t") ?? "";
  const s = params.get("s") === "bad" ? "bad" : "good";
  const sig = params.get("sig") ?? "";
  if (!t || !verifyCsatSignature(t, s, sig)) {
    return page(`<h1>Lien invalide</h1><p>Ce lien d'enquête n'est pas valide ou a expiré.</p>`);
  }
  const ticket = await recordScore(t, s);
  if (!ticket) return page(`<h1>Demande introuvable</h1><p>Cette demande n'existe plus.</p>`);

  return page(
    `<h1>Merci pour votre retour${s === "good" ? " 👍" : ""}</h1>
     <p>Votre avis sur la demande #${ticket.number} a bien été enregistré${
       s === "bad" ? " — nous sommes désolés que la réponse n'ait pas convenu" : ""
     }.</p>
     <form method="post" action="/api/csat">
       <input type="hidden" name="t" value="${t}">
       <input type="hidden" name="s" value="${s}">
       <input type="hidden" name="sig" value="${sig}">
       <textarea name="comment" placeholder="Un commentaire ? (optionnel)"></textarea>
       <button type="submit">Envoyer le commentaire</button>
     </form>`,
  );
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const t = String(form.get("t") ?? "");
  const s = form.get("s") === "bad" ? "bad" : "good";
  const sig = String(form.get("sig") ?? "");
  const comment = String(form.get("comment") ?? "").trim().slice(0, 2000);
  if (!t || !verifyCsatSignature(t, s, sig)) {
    return page(`<h1>Lien invalide</h1><p>Ce lien d'enquête n'est pas valide.</p>`);
  }
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, t));
  if (ticket && comment) {
    await db
      .update(csatResponses)
      .set({ comment })
      .where(and(eq(csatResponses.tenantId, ticket.tenantId), eq(csatResponses.ticketId, ticket.id)));
  }
  return page(`<h1>Merci !</h1><p>Votre commentaire a bien été transmis à l'équipe.</p>`);
}
