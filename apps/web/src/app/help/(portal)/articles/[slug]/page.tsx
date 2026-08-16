import Link from "next/link";
import { notFound } from "next/navigation";
import { db, kbArticles } from "@openhelpdesk/db";
import { and, eq, sql } from "drizzle-orm";
import { getPortalTenant } from "@/lib/portal-auth";
import { getPublishedArticle } from "@/lib/portal-data";
import { voteArticle } from "../../actions";

/** PT-03 — Article (specs/12) : corps 68ch, vote utile, articles liés. */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await getPortalTenant();
  const { slug } = await params;
  if (!tenant) notFound();
  const data = await getPublishedArticle(tenant.id, slug);
  if (!data) notFound();
  const { article, related } = data;

  // Compteur de vues (alimente « les plus consultés » de PT-01).
  await db
    .update(kbArticles)
    .set({ viewCount: sql`${kbArticles.viewCount} + 1` })
    .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, article.id)));

  return (
    <article style={{ maxWidth: "68ch" }}>
      <nav className="text-sm" style={{ color: "var(--mute)" }}>
        <Link href="/help">Centre d'aide</Link> › {article.title}
      </nav>
      <h1 className="mt-2 text-2xl font-semibold" style={{ textWrap: "balance" }}>
        {article.title}
      </h1>
      <p className="mt-1 text-xs" style={{ color: "var(--mute)" }}>
        Mis à jour le {article.updatedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      <div className="mt-5 whitespace-pre-wrap leading-relaxed">{article.bodyHtml}</div>

      {/* Vote — le 👎 propose de créer une demande pré-remplie */}
      <div
        className="mt-8 flex items-center gap-3 rounded-lg border p-4"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <p className="flex-1 text-sm font-medium">Cet article vous a aidé ?</p>
        <form action={voteArticle}>
          <input type="hidden" name="slug" value={article.slug} />
          <input type="hidden" name="vote" value="up" />
          <button className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: "var(--line)" }}>
            👍 Oui
          </button>
        </form>
        <form action={voteArticle}>
          <input type="hidden" name="slug" value={article.slug} />
          <input type="hidden" name="vote" value="down" />
          <button className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: "var(--line)" }}>
            👎 Non
          </button>
        </form>
      </div>

      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--mute)" }}>
            Articles liés
          </h2>
          <ul className="flex flex-col gap-1 text-[15px]">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/help/articles/${r.slug}`} className="underline-offset-2 hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
