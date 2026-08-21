/**
 * Authentification des webhooks d'ingestion email (/api/ingress/*) : secret
 * d'instance comparé en temps constant. Le tenant n'entre pas en jeu ici —
 * il est résolu par l'adresse destinataire (mailboxes.address, unique).
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
