import { NextResponse, type NextRequest } from "next/server";
import { apiAgent, isManager } from "@/lib/session";
import { searchAll } from "@/lib/directory";

export async function GET(request: NextRequest) {
  const current = await apiAgent();
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ tickets: [], contacts: [], organizations: [] });
  }
  // Les brouillons ne remontent qu'à qui peut les ouvrir : la palette ⌘K est
  // servie à tous les rôles, la frontière se pose donc ici, pas dans le composant.
  return NextResponse.json(
    await searchAll(current.tenant.id, q, isManager(current.agent.role)),
  );
}
