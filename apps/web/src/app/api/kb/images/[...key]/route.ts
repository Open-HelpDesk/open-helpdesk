/**
 * Reading an article image — public, like the article that carries it.
 *
 * The key is validated strictly and must start with the id of the tenant
 * resolved from the domain: without that, an image's URL would allow reading
 * those of another workspace.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getKbImageBody } from "@/lib/storage";

const KEY = /^[0-9a-f-]{36}\/[\w.\- ]+$/i;

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
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

  const body = await getKbImageBody(path);
  if (!body) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(body.transformToWebStream(), {
    headers: {
      "Content-Type": TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
