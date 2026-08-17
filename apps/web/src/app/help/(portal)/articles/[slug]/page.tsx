import Link from "next/link";
import { notFound } from "next/navigation";
import { db, kbArticles } from "@openhelpdesk/db";
import { and, eq, sql } from "drizzle-orm";
import { getPortalTenant } from "@/lib/portal-auth";
import { getPublishedArticle } from "@/lib/portal-data";
import { dateLongFr, readingMinutesFr } from "../../../portal-format";
import { ArticleBody } from "@/components/article-body";
import { parseArticle } from "@/lib/article-format";
import { VoteBlock } from "./vote-block";

/** PT-03 — Article : rendu riche 68ch, méta, vote, articles liés, TOC « Sur cette page ». */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await getPortalTenant();
  const { slug } = await params;
  if (!tenant) notFound();
  const data = await getPublishedArticle(tenant.id, slug);
  if (!data) notFound();
  const { article, related, root } = data;

  // Compteur de vues (alimente « Les plus consultés » de PT-01).
  await db
    .update(kbArticles)
    .set({ viewCount: sql`${kbArticles.viewCount} + 1` })
    .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, article.id)));

  const body = article.bodyHtml ?? "";
  const blocks = parseArticle(body);
  const toc = blocks.filter((b) => b.type === "h2");

  return (
    <div className="pt-rise px-8 py-11 max-sm:px-[18px] max-sm:py-7">
      <div className="mx-auto grid max-w-[1040px] grid-cols-[1fr_200px] gap-11 max-md:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-[22px]">
          <nav
            className="flex flex-wrap items-center gap-2 text-[13.5px]"
            style={{ color: "var(--ink-3)" }}
          >
            <Link href="/help" style={{ color: "inherit" }}>
              Aide
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

          <header className="flex flex-col gap-[9px]">
            <h1
              className="text-[34px] font-semibold leading-[1.15] tracking-[-0.03em]"
              style={{ textWrap: "balance" }}
            >
              {article.title}
            </h1>
            <p className="text-[13.5px]" style={{ color: "var(--ink-3)" }}>
              Mis à jour le {dateLongFr(article.updatedAt)} · {readingMinutesFr(body)} min de
              lecture
            </p>
          </header>

          <ArticleBody blocks={blocks} />

          <VoteBlock slug={article.slug} title={article.title} />

          {related.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2
                className="text-[12.5px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--ink-3)" }}
              >
                Articles liés
              </h2>
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/help/articles/${r.slug}`}
                  className="pt-related rounded-[10px] px-4 py-[13px] text-[15px]"
                >
                  {r.title}
                </Link>
              ))}
            </section>
          )}
        </div>

        {toc.length > 0 && (
          <aside className="flex flex-col gap-[7px] self-start max-md:hidden">
            <p
              className="pb-1 text-[12.5px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--ink-3)" }}
            >
              Sur cette page
            </p>
            {toc.map((h, i) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className="py-1.5 pl-3 text-[14.5px] hover:no-underline"
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
