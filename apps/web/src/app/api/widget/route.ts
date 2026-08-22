/**
 * Embeddable widget (ST-09): script served from the tenant's subdomain.
 * Client snippet: <script src="https://{slug}.open-helpdesk.com/api/widget" async></script>
 * Configurable floating button → iframe to /widget (compact form).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getPortalTenant } from "@/lib/portal-auth";
import { getT } from "@/i18n/server";

export async function GET(request: NextRequest) {
  const t = await getT();
  const tenant = await getPortalTenant();
  if (!tenant) return new NextResponse("// tenant not found", { status: 404 });

  const config = (tenant.portalConfig ?? {}) as {
    widget?: { enabled?: boolean; color?: string; position?: string; title?: string };
  };
  const widget = config.widget ?? {};
  if (widget.enabled === false) {
    return new NextResponse("// widget disabled", {
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }
  const accent =
    widget.color ??
    ((tenant.branding as { accentColor?: string } | null)?.accentColor ?? "#0B5F46");
  const position = widget.position === "left" ? "left" : "right";
  // JSON.stringify escapes for the JS context; we strip only <> as a defence.
  const title = (widget.title ?? t("widget.defaultTitle")).replace(/[<>]/g, "");
  const origin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;

  // Floating pill + panel with 12 px corners, 0 8px 24px shadow — ST-09 preview.
  const js = `(function(){
  if (window.__ohdWidget) return; window.__ohdWidget = true;
  var label = ${JSON.stringify(`💬 ${title}`)};
  var btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");
  btn.style.cssText = "position:fixed;bottom:20px;${position}:20px;z-index:2147483000;" +
    "background:${accent};color:#fff;border:0;border-radius:999px;padding:0 18px;height:44px;" +
    "font:600 14.5px/1 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2)";
  var frame = null;
  btn.addEventListener("click", function(){
    if (frame) {
      frame.remove(); frame = null;
      btn.textContent = label; btn.setAttribute("aria-expanded", "false");
      return;
    }
    frame = document.createElement("iframe");
    frame.src = "${origin}/widget";
    frame.title = ${JSON.stringify(title)};
    frame.style.cssText = "position:fixed;bottom:76px;${position}:20px;z-index:2147483000;" +
      "width:min(380px,calc(100vw - 40px));height:min(560px,calc(100vh - 110px));" +
      "border:1px solid rgba(0,0,0,.10);border-radius:12px;background:#fff;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.14)";
    document.body.appendChild(frame);
    btn.textContent = ${JSON.stringify(`✕ ${t("widget.close")}`)};
    btn.setAttribute("aria-expanded", "true");
  });
  document.body.appendChild(btn);
})();`;

  return new NextResponse(js, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
