import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { db, kbArticles, kbCategories, ticketMessages, tickets } from "@openhelpdesk/db";
import { and, asc, eq } from "drizzle-orm";
import { getT } from "@/i18n/server";
import { deleteArticle, saveArticle } from "../actions";
import { ArticleEditor } from "./editor";
import { ARTICLE_TEMPLATES, templateById } from "@/lib/article-templates";
import { articleFromTicket } from "@/lib/article-from-ticket";

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
  searchParams: Promise<{ cat?: string; modele?: string; depuis?: string }>;
}) {
  const { tenant } = await requireAgent();
  const t = await getT();
  const { id } = await params;
  const { cat, modele, depuis } = await searchParams;
  const isNew = id === "new";


  // Page blanche ou structure de départ : le choix précède l'éditeur (aucune
  // création en base tant que rien n'est enregistré).
  if (isNew && !modele && !depuis) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: "var(--canvas)" }}>
        <div className="mx-auto flex flex-col" style={{ maxWidth: 780, padding: "48px 28px" }}>
          <h1 className="font-semibold" style={{ fontSize: 20, letterSpacing: "-0.02em" }}>
            {t("app.kb.startTitle")}
          </h1>
          <p className="mt-1" style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
            {t("app.kb.startSubtitle")}
          </p>

          <div
            className="mt-6 grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}
          >
            {ARTICLE_TEMPLATES.map((gabarit) => (
              <Link
                key={gabarit.id}
                href={`/app/kb/new?modele=${gabarit.id}${cat ? `&cat=${cat}` : ""}`}
                className="flex flex-col rounded-[10px] border hover:border-[var(--acc)]"
                style={{ padding: "14px 15px", gap: 8, background: "var(--panel)", borderColor: "var(--line)" }}
              >
                <span
                  aria-hidden
                  className="grid place-items-center rounded-md font-mono font-bold"
                  style={{ width: 28, height: 28, fontSize: 12.5, background: "var(--acc-t)", color: "var(--acc)" }}
                >
                  {gabarit.glyph}
                </span>
                <span className="font-semibold" style={{ fontSize: 14, color: "var(--ink)" }}>
                  {gabarit.label}
                </span>
                <span style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-3)", textWrap: "pretty" }}>
                  {gabarit.hint}
                </span>
              </Link>
            ))}
          </div>

          <Link
            href={`/app/kb/new?modele=vierge${cat ? `&cat=${cat}` : ""}`}
            className="mt-4 self-start"
            style={{ fontSize: 13, color: "var(--acc-2)", fontWeight: 500 }}
          >
            {t("app.kb.startBlank")}
          </Link>
        </div>
      </div>
    );
  }

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
  // « Transformer en article » : le brouillon reprend la question du client et la
  // réponse de l'agent. Rien n'est écrit avant que l'agent n'enregistre.
  const sourceNumber = isNew && depuis ? Number(depuis) : null;
  let depuisTicket: { number: number; title: string; body: string; missing: string[] } | null =
    null;
  if (sourceNumber && Number.isFinite(sourceNumber)) {
    const [source] = await db
      .select({ id: tickets.id, number: tickets.number, subject: tickets.subject })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.number, sourceNumber)));
    if (source) {
      const fil = await db
        .select({
          authorType: ticketMessages.authorType,
          kind: ticketMessages.kind,
          bodyText: ticketMessages.bodyText,
        })
        .from(ticketMessages)
        .where(eq(ticketMessages.ticketId, source.id))
        .orderBy(asc(ticketMessages.createdAt));
      const brouillon = articleFromTicket(source.subject, fil);
      depuisTicket = { number: source.number, ...brouillon };
    }
  }

  const modeleChoisi = isNew ? templateById(modele) : undefined;
  const bodyValue = article
    ? (article.draftBodyHtml ?? article.bodyHtml ?? "")
    : (depuisTicket?.body ?? modeleChoisi?.body ?? "");
  const titleValue = article?.title ?? depuisTicket?.title ?? modeleChoisi?.title ?? "";

  // Phrase qui enveloppe le lien vers la demande source : une seule clé, coupée
  // autour du paramètre.
  const [reprisAvant, reprisApres] = t.parts("app.kb.fromTicket", "ticket");

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
          title={t("app.kb.backToList")}
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
            {article.status === "published" ? t("app.kb.published") : t("app.kb.draft")}
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
            {t("app.kb.unpublishedChanges")}
          </span>
        )}
        {article && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {t("app.kb.savedAt", { time: t.fmt.relative(article.updatedAt) })}
          </span>
        )}
        <span className="flex-1" />
        {article && (
          <button
            formAction={deleteArticle}
            className="rounded-md border px-2.5 text-[12px] font-medium"
            style={{ height: 28, borderColor: "var(--dang)", color: "var(--dang)" }}
          >
            {t("app.kb.delete")}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {depuisTicket && (
            <div
              className="flex shrink-0 flex-wrap items-center gap-2 border-b px-8 py-2.5"
              style={{ background: "var(--open-t)", borderColor: "var(--line-2)" }}
            >
              <span style={{ fontSize: 12.5, color: "var(--open)" }}>
                {reprisAvant}
                <Link href={`/app/tickets/${depuisTicket.number}`} style={{ fontWeight: 600 }}>
                  #{depuisTicket.number}
                </Link>
                {reprisApres}
              </span>
              {depuisTicket.missing.length > 0 && (
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  {t("app.kb.missingFields", {
                    items: new Intl.ListFormat(t.locale.tag).format(depuisTicket.missing),
                  })}
                </span>
              )}
            </div>
          )}
          <ArticleEditor defaultTitle={titleValue} defaultBody={bodyValue} />
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
              {t("app.kb.draft")}
            </button>
            <button
              type="submit"
              name="intent"
              value="publish"
              className="flex-1 rounded-md font-semibold text-white"
              style={{ height: 32, background: "var(--acc)", fontSize: 13 }}
            >
              {t("app.kb.publish")}
            </button>
          </div>

          <label className="flex flex-col gap-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {t("app.kb.slug")}
            <input
              name="slug"
              defaultValue={article ? `/${article.slug}` : ""}
              placeholder={t("app.kb.slugPlaceholder")}
              style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          </label>

          <label className="flex flex-col gap-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {t("app.kb.seoTitle")}
            <input
              name="seoTitle"
              defaultValue={seo.title ?? ""}
              placeholder={t("app.kb.seoTitlePlaceholder")}
              style={inputStyle}
            />
          </label>

          <label className="flex flex-col gap-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {t("app.kb.category")}
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
              {t("app.kb.history")}
            </p>
            {article ? (
              <ul className="flex flex-col gap-1.5">
                <li
                  className="flex items-baseline justify-between"
                  style={{ fontSize: 12 }}
                >
                  <span className="font-medium">{t("app.kb.currentVersion")}</span>
                  <span style={{ color: "var(--ink-3)" }}>{t.fmt.relative(article.updatedAt)}</span>
                </li>
                {article.publishedAt && (
                  <li
                    className="flex items-baseline justify-between"
                    style={{ fontSize: 12, color: "var(--ink-2)" }}
                  >
                    <span>{t("app.kb.firstPublished")}</span>
                    <span style={{ color: "var(--ink-3)" }}>
                      {t.fmt.relative(article.publishedAt)}
                    </span>
                  </li>
                )}
                <li
                  className="flex items-baseline justify-between"
                  style={{ fontSize: 12, color: "var(--ink-2)" }}
                >
                  <span>{t("app.kb.createdAt")}</span>
                  <span style={{ color: "var(--ink-3)" }}>{t.fmt.relative(article.createdAt)}</span>
                </li>
              </ul>
            ) : (
              <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {t("app.kb.historyEmpty")}
              </p>
            )}
          </section>
        </aside>
      </div>
    </form>
  );
}
