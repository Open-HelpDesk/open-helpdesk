import type { CSSProperties } from "react";
import Link from "next/link";
import { isManager, requireAgent } from "@/lib/session";
import { db, kbArticles, kbCategories, users } from "@openhelpdesk/db";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getT } from "@/i18n/server";
import { card, primaryAction, secondaryAction } from "@/components/v2-page";
import { createCategory, deleteCategory, renameCategory } from "./actions";

/**
 * AG-10 — Knowledge base (V2): a 232 px category rail on the panel, then a
 * 920 px column — title, one sentence, filter pills, and the articles as rows of
 * a single card rather than a six-column table.
 *
 * The V1 table showed status, author, views, helpful and updated in five narrow
 * columns; the V2 row folds author and date into one meta line and keeps views
 * and helpful on the right, which is the same information in half the width.
 *
 * The three status pills partition the articles exactly, so the filters can too:
 * a draft, a published article, and a published article carrying an unpublished
 * draft — the last one is what "To review" means here, and it is a state the
 * product already tracks rather than a flag invented for the mockup.
 *
 * Reading is open to the whole team — an agent quotes articles in their replies.
 * Writing (create, rename, delete) is restricted to Owner and Admin: the
 * commands do not show up for the others, and the server actions re-run the check.
 */

type Filter = "published" | "drafts" | "review";

/** Category row of the rail — 8/10 padding, radius 9, brand tint when selected. */
function railItem(active: boolean, indented: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: indented ? "8px 10px 8px 32px" : "8px 10px",
    borderRadius: 9,
    fontSize: 13.5,
    "--row-bg": active ? "var(--brand-t)" : "transparent",
    color: active ? "var(--brand)" : "var(--ink-2)",
    fontWeight: active ? 600 : 450,
  } as CSSProperties;
}

