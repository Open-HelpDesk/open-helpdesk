/**
 * Logo of a catalogue application, for the employee portal (spec 19, D-SD7).
 *
 * `/api/attachments/<id>` serves agents and the contact of a ticket only, so
 * an employee could not load the logos of the catalogue they browse. This
 * route serves exactly one thing — the logo of a desk application — to:
 *  - a signed-in employee of the workspace (a portal contact paired with a
 *    person of the directory), for the apps of the visible catalogue;
 *  - an agent of the workspace, for every app (hidden ones included).
 * The file is read from storage the same way the attachments route reads it.
 *
 * The portal links here with `?v=<attachment id>`: a new logo is a new URL,
 * so a response for the current version can be cached by the browser. It is
 * private — the route requires a session — so shared caches never keep it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { apiAgent } from "@/lib/session";
import { getPortalContact } from "@/lib/portal-auth";
import { personForContact } from "@/lib/desk";
import { appLogo } from "@/lib/desk/portal-data";
import { getAttachmentBody } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only images: a logo slot holding anything else is not served. */
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

async function viewerTenant(): Promise<{ tenantId: string; agent: boolean } | null> {
  const agent = await apiAgent();
  if (agent) return { tenantId: agent.tenant.id, agent: true };
  const portal = await getPortalContact();
  if (!portal) return null;
  // A customer contact has no person behind it: not an employee, no catalogue.
  const person = await personForContact(portal.tenant.id, portal.contact.id);
  return person ? { tenantId: portal.tenant.id, agent: false } : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  if (!UUID.test(appId)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const viewer = await viewerTenant();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const logo = await appLogo(viewer.tenantId, appId, { includeHidden: viewer.agent });
  const contentType = logo?.contentType.toLowerCase().split(";")[0]!.trim() ?? "";
  if (!logo || !IMAGE_TYPES.has(contentType)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: Awaited<ReturnType<typeof getAttachmentBody>>;
  try {
    body = await getAttachmentBody(logo.storageKey);
  } catch {
    body = undefined;
  }
  if (!body) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const current = request.nextUrl.searchParams.get("v") === logo.id;
  return new NextResponse(body.transformToWebStream(), {
    headers: {
      "content-type": contentType,
      "content-length": String(logo.sizeBytes),
      "content-disposition": "inline",
      // The versioned URL never changes content; an unversioned one may.
      "cache-control": current ? "private, max-age=86400, immutable" : "private, no-cache",
      etag: `"${logo.id}"`,
      // An SVG opened on its own must not run anything on the workspace origin.
      "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
