/** Suggestions KB pour la déflexion de PT-04 — public, scopé au tenant du sous-domaine. */
import { NextResponse, type NextRequest } from "next/server";
import { getPortalTenant } from "@/lib/portal-auth";
import { searchArticles } from "@/lib/portal-data";

export async function GET(request: NextRequest) {
  const tenant = await getPortalTenant();
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!tenant || q.length < 4) return NextResponse.json([]);
  return NextResponse.json(await searchArticles(tenant.id, q, 4));
}
