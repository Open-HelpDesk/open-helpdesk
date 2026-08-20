/**
 * Lecture du logo ou du favicon d'un workspace — publique par nature.
 *
 * Publique, mais pas ouverte : la clé doit commencer par l'identifiant du tenant
 * résolu depuis le domaine, sans quoi l'URL d'un logo permettrait de lire les
 * fichiers d'un autre workspace.
 *
 * Cette route est délibérément distincte de celle des images d'articles. Un
 * logo doit se charger là où une image d'article n'a rien à faire : dans l'entête
 * du portail quand la base de connaissances n'est pas publiée, et dans l'onglet
 * du navigateur côté agent.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getBrandAssetBody } from "@/lib/storage";

const CLE = /^[0-9a-f-]{36}\/(logo|favicon)-[\w.\- ]+$/i;

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
  const chemin = key.join("/");
  if (!CLE.test(chemin)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const tenant = await getTenantFromHeaders();
  if (!tenant || !chemin.startsWith(`${tenant.id}/`)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await getBrandAssetBody(chemin);
  if (!body) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const extension = chemin.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(body.transformToWebStream(), {
    headers: {
      // L'URL porte un UUID : elle change à chaque remplacement, donc son
      // contenu ne change jamais. Le cache peut être définitif, ce qui évite
      // que l'onglet reste sur l'ancien favicon.
      "Content-Type": TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
