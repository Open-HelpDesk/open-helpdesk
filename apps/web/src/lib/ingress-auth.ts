/**
 * Authentication of the email ingestion webhooks (/api/ingress/*): instance
 * secret compared in constant time. The tenant does not come into play here —
 * it is resolved from the recipient address (mailboxes.address, unique).
 */
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function ingressAuthorized(request: NextRequest): boolean {
  const secret = process.env.MAIL_INGRESS_SECRET ?? "dev-ingress-secret";
  const provided =
    request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-ingress-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
