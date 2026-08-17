import Link from "next/link";
import { getPortalTenant } from "@/lib/portal-auth";
import { listPublishedCategories, popularArticles } from "@/lib/portal-data";
import { numberFr, pluralFr } from "../portal-format";
import { PortalSearchBar } from "./search-bar";

/** PT-01 — Accueil du centre d'aide : hero teinté, recherche typeahead, catégories, top articles. */
export default async function HelpHome() {
  const tenant = await getPortalTenant();
  if (!tenant) return null;
  const [categories, popular] = await Promise.all([
    listPublishedCategories(tenant.id),
    popularArticles(tenant.id, 5),
  ]);
  const welcome =
    (tenant.portalConfig as { welcomeText?: string } | null)?.welcomeText ||
    "Comment pouvons-nous vous aider ?";

  return (
    <div className="pt-rise-hero">
      {/* Hero */}
      <div
        className="flex flex-col items-center gap-5 border-b px-8 py-14 max-sm:px-[18px] max-sm:py-[34px]"
        style={{ background: "var(--acc-t)", borderColor: "var(--acc-b)" }}
      >
        <div className="flex max-w-[600px] flex-col gap-[9px] text-center">
          <h1
            className="text-[38px] font-semibold leading-[1.15] tracking-[-0.025em] max-sm:text-[26px]"
            style={{ textWrap: "balance" }}
          >
            {welcome}
          </h1>
          <p className="text-base" style={{ color: "var(--ink-2)", textWrap: "pretty" }}>
            Parcourez les guides, ou contactez notre équipe du lundi au vendredi, de 9 h à 18 h.
          </p>
        </div>
        <PortalSearchBar />
      </div>

      {/* Contenu */}
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-[38px] px-8 py-11 max-sm:px-[18px] max-sm:py-7">
        <section className="flex flex-col gap-[15px]">
          <h2
            className="text-[12.5px] font-semibold uppercase tracking-[0.07em]"
            style={{ color: "var(--ink-3)" }}
          >
            Catégories
          </h2>
          <div className="grid grid-cols-3 gap-3.5 max-md:grid-cols-2 max-sm:grid-cols-1">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/help/categories/${c.slug}`}
                className="pt-card-cat flex flex-col gap-2 rounded-xl p-5 hover:no-underline"
                style={{ color: "var(--ink)" }}
              >
                <span
                  className="grid h-[34px] w-[34px] place-items-center rounded-[9px] text-[17px]"
                  style={{ background: "var(--acc-t)", color: "var(--acc)" }}
                >
                  {c.icon ?? "◆"}
                </span>
                <span className="text-base font-semibold tracking-[-0.01em]">{c.name}</span>
                {c.description && (
                  <span className="text-sm" style={{ color: "var(--ink-2)", textWrap: "pretty" }}>
                    {c.description}
                  </span>
                )}
                <span className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {pluralFr(c.articleCount, "article")}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-[1.5fr_1fr] gap-[26px] max-md:grid-cols-1">
          <section className="flex min-w-0 flex-col gap-3.5">
            <h2
              className="text-[12.5px] font-semibold uppercase tracking-[0.07em]"
              style={{ color: "var(--ink-3)" }}
            >
              Les plus consultés
            </h2>
            <div
              className="overflow-hidden rounded-xl border"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              {popular.map((a, i) => (
                <Link
                  key={a.slug}
                  href={`/help/articles/${a.slug}`}
                  className="pt-row flex items-center gap-3.5 border-b px-[18px] py-[15px] hover:no-underline"
                  style={{ borderColor: "var(--line-2)", color: "var(--ink)" }}
                >
                  <span className="w-4 flex-none font-mono text-xs" style={{ color: "var(--ink-3)" }}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-medium">{a.title}</span>
                  <span className="whitespace-nowrap text-[13px]" style={{ color: "var(--ink-3)" }}>
                    {numberFr(a.viewCount)} vues
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <aside
            className="flex flex-col gap-[11px] self-start rounded-xl p-6 text-white"
            style={{ background: "var(--acc)" }}
          >
            <p className="text-lg font-semibold tracking-[-0.01em]" style={{ textWrap: "balance" }}>
              Vous ne trouvez pas ce que vous cherchez ?
            </p>
            <p className="text-[14.5px] opacity-[.82]" style={{ textWrap: "pretty" }}>
              Notre équipe répond en moyenne en 34 minutes pendant les heures ouvrées.
            </p>
            <Link
              href="/help/requests/new"
              className="mt-1 grid h-11 place-items-center rounded-[9px] bg-white text-[15px] font-semibold hover:no-underline"
              style={{ color: "var(--acc)" }}
            >
              Soumettre une demande
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
