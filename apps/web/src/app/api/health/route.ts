/**
 * GET /api/health — machine endpoint for the monitoring stack (Prometheus
 * blackbox probes it every 30 s; Open Incident will consume the same signal).
 * 200 when everything vital answers ("ok", or "degraded" while a fresh worker
 * has not completed its first tick), 503 as soon as one vital organ is down —
 * a health endpoint that answers 200 while the workers are stopped would be
 * worse than none. Host-independent: no tenant is resolved, any host that
 * reaches the app can probe it.
 */
import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkHealth();
  return NextResponse.json(health, {
    status: health.status === "fail" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
