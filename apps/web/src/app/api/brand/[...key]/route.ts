/**
 * Reading a workspace's logo or favicon — public by nature.
 *
 * Public, but not open: the key must start with the id of the tenant resolved
 * from the domain, otherwise a logo's URL would allow reading another
 * workspace's files.
 *
 * This route is deliberately separate from the one for article images. A logo
 * must load where an article image has no business being: in the portal header
 * when the knowledge base is not published, and in the browser tab on the
 * agent side.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getBrandAssetBody } from "@/lib/storage";

const KEY = /^[0-9a-f-]{36}\/(logo|favicon)-[\w.\- ]+$/i;

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const path = key.join("/");
  if (!KEY.test(path)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const tenant = await getTenantFromHeaders();
  if (!tenant || !path.startsWith(`${tenant.id}/`)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await getBrandAssetBody(path);
  if (!body) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(body.transformToWebStream(), {
    headers: {
      // The URL carries a UUID: it changes on every replacement, so its
      // content never changes. The cache can be permanent, which avoids the
      // tab staying on the old favicon.
      "Content-Type": TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
