import Link from "next/link";
import { notFound } from "next/navigation";
import { getPortalTenant } from "@/lib/portal-auth";
import { getCategoryWithSections } from "@/lib/portal-data";
import { excerptFr, pluralFr } from "../../../portal-format";

type ArticleItem = { title: string; slug: string; bodyHtml: string | null };

/** Item d'accordéon : titre 15/500 acc-2 + extrait 14 ink-2 (maquette PT-02). */
function ArticleRow({ article }: { article: ArticleItem }) {
  const excerpt = excerptFr(article.bodyHtml);
  return (
    <Link
      href={`/help/articles/${article.slug}`}
      className="pt-row flex flex-col gap-1 border-b px-5 py-[15px] hover:no-underline"
      style={{ borderColor: "var(--line-2)" }}
    >
      <span className="text-[15px] font-medium" style={{ color: "var(--acc-2)" }}>
        {article.title}
      </span>
      {excerpt && (
        <span
          className="text-sm leading-[1.5]"
          style={{ color: "var(--ink-2)", textWrap: "pretty" }}
        >
          {excerpt}
        </span>
      )}
    </Link>
  );
}

/** Accordéon de section : en-tête canvas et bordure accent quand ouvert, caret ▼/▶. */
function SectionAccordion({
  name,
  articles,
  defaultOpen,
}: {
  name: string;
  articles: ArticleItem[];
  defaultOpen: boolean;
}) {
  return (
    <details
      className="pt-acc pt-acc-card overflow-hidden rounded-2xl"
      style={{ background: "var(--panel)", boxShadow: "var(--sh-1)" }}
      open={defaultOpen}
    >
      <summary className="flex items-center gap-3 px-5 py-[17px]">
        <span className="w-2.5 flex-none text-[9px]" style={{ color: "var(--acc)" }}>
          <span className="pt-caret-o">▼</span>
          <span className="pt-caret-c">▶</span>
        </span>
        <span className="flex-1 text-[16.5px] font-semibold tracking-[-0.01em]">{name}</span>
        <span className="whitespace-nowrap text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          {pluralFr(articles.length, "article")}
        </span>
      </summary>
      <div className="border-t" style={{ borderColor: "var(--line-2)" }}>
        {articles.map((a) => (
          <ArticleRow key={a.slug} article={a} />
        ))}
      </div>
    </details>
  );
}

/** PT-02 — Catégorie : fil d'Ariane, accordéons par section, sidebar « Autres catégories ». */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await getPortalTenant();
  const { slug } = await params;
  if (!tenant) notFound();
  const data = await getCategoryWithSections(tenant.id, slug);
  if (!data) notFound();
  const { category, sections, directArticles, allCategories } = data;
  const withArticles = sections.filter((s) => s.articles.length > 0);

  return (
    <div className="pt-rise px-9 pb-[60px] pt-12 max-sm:px-[18px] max-sm:py-[30px]">
      <div className="mx-auto grid max-w-[1060px] grid-cols-[1fr_210px] gap-12 max-md:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-[26px]">
          <nav className="flex items-center gap-[9px] text-[13px]" style={{ color: "var(--ink-3)" }}>
            <Link href="/help" style={{ color: "inherit" }}>
              Aide
            </Link>
            <span>/</span>
            <span style={{ color: "var(--ink-2)" }}>{category.name}</span>
          </nav>

          <header className="flex flex-col gap-2.5">
            <h1 className="pt-title text-4xl leading-[1.1] tracking-[-0.02em] max-sm:text-[27px]">
              {category.name}
            </h1>
            {category.description && (
              <p
                className="max-w-[58ch] text-[17px] leading-[1.6]"
                style={{ color: "var(--ink-2)", textWrap: "pretty" }}
              >
                {category.description}
              </p>
            )}
          </header>

          {withArticles.length === 0 && directArticles.length > 0 ? (
            /* Pas de sections : liste simple dans une carte (accordéon implicite ouvert). */
            <div
              className="overflow-hidden rounded-2xl border"
              style={{
                background: "var(--panel)",
                borderColor: "var(--line)",
                boxShadow: "var(--sh-1)",
              }}
            >
              {directArticles.map((a) => (
                <ArticleRow key={a.slug} article={a} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-[11px]">
              {withArticles.map((s, i) => (
                <SectionAccordion key={s.id} name={s.name} articles={s.articles} defaultOpen={i === 0} />
              ))}
              {directArticles.length > 0 && (
                <SectionAccordion
                  name="Autres articles"
                  articles={directArticles}
                  defaultOpen={withArticles.length === 0}
                />
              )}
            </div>
          )}
        </div>

        <aside className="sticky top-0 flex flex-col gap-[3px] self-start max-md:hidden">
          <p
            className="pb-[9px] pt-eyebrow"
          >
            Autres catégories
          </p>
          {allCategories.map((c) => {
            const active = c.id === category.id;
            return (
              <Link
                key={c.id}
                href={`/help/categories/${c.slug}`}
                className={`pt-row rounded-[9px] px-3 py-[9px] text-[14.5px] hover:no-underline ${active ? "font-semibold" : "font-[450]"}`}
                style={
                  active
                    ? { background: "var(--acc-t)", color: "var(--acc)" }
                    : { color: "var(--ink-2)" }
                }
              >
                {c.name}
              </Link>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
