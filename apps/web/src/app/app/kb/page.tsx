import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { db, kbArticles, kbCategories } from "@openhelpdesk/db";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { relativeFr } from "@/lib/format";
import { createCategory } from "./actions";

/**
 * AG-10 — Base de connaissances : gestion (specs/10). Panneau catégories à gauche,
 * articles de la sélection au centre. Reste à venir : sections (2ᵉ niveau), drag & drop,
 * historique des versions, éditeur riche.
 */
export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { cat } = await searchParams;

  const categories = await db
    .select()
    .from(kbCategories)
    .where(and(eq(kbCategories.tenantId, tenant.id), isNull(kbCategories.parentId)))
    .orderBy(asc(kbCategories.position), asc(kbCategories.name));

  const selected = categories.find((c) => c.id === cat) ?? categories[0];

  const articles = selected
    ? await db
        .select()
        .from(kbArticles)
        .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.categoryId, selected.id)))
        .orderBy(desc(kbArticles.updatedAt))
    : [];

  return (
    <div className="flex h-full">
      {/* Catégories */}
      <nav
        className="w-60 shrink-0 overflow-y-auto border-r p-3"
        style={{ background: "var(--sunk)", borderColor: "var(--line)" }}
      >
        <p className="mb-2 px-2 font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--mute)" }}>
          Catégories
        </p>
        <ul className="flex flex-col gap-0.5">
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/kb?cat=${c.id}`}
                className="block rounded-md px-2 py-1.5 text-sm"
                style={
                  selected?.id === c.id
                    ? { background: "var(--acc-t)", color: "var(--acc)", fontWeight: 600 }
                    : { color: "var(--ink)" }
                }
              >
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
        <form action={createCategory} className="mt-3 flex flex-col gap-1.5">
          <input
            name="name"
            required
            placeholder="Nouvelle catégorie…"
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg)" }}
          />
          <button
            type="submit"
            className="rounded-md border border-dashed px-2 py-1 text-xs"
            style={{ borderColor: "var(--line)", color: "var(--mute)" }}
          >
            + Créer
          </button>
        </form>
      </nav>

      {/* Articles */}
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div
          className="sticky top-0 flex h-12 items-center gap-3 border-b px-5"
          style={{ background: "var(--canvas)", borderColor: "var(--line)" }}
        >
          <h1 className="text-sm font-semibold">{selected?.name ?? "Base de connaissances"}</h1>
          <span className="flex-1" />
          {selected && (
            <Link
              href={`/app/kb/new?cat=${selected.id}`}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
              style={{ background: "var(--acc)" }}
            >
              Nouvel article
            </Link>
          )}
        </div>

        {categories.length === 0 ? (
          <p className="py-20 text-center text-sm" style={{ color: "var(--mute)" }}>
            Créez votre première catégorie pour démarrer la base de connaissances.
          </p>
        ) : articles.length === 0 ? (
          <p className="py-20 text-center text-sm" style={{ color: "var(--mute)" }}>
            Aucun article dans cette catégorie.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-b" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                  <td className="max-w-0 truncate py-2.5 pl-5">
                    <Link href={`/app/kb/${a.id}`} className="font-medium">
                      {a.title}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap pr-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={
                        a.status === "published"
                          ? { background: "var(--ok-t)", color: "var(--ok)" }
                          : { background: "var(--closed-t)", color: "var(--closed)" }
                      }
                    >
                      {a.status === "published" ? "Publié" : "Brouillon"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap pr-3 text-xs tabular-nums" style={{ color: "var(--mute)" }}>
                    {a.viewCount} vues · 👍 {a.votesUp} · 👎 {a.votesDown}
                  </td>
                  <td className="whitespace-nowrap pr-5 text-right text-xs tabular-nums" style={{ color: "var(--mute)" }}>
                    {relativeFr(a.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
