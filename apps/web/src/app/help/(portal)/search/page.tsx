import Link from "next/link";
import { getPortalTenant } from "@/lib/portal-auth";
import { searchArticles } from "@/lib/portal-data";

/** Résultats de recherche du centre d'aide (PT-01) — état vide verbatim de la maquette. */
export default async function HelpSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const tenant = await getPortalTenant();
  const { q = "" } = await searchParams;
  const results = tenant && q.trim().length >= 2 ? await searchArticles(tenant.id, q.trim(), 12) : [];

  if (results.length === 0) {
    return (
      <div className="pt-rise flex flex-col items-center gap-3.5 px-8 py-14 text-center max-sm:px-[18px]">
        <p className="text-xl font-semibold">Aucun résultat pour «&nbsp;{q.trim()}&nbsp;»</p>
        <p
          className="max-w-[440px] text-[15.5px]"
          style={{ color: "var(--ink-2)", textWrap: "pretty" }}
        >
          Essayez des termes plus généraux, ou décrivez votre situation à notre équipe.
        </p>
        <Link
          href="/help/requests/new"
          className="grid h-[46px] place-items-center rounded-[9px] px-[22px] text-[15px] font-semibold text-white hover:no-underline"
          style={{ background: "var(--acc)" }}
        >
          Soumettre une demande
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-rise px-8 py-11 max-sm:px-[18px] max-sm:py-7">
      <div className="mx-auto flex max-w-[680px] flex-col gap-6">
        <nav className="flex items-center gap-2 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
          <Link href="/help" style={{ color: "inherit" }}>
            Aide
          </Link>
          <span>/</span>
          <span style={{ color: "var(--ink-2)" }}>Recherche</span>
        </nav>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          Résultats pour «&nbsp;{q.trim()}&nbsp;»
        </h1>
        <div
          className="overflow-hidden rounded-xl border"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          {results.map((a) => (
            <Link
              key={a.slug}
              href={`/help/articles/${a.slug}`}
              className="pt-row flex items-center gap-3.5 border-b px-[18px] py-[15px] hover:no-underline"
              style={{ borderColor: "var(--line-2)", color: "var(--ink)" }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--ink-3)" strokeWidth="1.8">
                <path d="M14 3v5h5" />
                <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
              </svg>
              <span className="min-w-0 flex-1 text-[15px] font-medium">{a.title}</span>
              {a.category && (
                <span className="whitespace-nowrap text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  {a.category}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
