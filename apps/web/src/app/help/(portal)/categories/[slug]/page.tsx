import Link from "next/link";
import { notFound } from "next/navigation";
import { getPortalTenant } from "@/lib/portal-auth";
import { getCategoryWithArticles } from "@/lib/portal-data";

/** PT-02 — Catégorie (specs/12). */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await getPortalTenant();
  const { slug } = await params;
  if (!tenant) notFound();
  const data = await getCategoryWithArticles(tenant.id, slug);
  if (!data) notFound();

  return (
    <div>
      <nav className="text-sm" style={{ color: "var(--mute)" }}>
        <Link href="/help">Centre d'aide</Link> › {data.category.name}
      </nav>
      <h1 className="mt-2 text-xl font-semibold">{data.category.name}</h1>
      {data.category.description && (
        <p className="mt-1" style={{ color: "var(--mute)" }}>
          {data.category.description}
        </p>
      )}
      <ul className="mt-5 flex flex-col gap-3">
        {data.articles.map((a) => (
          <li
            key={a.slug}
            className="rounded-lg border p-4"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <Link href={`/help/articles/${a.slug}`} className="font-medium underline-offset-2 hover:underline">
              {a.title}
            </Link>
            {a.bodyHtml && (
              <p className="mt-1 text-sm" style={{ color: "var(--mute)" }}>
                {a.bodyHtml.replace(/<[^>]+>/g, "").slice(0, 140)}…
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
