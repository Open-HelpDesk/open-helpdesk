import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { db, kbArticles, kbCategories } from "@openhelpdesk/db";
import { and, asc, eq } from "drizzle-orm";
import { relativeFr } from "@/lib/format";
import { deleteArticle, saveArticle } from "../actions";

/**
 * AG-10 — Éditeur d'article (design espace-agent) : badge « MODIFICATIONS NON
 * PUBLIÉES » si brouillon en cours, corps max 68ch, rail droit 280 px (Brouillon /
 * Publier, slug mono, titre SEO, catégorie, historique).
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
    .select({ id: kbCategories.id, name: kbCategories.name, parentId: kbCategories.parentId })
    .from(kbCategories)
    .where(eq(kbCategories.tenantId, tenant.id))
    .orderBy(asc(kbCategories.position), asc(kbCategories.name));
  const parents = categories.filter((c) => !c.parentId);

  const seo = (article?.seo ?? {}) as { title?: string };
  const hasDraft = Boolean(article?.status === "published" && article?.draftBodyHtml);
  const bodyValue = article ? (article.draftBodyHtml ?? article.bodyHtml ?? "") : "";

  const inputStyle = {
    height: 30,
    width: "100%",
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "var(--bg)",
    color: "var(--ink)",
    fontSize: 12.5,
    padding: "0 8px",
  } as const;

  const TOOLBAR = ["B", "I", "U", "S", "≔", "⛓", "❝", "‹›"];

  return (
    <form action={saveArticle} className="flex h-full flex-col overflow-hidden">
      <input type="hidden" name="articleId" value={isNew ? "" : article!.id} />

      {/* Barre d'état */}
      <div
        className="flex shrink-0 items-center gap-3 border-b px-4"
        style={{ height: 44, background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <Link
          href={`/app/kb${article?.categoryId ? `?cat=${article.categoryId}` : cat ? `?cat=${cat}` : ""}`}
          className="flex items-center justify-center rounded-md border"
          style={{
            width: 26,
            height: 26,
            borderColor: "var(--line)",
            color: "var(--ink-2)",
            fontSize: 13,
          }}
          title="Retour à la liste"
        >
          ←
        </Link>
        {article && (
          <span
            className="rounded-full px-2 py-0.5 font-medium"
            style={
              article.status === "published"
                ? { fontSize: 11.5, background: "var(--ok-t)", color: "var(--ok)" }
                : { fontSize: 11.5, background: "var(--closed-t)", color: "var(--closed)" }
            }
          >
            {article.status === "published" ? "Publié" : "Brouillon"}
          </span>
        )}
        {hasDraft && (
          <span
            className="rounded px-2 py-0.5 font-bold"
            style={{
              fontSize: 10,
              background: "var(--wait-t)",
              color: "var(--wait)",
              letterSpacing: "0.04em",
            }}
          >
            MODIFICATIONS NON PUBLIÉES
          </span>
        )}
        {article && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            enregistré {relativeFr(article.updatedAt)}
          </span>
        )}
        <span className="flex-1" />
        {article && (
          <button
            formAction={deleteArticle}
            className="rounded-md border px-2.5 text-[12px] font-medium"
            style={{ height: 28, borderColor: "var(--dang)", color: "var(--dang)" }}
          >
            Supprimer
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Corps de l'éditeur */}
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto" style={{ maxWidth: "68ch" }}>
            <input
              name="title"
              required
              defaultValue={article?.title ?? ""}
              placeholder="Titre de l'article"
              className="w-full border-0 outline-none"
              style={{
                fontSize: 26,
                fontWeight: 600,
                background: "transparent",
                color: "var(--ink)",
              }}
            />

            <div
              className="mb-3 mt-4 flex items-center gap-0.5 border-b pb-2"
              style={{ borderColor: "var(--line-2)" }}
            >
              {TOOLBAR.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="flex items-center justify-center"
                  title="Mise en forme"
                  style={{
                    width: 26,
                    height: 24,
                    borderRadius: 5,
                    color: "var(--ink-2)",
                    fontSize: 12.5,
                    fontWeight: label === "B" ? 700 : 500,
                    fontStyle: label === "I" ? "italic" : undefined,
                    textDecoration:
                      label === "U" ? "underline" : label === "S" ? "line-through" : undefined,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <textarea
              name="body"
              required
              rows={22}
              defaultValue={bodyValue}
              placeholder="Corps de l'article (markdown accepté)…"
              className="w-full resize-y border-0 outline-none"
              style={{
                fontSize: 14.5,
                lineHeight: 1.65,
                background: "transparent",
                color: "var(--ink)",
              }}
            />
          </div>
        </div>

        {/* Rail droit — 280 px */}
        <aside
          className="hidden w-[280px] shrink-0 flex-col gap-5 overflow-y-auto border-l p-4 lg:flex"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div className="flex gap-2">
            <button
              type="submit"
              name="intent"
              value="draft"
              className="flex-1 rounded-md border font-medium"
              style={{
                height: 32,
                borderColor: "var(--line)",
                background: "var(--bg)",
                fontSize: 13,
              }}
            >
              Brouillon
            </button>
            <button
              type="submit"
              name="intent"
              value="publish"
              className="flex-1 rounded-md font-semibold text-white"
              style={{ height: 32, background: "var(--acc)", fontSize: 13 }}
            >
              Publier
            </button>
          </div>

          <label className="flex flex-col gap-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Slug
            <input
              name="slug"
              defaultValue={article ? `/${article.slug}` : ""}
              placeholder="/mon-article"
              style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          </label>

          <label className="flex flex-col gap-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Titre SEO
            <input
              name="seoTitle"
              defaultValue={seo.title ?? ""}
              placeholder="Titre affiché dans les moteurs"
              style={inputStyle}
            />
          </label>

          <label className="flex flex-col gap-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Catégorie
            <select
              name="categoryId"
              defaultValue={article?.categoryId ?? cat ?? ""}
              style={{ ...inputStyle, padding: "0 6px" }}
            >
              {parents.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  <option value={p.id}>{p.name}</option>
                  {categories
                    .filter((c) => c.parentId === p.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        — {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>

          {/* Historique — visuel */}
          <section>
            <p
              className="mb-2 font-semibold uppercase tracking-wider"
              style={{ fontSize: 11, color: "var(--ink-3)" }}
            >
              Historique
            </p>
            {article ? (
              <ul className="flex flex-col gap-1.5">
                <li
                  className="flex items-baseline justify-between"
                  style={{ fontSize: 12 }}
                >
                  <span className="font-medium">Version actuelle</span>
                  <span style={{ color: "var(--ink-3)" }}>{relativeFr(article.updatedAt)}</span>
                </li>
                {article.publishedAt && (
                  <li
                    className="flex items-baseline justify-between"
                    style={{ fontSize: 12, color: "var(--ink-2)" }}
                  >
                    <span>Première publication</span>
                    <span style={{ color: "var(--ink-3)" }}>
                      {relativeFr(article.publishedAt)}
                    </span>
                  </li>
                )}
                <li
                  className="flex items-baseline justify-between"
                  style={{ fontSize: 12, color: "var(--ink-2)" }}
                >
                  <span>Création</span>
                  <span style={{ color: "var(--ink-3)" }}>{relativeFr(article.createdAt)}</span>
                </li>
              </ul>
            ) : (
              <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
                L'historique apparaîtra après le premier enregistrement.
              </p>
            )}
          </section>
        </aside>
      </div>
    </form>
  );
}
