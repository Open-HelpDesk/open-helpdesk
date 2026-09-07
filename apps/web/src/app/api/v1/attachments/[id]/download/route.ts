/**
 * /api/v1/attachments/{id}/download — the file itself.
 *
 * Streamed from object storage rather than redirected to a signed URL: a signed
 * URL would be a second, unauthenticated way into the same file, valid for
 * whoever it reached. Here the API key is the only way in, and revoking it
 * closes the door immediately.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { attachments, db } from "@openhelpdesk/db";
import { apiError, withApi } from "@/lib/api";
import { getAttachmentBody } from "@/lib/storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "read", async ({ tenant }) => {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return apiError(404, "not_found", "No attachment with that id.");
    const [file] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.tenantId, tenant.id), eq(attachments.id, id)));
    if (!file) return apiError(404, "not_found", "No attachment with that id.");

    const body = await getAttachmentBody(file.storageKey);
    if (!body) return apiError(404, "not_found", "The stored file is missing.");

    return new Response(body.transformToWebStream(), {
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.sizeBytes),
        "content-disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "cache-control": "private, no-store",
      },
    });
  });
}
