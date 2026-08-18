import Link from "next/link";
import { getPortalTenant } from "@/lib/portal-auth";
import { searchArticles } from "@/lib/portal-data";
import { getT } from "@/i18n/server";

/** Résultats de recherche du centre d'aide (PT-01) — état vide verbatim de la maquette. */
export default async function HelpSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const t = await getT();
  const tenant = await getPortalTenant();
  const { q = "" } = await searchParams;
  const results = tenant && q.trim().length >= 2 ? await searchArticles(tenant.id, q.trim(), 12) : [];

  if (results.length === 0) {
    return (
      <div className="pt-rise flex flex-col items-center gap-[15px] px-9 py-[72px] text-center max-sm:px-[18px]">
        <p className="pt-title text-[26px] tracking-[-0.015em]">
          {t("search.emptyTitle", { query: q.trim() })}
        </p>
        <p
          className="max-w-[44ch] text-base"
          style={{ color: "var(--ink-2)", textWrap: "pretty" }}
        >
          {t("search.emptyBody")}
        </p>
        <Link
          href="/help/requests/new"
          className="mt-1.5 grid h-12 place-items-center rounded-[10px] px-6 text-[15px] font-semibold text-white hover:no-underline"
          style={{ background: "var(--cta-a)", boxShadow: "var(--sh-2)" }}
        >
          {t("chrome.submitRequest")}
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-rise px-9 pb-[60px] pt-12 max-sm:px-[18px] max-sm:py-[30px]">
      <div className="mx-auto flex max-w-[700px] flex-col gap-6">
        <nav className="flex items-center gap-[9px] text-[13px]" style={{ color: "var(--ink-3)" }}>
          <Link href="/help" style={{ color: "inherit" }}>
            {t("breadcrumb.help")}
          </Link>
          <span>/</span>
          <span style={{ color: "var(--ink-2)" }}>{t("search.breadcrumb")}</span>
        </nav>
        <h1 className="pt-title text-4xl leading-[1.1] tracking-[-0.02em] max-sm:text-[27px]">
          {t("search.resultsTitle", { query: q.trim() })}
        </h1>
        <div
          className="overflow-hidden rounded-2xl border"
          style={{
            background: "var(--panel)",
            borderColor: "var(--line)",
            boxShadow: "var(--sh-1)",
          }}
        >
          {results.map((a) => (
            <Link
              key={a.slug}
              href={`/help/articles/${a.slug}`}
              className="pt-row flex items-center gap-[13px] border-b px-5 py-4 hover:no-underline"
              style={{ borderColor: "var(--line-2)", color: "var(--ink)" }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--acc)" strokeWidth="1.7">
                <path d="M14 3v5h5" />
                <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
              </svg>
              <span className="min-w-0 flex-1 text-[15px] font-medium">{a.title}</span>
              {a.category && (
                <span
                  className="whitespace-nowrap text-xs uppercase tracking-[0.03em]"
                  style={{ color: "var(--ink-3)" }}
                >
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
