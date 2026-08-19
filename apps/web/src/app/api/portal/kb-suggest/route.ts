/**
 * Suggestions KB — typeahead du hero (PT-01) et déflexion de PT-04.
 * Public, scopé au tenant du sous-domaine. Renvoie { title, slug, category }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getPortalContact, getPortalTenant } from "@/lib/portal-auth";
import { canReadKb } from "@/lib/portal-config";
import { searchArticles } from "@/lib/portal-data";

export async function GET(request: NextRequest) {
  const tenant = await getPortalTenant();
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!tenant || q.length < 2) return NextResponse.json([]);
  // Base non publiée, ou réservée aux personnes connectées : le typeahead ne
  // doit pas rester la fenêtre ouverte sur des articles que les pages refusent.
  if (!(await canReadKb(Boolean(await getPortalContact())))) return NextResponse.json([]);
  return NextResponse.json(await searchArticles(tenant.id, q, 4));
}