/** Filter pill — radius 999, tinted and outlined when it is the current one. */
function pill(active: boolean): CSSProperties {
  return {
    padding: "6px 13px",
    borderRadius: 999,
    border: `1px solid ${active ? "var(--brand-b)" : "var(--line)"}`,
    background: active ? "var(--brand-t)" : "var(--panel)",
    color: active ? "var(--brand)" : "var(--ink-2)",
    fontSize: 12.5,
    fontWeight: active ? 600 : 450,
  };
}

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; f?: string; error?: string; n?: string }>;
}) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const { cat, f, error, n } = await searchParams;
  const canManage = isManager(agent.role);
  // A filter over drafts means nothing to someone who cannot see drafts: the
  // pills are hidden for them, so an ?f= typed by hand is ignored rather than
  // silently emptying the list.
  const filter: Filter | undefined =
    canManage && (f === "published" || f === "drafts" || f === "review") ? f : undefined;

  const [allCategories, countRows] = await Promise.all([
    db
      .select()
      .from(kbCategories)
      .where(eq(kbCategories.tenantId, tenant.id))
      .orderBy(asc(kbCategories.position), asc(kbCategories.name)),
    db
      .select({
        categoryId: kbArticles.categoryId,
        n: count(),
        views: sql<number>`coalesce(sum(${kbArticles.viewCount}), 0)::int`,
      })
      .from(kbArticles)
      // Same filter as the list: a counter announcing three articles when only
      // two are displayed reveals by subtraction what we have just hidden.
      .where(
        and(
          eq(kbArticles.tenantId, tenant.id),
          ...(canManage ? [] : [eq(kbArticles.status, "published")]),
        ),
      )
      .groupBy(kbArticles.categoryId),
  ]);

  const countByCat = new Map(countRows.map((r) => [r.categoryId, r]));
  const nOf = (id: string | null) => countByCat.get(id)?.n ?? 0;
  const viewsOf = (id: string | null) => countByCat.get(id)?.views ?? 0;
  const parents = allCategories.filter((c) => !c.parentId);
  const childrenOf = (parentId: string) =>
    allCategories.filter((c) => c.parentId === parentId);
  const sumOf = (catId: string, get: (id: string) => number) =>
    get(catId) + childrenOf(catId).reduce((acc, c) => acc + get(c.id), 0);

  const selected = allCategories.find((c) => c.id === cat) ?? parents[0];
  const selectedIsParent = selected ? !selected.parentId : false;
  const expandedParentId = selected ? (selected.parentId ?? selected.id) : null;

  // Articles of the selection (a parent category includes its sections).
  const catIds = selected
    ? selectedIsParent
      ? [selected.id, ...childrenOf(selected.id).map((c) => c.id)]
      : [selected.id]
    : [];

  const filterClause =
    filter === "published"
      ? [eq(kbArticles.status, "published"), isNull(kbArticles.draftBodyHtml)]
      : filter === "drafts"
        ? [eq(kbArticles.status, "draft")]
        : filter === "review"
          ? [eq(kbArticles.status, "published"), isNotNull(kbArticles.draftBodyHtml)]
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
          // The shared search (lib/directory) already hides drafts from
          // non-managers, on the grounds that an unpublished title is already
          // information to protect. This list still showed them, "Draft" badge
          // included: the two screens were saying the opposite.
          .where(
            and(
              eq(kbArticles.tenantId, tenant.id),
              inArray(kbArticles.categoryId, catIds),
              ...(canManage ? [] : [eq(kbArticles.status, "published")]),
              ...filterClause,
            ),
          )
          .orderBy(desc(kbArticles.updatedAt))
      : [];

  const selectedCount = selected
    ? selectedIsParent
      ? sumOf(selected.id, nOf)
      : nOf(selected.id)
    : 0;
  const selectedViews = selected
    ? selectedIsParent
      ? sumOf(selected.id, viewsOf)
      : viewsOf(selected.id)
    : 0;

  const filterHref = (next?: Filter) =>
    `/app/kb?cat=${selected?.id ?? ""}${next ? `&f=${next}` : ""}`;

  // Global empty state.
  if (parents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <p style={{ fontFamily: "var(--font-title)", fontSize: 19, fontWeight: 600 }}>
            {t("app.kb.emptyTitle")}
          </p>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{t("app.kb.emptyBody")}</p>
          {!canManage && (
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("app.kb.managersOnly")}</p>
          )}
          {canManage && (
            <form action={createCategory} className="mt-2 flex items-center gap-2">
              <input
                name="name"
                required
                placeholder={t("app.kb.categoryNamePlaceholder")}
                className="outline-none"
                style={{
                  height: 38,
                  padding: "0 12px",
                  borderRadius: 9,
                  border: "1px solid var(--line)",
                  background: "var(--panel)",
                  fontSize: 13,
                }}
              />
              <button type="submit" style={primaryAction}>
                {t("app.kb.createCategory")}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0">
      {/* Category rail — 232 px on the panel */}
      <nav
        className="flex flex-col overflow-auto"
        style={{
          width: 232,
          flex: "none",
          background: "var(--panel)",
          borderRight: "1px solid var(--line)",
          padding: "16px 10px",
          gap: 2,
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            padding: "0 10px 8px",
          }}
        >
          {t("app.kb.categories")}
        </p>
        {parents.map((c) => {
          const kids = childrenOf(c.id);
          const expanded = expandedParentId === c.id && kids.length > 0;
          const active = selected?.id === c.id;
          return (
            <div key={c.id} className="flex flex-col" style={{ gap: 2 }}>
              <Link href={`/app/kb?cat=${c.id}`} className="ohd-row" style={railItem(active, false)}>
                <span
                  className="shrink-0 text-center"
                  style={{ width: 8, fontSize: 9, color: "var(--ink-3)" }}
                >
                  {kids.length > 0 ? (expanded ? "▾" : "▸") : ""}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span
                  className="tabular-nums"
                  style={{ fontSize: 11.5, color: active ? "var(--brand)" : "var(--ink-3)" }}
                >
                  {sumOf(c.id, nOf)}
                </span>
              </Link>
              {expanded &&
                kids.map((k) => {
                  const kidActive = selected?.id === k.id;
                  return (
                    <Link
                      key={k.id}
                      href={`/app/kb?cat=${k.id}`}
                      className="ohd-row"
                      style={railItem(kidActive, true)}
                    >
                      <span className="min-w-0 flex-1 truncate">{k.name}</span>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: 11.5,
                          color: kidActive ? "var(--brand)" : "var(--ink-3)",
                        }}
                      >
                        {nOf(k.id)}
                      </span>
                    </Link>
                  );
                })}
            </div>
          );
        })}
        {canManage && (
          <form action={createCategory} className="mt-3 flex flex-col" style={{ gap: 6 }}>
            <input
              name="name"
              required
              placeholder={t("app.kb.newCategoryPlaceholder")}
              className="outline-none"
              style={{
                height: 34,
                padding: "0 10px",
                borderRadius: 9,
                border: "1px solid var(--line)",
                background: "var(--panel)",
                fontSize: 12.5,
              }}
            />
            <button
              type="submit"
              className="text-left"
              style={{
                height: 34,
                padding: "0 10px",
                border: "1px dashed var(--line)",
                borderRadius: 9,
                fontSize: 13,
                color: "var(--ink-3)",
              }}
            >
              {t("app.kb.addCategory")}
            </button>
          </form>
        )}
      </nav>

      {/* Articles — 920 px column */}
      <div className="min-w-0 flex-1 overflow-auto">
        <div
          className="flex flex-col"
          style={{ maxWidth: 920, margin: "0 auto", padding: "24px 26px 40px", gap: 16 }}
        >
          <div className="flex flex-wrap items-center" style={{ gap: 14 }}>
            <div className="flex flex-col" style={{ gap: 4, flex: 1, minWidth: 240 }}>
              <h1
                style={{
                  fontFamily: "var(--font-title)",
                  fontSize: 23,
                  fontWeight: 600,
                  letterSpacing: "-.015em",
                }}
              >
                {t("app.shell.knowledgeBase")}
              </h1>
              <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                {selected?.name} · {t("app.kb.articleCount", { count: selectedCount })}
                {selectedViews > 0 &&
                  ` — ${t("app.shell.paletteArticleViews", { count: selectedViews })}`}
              </p>
            </div>
            {canManage && selected && (
              <>
                {/* Rename: the field opens on click, without leaving the page. */}
                <details className="relative">
                  <summary
                    className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                    style={secondaryAction}
                  >
                    {t("app.kb.renameCategory")}
                  </summary>
                  <form
                    action={renameCategory}
                    className="absolute right-0 z-20 mt-1 flex items-center"
                    style={{
                      gap: 6,
                      padding: 8,
                      borderRadius: 12,
                      background: "var(--panel)",
                      border: "1px solid var(--line)",
                      boxShadow: "0 12px 32px rgba(0,0,0,.14)",
                    }}
                  >
                    <input type="hidden" name="categoryId" value={selected.id} />
                    <input
                      name="name"
                      required
                      defaultValue={selected.name}
                      className="outline-none"
                      style={{
                        height: 34,
                        width: 200,
                        padding: "0 10px",
                        borderRadius: 9,
                        border: "1px solid var(--line)",
                        background: "var(--panel)",
                        fontSize: 13,
                      }}
                    />
                    <button type="submit" style={{ ...primaryAction, height: 34 }}>
                      {t("app.kb.renameSave")}
                    </button>
                  </form>
                </details>
                <form action={deleteCategory}>
                  <input type="hidden" name="categoryId" value={selected.id} />
                  <button
                    type="submit"
                    style={{
                      ...secondaryAction,
                      borderColor: "var(--dang)",
                      color: "var(--dang)",
                    }}
                  >
                    {t("app.kb.deleteCategory")}
                  </button>
                </form>
                <Link href={`/app/kb/new?cat=${selected.id}`} style={primaryAction}>
                  {t("app.kb.newArticle")}
                </Link>
              </>
            )}
          </div>

          {/* A non-empty category cannot be deleted: we say what is blocking. */}
          {error === "category-not-empty" && (
            <p
              style={{
                padding: "10px 12px",
                borderRadius: 9,
                background: "var(--dang-t)",
                border: "1px solid var(--dang)",
                fontSize: 13,
                color: "var(--dang)",
              }}
            >
              {t("app.kb.categoryNotEmpty", { count: Number(n) || 1 })}
            </p>
          )}

          {canManage && (
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              <Link href={filterHref()} style={pill(filter === undefined)}>
                {t("app.tickets.filterAll")}
              </Link>
              <Link href={filterHref("published")} style={pill(filter === "published")}>
                {t("app.kb.published")}
              </Link>
              <Link href={filterHref("drafts")} style={pill(filter === "drafts")}>
                {t("app.kb.filterDrafts")}
              </Link>
              <Link href={filterHref("review")} style={pill(filter === "review")}>
                {t("app.kb.needsReview")}
              </Link>
            </div>
          )}

          {articles.length === 0 ? (
            <p
              className="text-center"
              style={{ padding: "72px 0", fontSize: 13, color: "var(--ink-3)" }}
            >
              {t("app.kb.noArticles")}
            </p>
          ) : (
            <div style={{ ...card, overflow: "hidden" }}>
              {/* Where a row leads depends on the role: the editor for whoever can
                  write, the article published on the portal for the others. A draft
                  is readable nowhere else: its row will not click through, rather
                  than sending the reader to a redirect. */}
              {articles.map((a, i) => {
                const pending = a.status === "published" && a.draftBodyHtml !== null;
                const [pillBg, pillInk, pillLabel] =
                  a.status === "draft"
                    ? ["var(--sunk)", "var(--ink-3)", t("app.kb.draft")]
                    : pending
                      ? ["var(--wait-t)", "var(--wait)", t("app.kb.needsReview")]
                      : ["var(--ok-t)", "var(--ok)", t("app.kb.published")];
                const meta = [
                  a.status === "draft"
                    ? t("app.kb.draft")
                    : t("app.kb.metaUpdated", { when: t.fmt.relative(a.updatedAt) }),
                  a.authorName,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
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
                    className="ohd-row flex items-center"
                    style={{
                      gap: 14,
                      padding: "14px 18px",
                      borderBottom:
                        i < articles.length - 1 ? "1px solid var(--line-2)" : undefined,
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="var(--brand)"
                      strokeWidth="1.8"
                      style={{ flex: "none" }}
                      aria-hidden="true"
                    >
                      <path d="M14 3v5h5" />
                      <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
                    </svg>
                    <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
                      <span className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>
                        {a.title}
                      </span>
                      <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{meta}</span>
                    </span>
                    {a.votesUp > 0 && (
                      <span
                        className="tabular-nums whitespace-nowrap"
                        title={t("app.kb.colHelpful")}
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--ok)" }}
                      >
                        +{t.fmt.number(a.votesUp)}
                      </span>
                    )}
                    <span
                      className="tabular-nums whitespace-nowrap"
                      style={{ fontSize: 12, color: "var(--ink-3)" }}
                    >
                      {t("app.shell.paletteArticleViews", { count: a.viewCount })}
                    </span>
                    <span
                      className="whitespace-nowrap"
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: pillBg,
                        color: pillInk,
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      {pillLabel}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
