/**
 * Lecture d'une image d'article — publique, comme l'article qui la porte.
 *
 * La clé est validée strictement et doit commencer par l'identifiant du tenant
 * résolu depuis le domaine : sans cela, l'URL d'une image permettrait de lire
 * celles d'un autre workspace.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getKbImageBody } from "@/lib/storage";

const CLE = /^[0-9a-f-]{36}\/[\w.\- ]+$/i;

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
  const chemin = key.join("/");
  if (!CLE.test(chemin)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const tenant = await getTenantFromHeaders();
  if (!tenant || !chemin.startsWith(`${tenant.id}/`)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await getKbImageBody(chemin);
  if (!body) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const extension = chemin.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(body.transformToWebStream(), {
    headers: {
      "Content-Type": TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
