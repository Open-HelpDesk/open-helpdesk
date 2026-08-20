import Link from "next/link";
import { isManager, requireAgent } from "@/lib/session";
import { db, kbArticles, kbCategories, users } from "@openhelpdesk/db";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { getT } from "@/i18n/server";
import { createCategory, deleteCategory, renameCategory } from "./actions";

/**
 * AG-10 — Base de connaissances (design espace-agent) : arbre 250 px avec catégories
 * parent/enfants (carets, compteurs réels), liste « {catégorie} / N articles » et table
 * grid `minmax(240px,1fr) 110px 140px 80px 80px 110px`.
 *
 * Lecture ouverte à toute l'équipe — un agent cite les articles dans ses réponses.
 * Écriture (créer, renommer, supprimer) réservée à Owner et Admin : les commandes
 * n'apparaissent pas pour les autres, et les server actions refont le contrôle.
 */

const GRID = "minmax(240px,1fr) 110px 140px 80px 80px 110px";

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; erreur?: string; n?: string }>;
}) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const { cat, erreur, n } = await searchParams;
  const canManage = isManager(agent.role);

  const [allCategories, countRows] = await Promise.all([
    db
      .select()
      .from(kbCategories)
      .where(eq(kbCategories.tenantId, tenant.id))
      .orderBy(asc(kbCategories.position), asc(kbCategories.name)),
    db
      .select({ categoryId: kbArticles.categoryId, n: count() })
      .from(kbArticles)
      // Même filtre que la liste : un compteur qui annonce trois articles quand
      // deux s'affichent révèle par la soustraction ce qu'on vient de cacher.
      .where(
        and(
          eq(kbArticles.tenantId, tenant.id),
          ...(canManage ? [] : [eq(kbArticles.status, "published")]),
        ),
      )
      .groupBy(kbArticles.categoryId),
  ]);

  const countByCat = new Map<string | null, number>(
    countRows.map((r) => [r.categoryId, r.n]),
  );
  const parents = allCategories.filter((c) => !c.parentId);
  const childrenOf = (parentId: string) =>
    allCategories.filter((c) => c.parentId === parentId);
  const totalCount = (catId: string) =>
    (countByCat.get(catId) ?? 0) +
    childrenOf(catId).reduce((acc, c) => acc + (countByCat.get(c.id) ?? 0), 0);

  const selected = allCategories.find((c) => c.id === cat) ?? parents[0];
  const selectedIsParent = selected ? !selected.parentId : false;
  const expandedParentId = selected ? (selected.parentId ?? selected.id) : null;

  // Articles de la sélection (une catégorie parent inclut ses sections).
  const catIds = selected
    ? selectedIsParent
      ? [selected.id, ...childrenOf(selected.id).map((c) => c.id)]
      : [selected.id]
    : [];
  const articles =
    catIds.length > 0
      ? await db
          .select({
            id: kbArticles.id,
            slug: kbArticles.slug,
            title: kbArticles.title,
            status: kbArticles.status,
            draftBodyHtml: kbArticles.draftBodyHtml,
            viewCount: kbArticles.viewCount,
            votesUp: kbArticles.votesUp,
            updatedAt: kbArticles.updatedAt,
            authorName: users.name,
          })
          .from(kbArticles)
          .leftJoin(users, eq(kbArticles.authorId, users.id))
          // La recherche partagée (lib/directory) cache déjà les brouillons aux
          // non-gestionnaires, au motif qu'un titre non publié est déjà une
          // information à protéger. Cette liste les montrait encore, badge
          // « Brouillon » compris : les deux écrans disaient le contraire.
          .where(
            and(
              eq(kbArticles.tenantId, tenant.id),
              inArray(kbArticles.categoryId, catIds),
              ...(canManage ? [] : [eq(kbArticles.status, "published")]),
            ),
          )
          .orderBy(desc(kbArticles.updatedAt))
      : [];

  const selectedCount = selected
    ? selectedIsParent
      ? totalCount(selected.id)
      : (countByCat.get(selected.id) ?? 0)
    : 0;

  const itemStyle = (active: boolean) =>
    ({
      padding: "6px 9px",
      borderRadius: 6,
      fontSize: 13,
      background: active ? "var(--acc-t)" : "transparent",
      color: active ? "var(--acc)" : "var(--ink)",
      fontWeight: active ? 600 : 400,
    }) as const;

  // État vide global.
  if (parents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-[15px] font-semibold">{t("app.kb.emptyTitle")}</p>
          <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            {t("app.kb.emptyBody")}
          </p>
          {!canManage && (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              {t("app.kb.managersOnly")}
            </p>
          )}
          {canManage && (
          <div className="mt-2 flex items-center gap-2">
            <form action={createCategory} className="flex items-center gap-2">
              <input
                name="name"
                required
                placeholder={t("app.kb.categoryNamePlaceholder")}
                className="border px-3 text-[13px] outline-none"
                style={{
                  height: 32,
                  borderRadius: 6,
                  borderColor: "var(--line)",
                  background: "var(--bg)",
                }}
              />
              <button
                type="submit"
                className="rounded-md px-3 text-[13px] font-semibold text-white"
                style={{ height: 32, background: "var(--acc)" }}
              >
                {t("app.kb.createCategory")}
              </button>
            </form>
            <button
              type="button"
              className="rounded-md border px-3 text-[13px] font-medium"
              style={{ height: 32, borderColor: "var(--line)", color: "var(--ink-2)" }}
            >
              {t("app.kb.import")}
            </button>
          </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Arbre — 250 px */}
      <nav
        className="flex w-[250px] shrink-0 flex-col overflow-y-auto border-r p-3"
        style={{ background: "var(--sunk)", borderColor: "var(--line)" }}
      >
        <p
          className="mb-2 px-2 font-semibold uppercase tracking-wider"
          style={{ fontSize: 11, color: "var(--ink-3)" }}
        >
          {t("app.kb.categories")}
        </p>
        <ul className="flex flex-col gap-0.5">
          {parents.map((c) => {
            const kids = childrenOf(c.id);
            const expanded = expandedParentId === c.id && kids.length > 0;
            const active = selected?.id === c.id;
            return (
              <li key={c.id}>
                <Link
                  href={`/app/kb?cat=${c.id}`}
                  className="flex items-center gap-1.5"
                  style={itemStyle(active)}
                >
                  <span
                    className="w-3 shrink-0 text-center"
                    style={{ fontSize: 9, color: "var(--ink-3)" }}
                  >
                    {kids.length > 0 ? (expanded ? "▾" : "▸") : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: active ? "var(--acc)" : "var(--ink-3)",
                    }}
                  >
                    {totalCount(c.id)}
                  </span>
                </Link>
                {expanded && (
                  <ul className="flex flex-col gap-0.5">
                    {kids.map((k) => {
                      const kidActive = selected?.id === k.id;
                      return (
                        <li key={k.id}>
                          <Link
                            href={`/app/kb?cat=${k.id}`}
                            className="flex items-center gap-1.5"
                            style={{ ...itemStyle(kidActive), paddingLeft: 26 }}
                          >
                            <span className="min-w-0 flex-1 truncate">{k.name}</span>
                            <span
                              className="tabular-nums"
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: kidActive ? "var(--acc)" : "var(--ink-3)",
                              }}
                            >
                              {countByCat.get(k.id) ?? 0}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {canManage && (
        <form action={createCategory} className="mt-3 flex flex-col gap-1.5">
          <input
            name="name"
            required
            placeholder={t("app.kb.newCategoryPlaceholder")}
            className="border px-2 py-1.5 text-[12.5px] outline-none"
            style={{ borderRadius: 6, borderColor: "var(--line)", background: "var(--bg)" }}
          />
          <button
            type="submit"
            className="rounded-md border border-dashed px-2 py-1.5 text-left text-[13px]"
            style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
          >
            {t("app.kb.addCategory")}
          </button>
        </form>
        )}
      </nav>

      {/* Liste des articles */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex shrink-0 items-center gap-2 border-b px-4"
          style={{ height: 48, background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <h2 className="text-[14px] font-semibold">{selected?.name}</h2>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {t("app.kb.articleCount", { count: selectedCount })}
          </span>
          <span className="flex-1" />
          {canManage && selected && (
            <>
              {/* Renommer : le champ s'ouvre au clic, sans quitter la page. */}
              <details className="relative">
                <summary
                  className="inline-flex cursor-pointer items-center rounded-md border px-3 font-medium"
                  style={{ height: 30, borderColor: "var(--line)", color: "var(--ink-2)", fontSize: 13 }}
                >
                  {t("app.kb.renameCategory")}
                </summary>
                <form
                  action={renameCategory}
                  className="absolute right-0 z-20 mt-1 flex items-center gap-1.5 rounded-md border p-2 shadow-[0_8px_24px_rgba(0,0,0,.12)]"
                  style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                >
                  <input type="hidden" name="categoryId" value={selected.id} />
                  <input
                    name="name"
                    required
                    defaultValue={selected.name}
                    className="border px-2 text-[13px] outline-none"
                    style={{ height: 30, width: 200, borderRadius: 6, borderColor: "var(--line)", background: "var(--bg)" }}
                  />
                  <button
                    type="submit"
                    className="rounded-md px-3 text-[13px] font-semibold text-white"
                    style={{ height: 30, background: "var(--acc)" }}
                  >
                    {t("app.kb.renameSave")}
                  </button>
                </form>
              </details>
              <form action={deleteCategory}>
                <input type="hidden" name="categoryId" value={selected.id} />
                <button
                  type="submit"
                  className="inline-flex items-center rounded-md border px-3 font-medium"
                  style={{ height: 30, borderColor: "var(--dang)", color: "var(--dang)", fontSize: 13 }}
                >
                  {t("app.kb.deleteCategory")}
                </button>
              </form>
              <Link
                href={`/app/kb/new?cat=${selected.id}`}
                className="inline-flex items-center rounded-md px-3 font-semibold text-white"
                style={{ height: 30, background: "var(--acc)", fontSize: 13 }}
              >
                {t("app.kb.newArticle")}
              </Link>
            </>
          )}
        </div>

        {/* Une catégorie non vide ne se supprime pas : on dit ce qui bloque. */}
        {erreur === "categorie-non-vide" && (
          <p
            className="shrink-0 border-b px-4 py-2 text-[13px]"
            style={{ background: "var(--dang-t)", borderColor: "var(--line)", color: "var(--dang)" }}
          >
            {t("app.kb.categoryNotEmpty", { count: Number(n) || 1 })}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto" style={{ background: "var(--bg)" }}>
          {articles.length === 0 ? (
            <p className="py-20 text-center text-sm" style={{ color: "var(--ink-3)" }}>
              {t("app.kb.noArticles")}
            </p>
          ) : (
            <div style={{ minWidth: 760 }}>
              <div
                className="sticky top-0 z-10 grid items-center border-b font-semibold uppercase tracking-wide"
                style={{
                  gridTemplateColumns: GRID,
                  height: 32,
                  fontSize: 11,
                  background: "var(--sunk)",
                  borderColor: "var(--line)",
                  color: "var(--ink-3)",
                }}
              >
                <span className="pl-4">{t("app.kb.colTitle")}</span>
                <span>{t("app.kb.colStatus")}</span>
                <span>{t("app.kb.colAuthor")}</span>
                <span className="text-right">{t("app.kb.colViews")}</span>
                <span className="text-right">{t("app.kb.colHelpful")}</span>
                <span className="pr-4 text-right">{t("app.kb.colUpdated")}</span>
              </div>
              {/* Où mène une ligne dépend du rôle : l'éditeur pour qui peut
                  écrire, l'article publié sur le portail pour les autres. Un
                  brouillon n'est lisible nulle part ailleurs : sa ligne ne
                  cliquera pas, plutôt que de renvoyer sur une redirection. */}
              {articles.map((a) => (
                <Link
                  key={a.id}
                  href={
                    canManage
                      ? `/app/kb/${a.id}`
                      : a.status === "published"
                        ? `/help/articles/${a.slug}`
                        : `/app/kb?cat=${selected?.id ?? ""}`
                  }
                  target={!canManage && a.status === "published" ? "_blank" : undefined}
                  className="grid items-center border-b"
                  style={{
                    gridTemplateColumns: GRID,
                    minHeight: 42,
                    borderColor: "var(--line-2)",
                  }}
                >
                  <span className="min-w-0 truncate pl-4 text-[13px] font-medium">
                    {a.title}
                    {a.status === "published" && a.draftBodyHtml && (
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 font-bold"
                        style={{
                          fontSize: 9,
                          background: "var(--wait-t)",
                          color: "var(--wait)",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {t("app.kb.draftBadge")}
                      </span>
                    )}
                  </span>
                  <span>
                    <span
                      className="rounded-full px-2 py-0.5 font-medium"
                      style={
                        a.status === "published"
                          ? { fontSize: 11.5, background: "var(--ok-t)", color: "var(--ok)" }
                          : {
                              fontSize: 11.5,
                              background: "var(--closed-t)",
                              color: "var(--closed)",
                            }
                      }
                    >
                      {a.status === "published" ? t("app.kb.published") : t("app.kb.draft")}
                    </span>
                  </span>
                  <span className="truncate pr-2" style={{ fontSize: 12.5 }}>
                    {a.authorName ?? "—"}
                  </span>
                  <span
                    className="text-right tabular-nums"
                    style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                  >
                    {t.fmt.number(a.viewCount)}
                  </span>
                  <span
                    className="text-right font-semibold tabular-nums"
                    style={{
                      fontSize: 12.5,
                      color: a.votesUp > 0 ? "var(--ok)" : "var(--ink-3)",
                    }}
                  >
                    {a.votesUp > 0 ? `+${t.fmt.number(a.votesUp)}` : "—"}
                  </span>
                  <span
                    className="pr-4 text-right tabular-nums"
                    style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                  >
                    {t.fmt.relative(a.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
