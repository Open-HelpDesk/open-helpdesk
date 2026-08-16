import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { db, kbArticles, kbCategories } from "@openhelpdesk/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { deleteArticle, saveArticle } from "../actions";

/**
 * AG-10 — Éditeur d'article : brouillon / publication. Reste à venir : éditeur riche,
 * SEO/slug avancé, articles liés, historique des versions, aperçu portail.
 */
export default async function KbEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cat?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { id } = await params;
  const { cat } = await searchParams;
  const isNew = id === "new";

  const article = isNew
    ? undefined
    : (
        await db
          .select()
          .from(kbArticles)
          .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, id)))
      )[0];
  if (!isNew && !article) notFound();

  const categories = await db
    .select({ id: kbCategories.id, name: kbCategories.name })
    .from(kbCategories)
    .where(and(eq(kbCategories.tenantId, tenant.id), isNull(kbCategories.parentId)))
    .orderBy(asc(kbCategories.name));

  const inputStyle = { borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" } as const;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/app/kb" className="font-mono text-xs" style={{ color: "var(--mute)" }}>
        ← Base de connaissances
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <h1 className="flex-1 text-lg font-semibold">
          {isNew ? "Nouvel article" : article!.title}
        </h1>
        {article && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={
              article.status === "published"
                ? { background: "var(--ok-t)", color: "var(--ok)" }
                : { background: "var(--closed-t)", color: "var(--closed)" }
            }
          >
            {article.status === "published" ? "Publié" : "Brouillon"}
          </span>
        )}
      </div>

      <form action={saveArticle} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="articleId" value={isNew ? "" : article!.id} />
        <div className="grid grid-cols-3 gap-3">
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            TITRE
            <input
              name="title"
              required
              defaultValue={article?.title ?? ""}
              className="rounded-md border px-3 py-2 text-sm font-normal"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            CATÉGORIE
            <select
              name="categoryId"
              defaultValue={article?.categoryId ?? cat ?? ""}
              className="rounded-md border px-2 py-2 text-sm font-normal"
              style={inputStyle}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
          CONTENU
          <textarea
            name="body"
            required
            rows={16}
            defaultValue={article?.bodyHtml ?? ""}
            className="rounded-md border px-3 py-2 text-sm font-normal leading-relaxed"
            style={inputStyle}
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            name="intent"
            value="draft"
            className="rounded-md border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--line)" }}
          >
            Enregistrer le brouillon
          </button>
          <button
            type="submit"
            name="intent"
            value="publish"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--acc)" }}
          >
            Publier
          </button>
          <span className="flex-1" />
          {article && (
            <button
              formAction={deleteArticle}
              className="rounded-md border px-3 py-2 text-sm font-medium"
              style={{ borderColor: "var(--dang)", color: "var(--dang)" }}
            >
              Supprimer
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
