/**
 * Suggestions KB — typeahead du hero (PT-01) et déflexion de PT-04.
 * Public, scopé au tenant du sous-domaine. Renvoie { title, slug, category }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getPortalTenant } from "@/lib/portal-auth";
import { searchArticles } from "@/lib/portal-data";

export async function GET(request: NextRequest) {
  const tenant = await getPortalTenant();
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!tenant || q.length < 2) return NextResponse.json([]);
  return NextResponse.json(await searchArticles(tenant.id, q, 4));
}
