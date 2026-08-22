import Link from "next/link";
import { getPortalContact, getPortalTenant } from "@/lib/portal-auth";
import { canReadKb } from "@/lib/portal-config";
import { listPublishedCategories, popularArticles } from "@/lib/portal-data";
import { getT } from "@/i18n/server";
import { PortalSearchBar } from "./search-bar";

/** PT-01 — Home: gradient hero, typeahead search, categories, top articles, CTA card. */
export default async function HelpHome() {
  const t = await getT();
  const tenant = await getPortalTenant();
  if (!tenant) return null;
  // Knowledge base turned off or restricted: the home page keeps its hero and its
  // contact card, but stops advertising categories the pages would refuse to open.
  const showKb = await canReadKb(Boolean(await getPortalContact()));
  const [categories, popular] = showKb
    ? await Promise.all([listPublishedCategories(tenant.id), popularArticles(tenant.id, 5)])
    : [[], []];
  // The welcome text set in ST-09 takes precedence over the translation: it is the
  // tenant's voice, written in their own language.
  const welcome =
    (tenant.portalConfig as { welcomeText?: string } | null)?.welcomeText || t("home.title");

  return (
    <div className="pt-rise-hero">
      {/* Hero — the tinted background dissolves into --bg, with no hard separator line. */}
      <div
        className="border-b px-9 py-[68px] max-sm:px-[18px] max-sm:py-[38px]"
        style={{
          background: "linear-gradient(180deg, var(--acc-t) 0%, var(--bg) 92%)",
          borderColor: "var(--line-2)",
        }}
      >
        <div className="mx-auto flex max-w-[640px] flex-col items-center gap-6">
          <p
            className="text-[11.5px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--acc)" }}
          >
            {t("home.eyebrow")}
          </p>
          <div className="flex flex-col gap-[13px] text-center">
            <h1
              className="pt-title text-[46px] leading-[1.08] tracking-[-0.02em] max-sm:text-[30px]"
              style={{ textWrap: "balance" }}
            >
              {welcome}
            </h1>
            <p
              className="mx-auto max-w-[50ch] text-[16.5px]"
              style={{ color: "var(--ink-2)", textWrap: "pretty" }}
            >
              {t("home.subtitle")}
            </p>
          </div>
          {showKb && <PortalSearchBar />}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-[46px] px-9 pb-14 pt-12 max-sm:px-[18px] max-sm:py-[30px]">
        {showKb && (
        <section className="flex flex-col gap-4">
          <h2
            className="pt-eyebrow"
          >
            {t("home.categories")}
          </h2>
          <div className="grid grid-cols-3 gap-3.5 max-md:grid-cols-2 max-sm:grid-cols-1">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/help/categories/${c.slug}`}
                className="pt-card-cat flex flex-col gap-[9px] rounded-2xl p-[22px] hover:no-underline"
                style={{ color: "var(--ink)" }}
              >
                <span
                  className="mb-[3px] grid h-[38px] w-[38px] place-items-center rounded-[11px] text-[18px]"
                  style={{ background: "var(--acc-t)", color: "var(--acc)" }}
                >
                  {c.icon ?? "◆"}
                </span>
                <span className="text-[16.5px] font-semibold tracking-[-0.012em]">{c.name}</span>
                {c.description && (
                  <span
                    className="text-sm leading-[1.5]"
                    style={{ color: "var(--ink-2)", textWrap: "pretty" }}
                  >
                    {c.description}
                  </span>
                )}
                <span
                  className="mt-[3px] flex items-center gap-[7px] text-[12.5px]"
                  style={{ color: "var(--ink-3)" }}
                >
                  <span
                    aria-hidden
                    className="h-1 w-1 rounded-full"
                    style={{ background: "var(--acc-b)" }}
                  />
                  {t("category.articleCount", { count: c.articleCount })}
                </span>
              </Link>
            ))}
          </div>
        </section>
        )}

        <div className="grid grid-cols-[1.5fr_1fr] gap-[26px] max-md:grid-cols-1">
          {showKb && (
          <section className="flex min-w-0 flex-col gap-4">
            <h2
              className="pt-eyebrow"
            >
              {t("home.popular")}
            </h2>
            <div
              className="overflow-hidden rounded-2xl border"
              style={{
                background: "var(--panel)",
                borderColor: "var(--line)",
                boxShadow: "var(--sh-1)",
              }}
            >
              {popular.map((a, i) => (
                <Link
                  key={a.slug}
                  href={`/help/articles/${a.slug}`}
                  className="pt-row flex items-center gap-[15px] border-b px-5 py-4 hover:no-underline"
                  style={{ borderColor: "var(--line-2)", color: "var(--ink)" }}
                >
                  <span
                    className="pt-title w-[18px] flex-none text-base"
                    style={{ color: "var(--acc-b)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-medium">{a.title}</span>
                  <span
                    className="whitespace-nowrap text-[12.5px] tabular-nums"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {t("home.views", { count: a.viewCount })}
                  </span>
                </Link>
              ))}
            </div>
          </section>
          )}

          <aside
            className="flex flex-col gap-3 self-start rounded-[18px] p-[26px] text-white"
            style={{
              background: "linear-gradient(155deg, var(--cta-a) 0%, var(--cta-b) 100%)",
              boxShadow: "var(--sh-3)",
            }}
          >
            <p
              className="pt-title text-[22px] leading-[1.2] tracking-[-0.01em]"
              style={{ textWrap: "balance" }}
            >
              {t("home.ctaTitle")}
            </p>
            <p className="text-[14.5px] leading-[1.6] opacity-[.78]" style={{ textWrap: "pretty" }}>
              {t("home.ctaBody")}
            </p>
            <Link
              href="/help/requests/new"
              className="mt-1.5 grid h-[46px] place-items-center rounded-[10px] bg-white text-[15px] font-semibold hover:no-underline"
              style={{ color: "var(--cta-a)" }}
            >
              {t("chrome.submitRequest")}
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
