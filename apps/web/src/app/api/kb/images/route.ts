/**
 * Dépôt d'une image d'article (glisser-déposer dans l'éditeur).
 *
 * Réservé aux agents du workspace. L'objet est rangé sous « kb/{tenantId}/… » :
 * la clé porte le tenant, ce qui permet à la lecture publique de vérifier qu'une
 * image appartient bien au workspace du domaine consulté.
 */
import { NextResponse, type NextRequest } from "next/server";
import { apiAgent } from "@/lib/session";
import { MAX_ATTACHMENT_BYTES, saveKbImage } from "@/lib/storage";

const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);

export async function POST(request: NextRequest) {
  const session = await apiAgent();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "fichier_manquant" }, { status: 400 });
  }
  if (!TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "format_non_supporte", detail: "PNG, JPEG, GIF, WebP ou SVG." },
      { status: 415 },
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: "fichier_trop_lourd", detail: "10 Mo maximum." },
      { status: 413 },
    );
  }

  const url = await saveKbImage(session.tenant.id, file);
  return NextResponse.json({ url }, { status: 201 });
}
