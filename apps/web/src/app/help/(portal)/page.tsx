import Link from "next/link";
import { getPortalTenant } from "@/lib/portal-auth";
import { listPublishedCategories, popularArticles } from "@/lib/portal-data";

/** PT-01 — Accueil du centre d'aide (specs/12). */
export default async function HelpHome() {
  const tenant = await getPortalTenant();
  if (!tenant) return null;
  const [categories, popular] = await Promise.all([
    listPublishedCategories(tenant.id),
    popularArticles(tenant.id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ textWrap: "balance" }}>
        Comment pouvons-nous vous aider ?
      </h1>
      <form action="/help/search" className="mt-4">
        <input
          name="q"
          placeholder="Rechercher dans l'aide…"
          className="w-full rounded-lg border px-4 py-3 text-base outline-none"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        />
      </form>

      {categories.length > 0 && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/help/categories/${c.slug}`}
              className="rounded-lg border p-4"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <p className="font-semibold">
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--mute)" }}>
                {c.description ?? `${c.articleCount} article${c.articleCount > 1 ? "s" : ""}`}
              </p>
            </Link>
          ))}
        </div>
      )}

      {popular.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--mute)" }}>
            Articles les plus consultés
          </h2>
          <ul className="flex flex-col gap-1">
            {popular.map((a) => (
              <li key={a.slug}>
                <Link href={`/help/articles/${a.slug}`} className="text-[15px] underline-offset-2 hover:underline">
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div
        className="mt-10 flex items-center justify-between rounded-lg border p-5"
        style={{ background: "var(--acc-t)", borderColor: "var(--line)" }}
      >
        <div>
          <p className="font-semibold">Vous ne trouvez pas ?</p>
          <p className="text-sm" style={{ color: "var(--mute)" }}>
            Notre équipe vous répond rapidement.
          </p>
        </div>
        <Link
          href="/help/requests/new"
          className="rounded-md px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Soumettre une demande
        </Link>
      </div>
    </div>
  );
}
