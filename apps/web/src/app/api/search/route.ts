import { NextResponse, type NextRequest } from "next/server";
import { apiAgent } from "@/lib/session";
import { searchAll } from "@/lib/directory";

export async function GET(request: NextRequest) {
  const current = await apiAgent();
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ tickets: [], contacts: [], organizations: [] });
  }
  return NextResponse.json(await searchAll(current.tenant.id, q));
}
