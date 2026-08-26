/**
 * Public CSAT endpoint (ST-08) — HMAC-signed links from the survey email.
 * GET records the score and renders the thank-you page (+ optional comment);
 * POST records the comment. One response per ticket, the last score wins.
 */
import { NextResponse, type NextRequest } from "next/server";
import { csatResponses, db, tickets } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { verifyCsatSignature } from "@openhelpdesk/rules";
import { getT, type Translate } from "@/i18n/server";
import { getTenantFromHeaders } from "@/lib/tenant";

/**
 * The 404 the pages get from `requireTenant()`, for a route handler.
 *
 * This endpoint assembles HTML, so it belongs to the same rule: nothing under
 * an invented subdomain may render a page. Its own guard is the signature, but
 * an invalid one still answers with a rendered "invalid link" page — enough to
 * make every hostname under the wildcard a live page. `notFound()` is for
 * components, hence a plain response here.
 */
async function tenantMissing(): Promise<boolean> {
  return (await getTenantFromHeaders().catch(() => null)) === null;
}

/** Escapes translated text: it ends up in hand-assembled HTML. */
function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

/**
 * The tenant's visual identity, revalidated here.
 *
 * These values go into HTML and into a stylesheet that are assembled by hand:
 * a color is interpolated into CSS, two URLs into attributes. They are already
 * validated when saved (ST-01), but a value that arrived by another path —
 * import, migration, direct write in the database — must not be able to close
 * a CSS declaration or an attribute. Anything that does not match the expected
 * shape exactly is ignored, and the page falls back to its default
 * appearance.
 */
type Brand = { accent: string; logo: string | null; favicon: string | null; name: string | null };

const DEFAULT_ACCENT = "#0b5f46";

async function brand(): Promise<Brand> {
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
    accent: hex(b.accentColor) ?? DEFAULT_ACCENT,
    logo: asset(b.logoUrl),
    favicon: asset(b.faviconUrl),
    name: tenant?.name ?? null,
  };
}

function page(t: Translate, m: Brand, body: string): NextResponse {
  // The header only appears if there is something to show: with neither logo
  // nor name, an empty strip above the card would say nothing.
  const header =
    m.logo || m.name
      ? `<div class="brand">${
          m.logo ? `<img src="${esc(m.logo)}" alt="">` : ""
        }${m.name ? `<span>${esc(m.name)}</span>` : ""}</div>`
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
</style></head><body>${header}<div class="card">${body}</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function recordScore(ticketId: string, score: "good" | "bad") {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  if (!ticket) return null;
  // One response per ticket — the last score replaces the previous one.
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
  if (await tenantMissing()) return new NextResponse("Not found", { status: 404 });
  const tr = await getT();
  const m = await brand();
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
  if (await tenantMissing()) return new NextResponse("Not found", { status: 404 });
  const tr = await getT();
  const m = await brand();
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
