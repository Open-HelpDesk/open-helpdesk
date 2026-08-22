/**
 * KB suggestions — hero typeahead (PT-01) and PT-04 deflection.
 * Public, scoped to the subdomain's tenant. Returns { title, slug, category }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getPortalContact, getPortalTenant } from "@/lib/portal-auth";
import { canReadKb } from "@/lib/portal-config";
import { searchArticles } from "@/lib/portal-data";

export async function GET(request: NextRequest) {
  const tenant = await getPortalTenant();
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!tenant || q.length < 2) return NextResponse.json([]);
  // Knowledge base not published, or restricted to signed-in people: the
  // typeahead must not stay an open window onto articles the pages refuse.
  if (!(await canReadKb(Boolean(await getPortalContact())))) return NextResponse.json([]);
  return NextResponse.json(await searchArticles(tenant.id, q, 4));
}
