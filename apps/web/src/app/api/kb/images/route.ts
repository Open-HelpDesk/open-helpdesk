/**
 * Upload of an article image (drag-and-drop in the editor).
 *
 * Restricted to Owner and Admin, like writing articles. The object is stored under
 * "kb/{tenantId}/…":
 * the key carries the tenant, which lets the public read check that an image
 * really belongs to the workspace of the domain being visited.
 */
import { NextResponse, type NextRequest } from "next/server";
import { apiAgent, isManager } from "@/lib/session";
import { MAX_ATTACHMENT_BYTES, saveKbImage } from "@/lib/storage";

const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);

export async function POST(request: NextRequest) {
  const session = await apiAgent();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Uploading an image means writing to the knowledge base: same role
  // boundary as the editor that calls this route.
  if (!isManager(session.agent.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "unsupported_format", detail: "PNG, JPEG, GIF, WebP ou SVG." },
      { status: 415 },
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", detail: "10 Mo maximum." },
      { status: 413 },
    );
  }

  const url = await saveKbImage(session.tenant.id, file);
  return NextResponse.json({ url }, { status: 201 });
}
