import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { db, kbArticles, kbCategories, users } from "@openhelpdesk/db";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { nFr, relativeFr } from "@/lib/format";
import { createCategory } from "./actions";

/**
 * AG-10 — Base de connaissances (design espace-agent) : arbre 250 px avec catégories
 * parent/enfants (carets, compteurs réels), liste « {catégorie} / N articles » et table
 * grid `minmax(240px,1fr) 110px 140px 80px 80px 110px`.
 */

const GRID = "minmax(240px,1fr) 110px 140px 80px 80px 110px";

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { cat } = await searchParams;

  const [allCategories, countRows] = await Promise.all([
    db
      .select()
      .from(kbCategories)
      .where(eq(kbCategories.tenantId, tenant.id))
      .orderBy(asc(kbCategories.position), asc(kbCategories.name)),
    db
      .select({ categoryId: kbArticles.categoryId, n: count() })
      .from(kbArticles)
      .where(eq(kbArticles.tenantId, tenant.id))
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
          .where(
            and(eq(kbArticles.tenantId, tenant.id), inArray(kbArticles.categoryId, catIds)),
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
          <p className="text-[15px] font-semibold">Votre base de connaissances est vide</p>
          <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            Créez une première catégorie, ou importez vos articles existants depuis un
            export Zendesk ou Notion.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <form action={createCategory} className="flex items-center gap-2">
              <input
                name="name"
                required
                placeholder="Nom de la catégorie…"
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
                Créer une catégorie
              </button>
            </form>
            <button
              type="button"
              className="rounded-md border px-3 text-[13px] font-medium"
              style={{ height: 32, borderColor: "var(--line)", color: "var(--ink-2)" }}
            >
              Importer
            </button>
          </div>
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
          Catégories
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
        <form action={createCategory} className="mt-3 flex flex-col gap-1.5">
          <input
            name="name"
            required
            placeholder="Nouvelle catégorie…"
            className="border px-2 py-1.5 text-[12.5px] outline-none"
            style={{ borderRadius: 6, borderColor: "var(--line)", background: "var(--bg)" }}
          />
          <button
            type="submit"
            className="rounded-md border border-dashed px-2 py-1.5 text-left text-[13px]"
            style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
          >
            + Catégorie
          </button>
        </form>
      </nav>

      {/* Liste des articles */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex shrink-0 items-center gap-2 border-b px-4"
          style={{ height: 48, background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <h2 className="text-[14px] font-semibold">{selected?.name}</h2>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            / {selectedCount} article{selectedCount > 1 ? "s" : ""}
          </span>
          <span className="flex-1" />
          {selected && (
            <Link
              href={`/app/kb/new?cat=${selected.id}`}
              className="inline-flex items-center rounded-md px-3 font-semibold text-white"
              style={{ height: 30, background: "var(--acc)", fontSize: 13 }}
            >
              + Article
            </Link>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto" style={{ background: "var(--bg)" }}>
          {articles.length === 0 ? (
            <p className="py-20 text-center text-sm" style={{ color: "var(--ink-3)" }}>
              Aucun article dans cette catégorie.
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
                <span className="pl-4">Titre</span>
                <span>Statut</span>
                <span>Auteur</span>
                <span className="text-right">Vues</span>
                <span className="text-right">Utile</span>
                <span className="pr-4 text-right">Mise à jour</span>
              </div>
              {articles.map((a) => (
                <Link
                  key={a.id}
                  href={`/app/kb/${a.id}`}
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
                        BROUILLON EN COURS
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
                      {a.status === "published" ? "Publié" : "Brouillon"}
                    </span>
                  </span>
                  <span className="truncate pr-2" style={{ fontSize: 12.5 }}>
                    {a.authorName ?? "—"}
                  </span>
                  <span
                    className="text-right tabular-nums"
                    style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                  >
                    {nFr(a.viewCount)}
                  </span>
                  <span
                    className="text-right font-semibold tabular-nums"
                    style={{
                      fontSize: 12.5,
                      color: a.votesUp > 0 ? "var(--ok)" : "var(--ink-3)",
                    }}
                  >
                    {a.votesUp > 0 ? `+${nFr(a.votesUp)}` : "—"}
                  </span>
                  <span
                    className="pr-4 text-right tabular-nums"
                    style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                  >
                    {relativeFr(a.updatedAt)}
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
