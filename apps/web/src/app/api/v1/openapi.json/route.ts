/**
 * The OpenAPI description of the v1 API, served by the API itself.
 *
 * Public on purpose: a description of the shape is not a secret, and an
 * integrator needs it before they have a key. The document is built in
 * lib/openapi.ts; this route only decides where it says the server is.
 */
import type { NextRequest } from "next/server";
import { openApiDocument } from "@openhelpdesk/openapi";

export async function GET(request: NextRequest) {
  // The origin the caller actually reached, so "Try it" in a documentation
  // viewer hits this workspace rather than a hard-coded example host.
  const origin = new URL(request.url).origin;
  return Response.json(openApiDocument(origin), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
