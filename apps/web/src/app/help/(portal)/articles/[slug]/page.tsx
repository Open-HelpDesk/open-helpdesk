import Link from "next/link";
import { notFound } from "next/navigation";
import { db, kbArticles } from "@openhelpdesk/db";
import { and, eq, sql } from "drizzle-orm";
import { getPortalContact, getPortalTenant } from "@/lib/portal-auth";
import { canReadKb } from "@/lib/portal-config";
import { getPublishedArticle } from "@/lib/portal-data";
import { readingMinutes } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { ArticleBody } from "@/components/article-body";
import { parseArticle } from "@/lib/article-format";
import { VoteBlock } from "./vote-block";

/** PT-03 — Article: rich 66ch rendering, meta, vote, related articles, "On this page" TOC. */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getT();
  // ST-09: knowledge base not published, or restricted to signed-in people.
  if (!(await canReadKb(Boolean(await getPortalContact())))) notFound();
  const tenant = await getPortalTenant();
  const { slug } = await params;
  if (!tenant) notFound();
  const data = await getPublishedArticle(tenant.id, slug);
  if (!data) notFound();
  const { article, related, root } = data;

  // View counter (feeds PT-01's "Most viewed").
  await db
    .update(kbArticles)
    .set({ viewCount: sql`${kbArticles.viewCount} + 1` })
    .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, article.id)));

  const body = article.bodyHtml ?? "";
  const blocks = parseArticle(body);
  const toc = blocks.filter((b) => b.type === "h2");

  return (
    <div className="pt-rise px-9 pb-16 pt-12 max-sm:px-[18px] max-sm:py-[30px]">
      <div className="mx-auto grid max-w-[1060px] grid-cols-[1fr_210px] gap-12 max-md:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-6">
          <nav
            className="flex flex-wrap items-center gap-[9px] text-[13px]"
            style={{ color: "var(--ink-3)" }}
          >
            <Link href="/help" style={{ color: "inherit" }}>
              {t("breadcrumb.help")}
            </Link>
            {root && (
              <>
                <span>/</span>
                <Link href={`/help/categories/${root.slug}`} style={{ color: "inherit" }}>
                  {root.name}
                </Link>
              </>
            )}
            <span>/</span>
            <span style={{ color: "var(--ink-2)" }}>{article.title}</span>
          </nav>

          <header className="flex flex-col gap-[11px]">
            <h1
              className="pt-title text-[42px] leading-[1.08] tracking-[-0.022em] max-sm:text-[29px]"
              style={{ textWrap: "balance" }}
            >
              {article.title}
            </h1>
            <p className="text-[13px] tracking-[0.01em]" style={{ color: "var(--ink-3)" }}>
              {t("article.meta", {
                date: t.fmt.dateLong(article.updatedAt),
                count: readingMinutes(body),
              })}
            </p>
          </header>

          <ArticleBody blocks={blocks} />

          <VoteBlock slug={article.slug} title={article.title} />

          {related.length > 0 && (
            <section className="mt-2 flex flex-col gap-[11px]">
              <h2
                className="pt-eyebrow"
              >
                {t("article.related")}
              </h2>
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/help/articles/${r.slug}`}
                  className="pt-related flex items-center gap-3 rounded-xl px-[18px] py-[15px] text-[15px]"
                >
                  <span className="min-w-0 flex-1 font-medium">{r.title}</span>
                  <span aria-hidden className="text-[15px]" style={{ color: "var(--acc-b)" }}>
                    →
                  </span>
                </Link>
              ))}
            </section>
          )}
        </div>

        {toc.length > 0 && (
          <aside className="sticky top-0 flex flex-col gap-0.5 self-start max-md:hidden">
            <p
              className="pb-2.5 pt-eyebrow"
            >
              {t("article.onThisPage")}
            </p>
            {toc.map((h, i) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className={`py-2 pl-3.5 text-[14.5px] leading-[1.45] hover:no-underline ${i === 0 ? "font-semibold" : "font-[450]"}`}
                style={{
                  borderLeft: `2px solid ${i === 0 ? "var(--acc)" : "var(--line)"}`,
                  color: i === 0 ? "var(--acc-2)" : "var(--ink-2)",
                }}
              >
                {h.text}
              </a>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}
