import Link from "next/link";
import { getPortalTenant } from "@/lib/portal-auth";
import { searchArticles } from "@/lib/portal-data";

/** Résultats de recherche du centre d'aide (PT-01). */
export default async function HelpSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const tenant = await getPortalTenant();
  const { q = "" } = await searchParams;
  const results = tenant && q.trim().length >= 2 ? await searchArticles(tenant.id, q.trim()) : [];

  return (
    <div>
      <Link href="/help" className="text-sm" style={{ color: "var(--mute)" }}>
        ← Centre d'aide
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Résultats pour « {q} »</h1>
      {results.length === 0 ? (
        <div className="mt-6">
          <p style={{ color: "var(--mute)" }}>Aucun article ne correspond.</p>
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
          {results.map((a) => (
            <li key={a.slug}>
              <Link href={`/help/articles/${a.slug}`} className="underline-offset-2 hover:underline">
                {a.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
