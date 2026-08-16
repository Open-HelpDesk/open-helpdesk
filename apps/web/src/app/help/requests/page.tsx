import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContact } from "@/lib/portal-auth";
import {
  PORTAL_STATUS_LABELS,
  hasSharedOrganization,
  listContactRequests,
} from "@/lib/portal-data";
import { relativeFr } from "@/lib/format";

/** PT-05 — Mes demandes (specs/12) : vocabulaire client, onglet organisation si partagé. */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const session = await getPortalContact();
  if (!session) redirect("/help/login");
  const { scope: scopeParam } = await searchParams;

  const showOrgTab = await hasSharedOrganization(session.contact.id);
  const scope = scopeParam === "organization" && showOrgTab ? "organization" : "mine";
  const requests = await listContactRequests(session.tenant.id, session.contact.id, scope);

  return (
    <div>
      <h1 className="text-xl font-semibold">Mes demandes</h1>

      {showOrgTab && (
        <div className="mt-3 flex gap-1 border-b" style={{ borderColor: "var(--line)" }}>
          {(
            [
              ["mine", "Mes demandes"],
              ["organization", "Demandes de mon organisation"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={`/help/requests?scope=${key}`}
              className="border-b-2 px-3 py-2 text-sm font-medium"
              style={
                scope === key
                  ? { borderColor: "var(--acc)", color: "var(--acc)" }
                  : { borderColor: "transparent", color: "var(--mute)" }
              }
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="mt-8 text-center">
          <p style={{ color: "var(--mute)" }}>Aucune demande.</p>
          <Link
            href="/help/requests/new"
            className="mt-3 inline-block rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--acc)" }}
          >
            Soumettre une demande
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.number}>
              <Link
                href={`/help/requests/${r.number}`}
                className="flex items-center gap-3 rounded-lg border p-4"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                <span className="font-mono text-xs" style={{ color: "var(--mute)" }}>
                  #{r.number}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{r.subject}</span>
                <span
                  className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
                  style={
                    r.status === "waiting"
                      ? { background: "var(--wait-t)", color: "var(--wait)" }
                      : r.status === "resolved" || r.status === "closed"
                        ? { background: "var(--ok-t)", color: "var(--ok)" }
                        : { background: "var(--open-t)", color: "var(--open)" }
                  }
                >
                  {PORTAL_STATUS_LABELS[r.status]}
                </span>
                <span className="whitespace-nowrap text-xs tabular-nums" style={{ color: "var(--mute)" }}>
                  {relativeFr(r.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
