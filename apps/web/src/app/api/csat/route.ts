/**
 * Endpoint public CSAT (ST-08) — liens signés HMAC depuis l'email d'enquête.
 * GET enregistre la note et affiche la page de remerciement (+ commentaire optionnel) ;
 * POST enregistre le commentaire. Une réponse par ticket, la dernière note gagne.
 */
import { NextResponse, type NextRequest } from "next/server";
import { csatResponses, db, tickets } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { verifyCsatSignature } from "@openhelpdesk/rules";
import { getT, type Translate } from "@/i18n/server";
import { getTenantFromHeaders } from "@/lib/tenant";

/** Échappe le texte traduit : il finit dans du HTML assemblé à la main. */
function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

/**
 * Identité visuelle du tenant, revalidée ici.
 *
 * Ces valeurs partent dans du HTML et dans une feuille de style assemblés à la
 * main : une couleur est interpolée dans du CSS, deux URL dans des attributs.
 * Elles sont déjà validées à l'enregistrement (ST-01), mais une valeur arrivée
 * par un autre chemin — import, migration, écriture directe en base — ne doit
 * pas pouvoir fermer une déclaration CSS ni un attribut. Ce qui ne correspond
 * pas exactement à la forme attendue est ignoré, et la page reprend son
 * apparence par défaut.
 */
type Marque = { accent: string; logo: string | null; favicon: string | null; nom: string | null };

const ACCENT_DEFAUT = "#0b5f46";

async function marque(): Promise<Marque> {
  const tenant = await getTenantFromHeaders().catch(() => null);
  const b = (tenant?.branding ?? {}) as {
    accentColor?: unknown;
    logoUrl?: unknown;
    faviconUrl?: unknown;
  };
  const hex = (v: unknown) =>
    typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
  const asset = (v: unknown) =>
    typeof v === "string" && /^\/api\/brand\/[0-9a-f-]{36}\/(logo|favicon)-[\w.\- ]+$/i.test(v)
      ? v
      : null;
  return {
    accent: hex(b.accentColor) ?? ACCENT_DEFAUT,
    logo: asset(b.logoUrl),
    favicon: asset(b.faviconUrl),
    nom: tenant?.name ?? null,
  };
}

function page(t: Translate, m: Marque, body: string): NextResponse {
  // L'entête n'apparaît que s'il y a quelque chose à montrer : sans logo ni nom,
  // une bande vide au-dessus de la carte ne dirait rien.
  const entete =
    m.logo || m.nom
      ? `<div class="brand">${
          m.logo ? `<img src="${esc(m.logo)}" alt="">` : ""
        }${m.nom ? `<span>${esc(m.nom)}</span>` : ""}</div>`
      : "";
  return new NextResponse(
    `<!doctype html><html lang="${t.locale.code}" dir="${t.locale.dir}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t("csatPage.title"))}</title>
${m.favicon ? `<link rel="icon" href="${esc(m.favicon)}">` : ""}
<style>
  body{font-family:Inter,system-ui,sans-serif;background:#f6f8f7;color:#11211c;
       display:flex;flex-direction:column;align-items:center;padding:48px 16px;margin:0}
  .brand{display:flex;align-items:center;gap:10px;margin:0 0 18px;font-size:16px;font-weight:600}
  .brand img{width:28px;height:28px;border-radius:7px;object-fit:contain}
  .card{background:#fff;border:1px solid #e2e7e4;border-radius:12px;padding:32px;
        max-width:420px;width:100%;box-sizing:border-box}
  h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#5f6f68;margin:0 0 16px}
  textarea{width:100%;box-sizing:border-box;border:1px solid #e2e7e4;border-radius:8px;
           padding:10px;font:inherit;font-size:14px;min-height:90px}
  button{margin-top:10px;background:${m.accent};color:#fff;border:0;border-radius:8px;
         padding:9px 16px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
</style></head><body>${entete}<div class="card">${body}</div></body></html>`,
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
  const tr = await getT();
  const m = await marque();
  const params = request.nextUrl.searchParams;
  const t = params.get("t") ?? "";
  const s = params.get("s") === "bad" ? "bad" : "good";
  const sig = params.get("sig") ?? "";
  if (!t || !verifyCsatSignature(t, s, sig)) {
    return page(
      tr,
      m,
      `<h1>${esc(tr("csatPage.invalidTitle"))}</h1><p>${esc(tr("csatPage.invalidBody"))}</p>`,
    );
  }
  const ticket = await recordScore(t, s);
  if (!ticket)
    return page(
      tr,
      m,
      `<h1>${esc(tr("csatPage.notFoundTitle"))}</h1><p>${esc(tr("csatPage.notFoundBody"))}</p>`,
    );

  const ref = `#${ticket.number}`;
  return page(
    tr,
    m,
    `<h1>${esc(tr("csatPage.thanks"))}${s === "good" ? " 👍" : ""}</h1>
     <p>${esc(
       s === "bad" ? tr("csatPage.recordedBad", { ref }) : tr("csatPage.recorded", { ref }),
     )}</p>
     <form method="post" action="/api/csat">
       <input type="hidden" name="t" value="${t}">
       <input type="hidden" name="s" value="${s}">
       <input type="hidden" name="sig" value="${sig}">
       <textarea name="comment" placeholder="${esc(tr("csatPage.commentPlaceholder"))}"></textarea>
       <button type="submit">${esc(tr("csat.send"))}</button>
     </form>`,
  );
}

export async function POST(request: NextRequest) {
  const tr = await getT();
  const m = await marque();
  const form = await request.formData();
  const t = String(form.get("t") ?? "");
  const s = form.get("s") === "bad" ? "bad" : "good";
  const sig = String(form.get("sig") ?? "");
  const comment = String(form.get("comment") ?? "").trim().slice(0, 2000);
  if (!t || !verifyCsatSignature(t, s, sig)) {
    return page(
      tr,
      m,
      `<h1>${esc(tr("csatPage.invalidTitle"))}</h1><p>${esc(tr("csatPage.invalidBody"))}</p>`,
    );
  }
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, t));
  if (ticket && comment) {
    await db
      .update(csatResponses)
      .set({ comment })
      .where(and(eq(csatResponses.tenantId, ticket.tenantId), eq(csatResponses.ticketId, ticket.id)));
  }
  return page(
    tr,
    m,
    `<h1>${esc(tr("csatPage.doneTitle"))}</h1><p>${esc(tr("csatPage.doneBody"))}</p>`,
  );
}
