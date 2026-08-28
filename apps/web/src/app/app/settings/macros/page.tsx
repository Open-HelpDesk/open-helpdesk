import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { db, macros, teams } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { macroActionsSummary } from "@/lib/rule-labels";
import { getT } from "@/i18n/server";
import {
  EmptyState,
  PageHeader,
  PageShell,
  StatusPill,
  TextInput,
} from "@/components/settings-page";

type MacroRow = typeof macros.$inferSelect;

/**
 * Category order from the design; the others follow, alphabetically.
 *
 * These three values are NOT labels to translate: they are the category names
 * the tenant typed, compared as-is. Translating them would break the match and
 * send everyone back to the alphabetical sort.
 */
const CATEGORY_ORDER = ["Common replies", "Escalation", "Billing"];

/**
 * ST-06 — Macros: search bar + "+ New macro", groups by category (11px/700
 * uppercase title) in one card per group, generated action summary, scope pill,
 * 30-day usage. A macro's name opens ST-06b, its own page.
 */
export default async function MacrosPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; q?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { saved, q } = await searchParams;
  const query = (q ?? "").trim();

  const [rows, teamRows] = await Promise.all([
    db
      .select()
      .from(macros)
      .where(eq(macros.tenantId, tenant.id))
      .orderBy(asc(macros.category), asc(macros.name)),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.tenantId, tenant.id))
      .orderBy(asc(teams.name)),
  ]);

  const teamNameById = new Map(teamRows.map((team) => [team.id, team.name]));
  const needle = query.toLocaleLowerCase("fr-FR");
  const visible = needle
    ? rows.filter((m) => m.name.toLocaleLowerCase("fr-FR").includes(needle))
    : rows;

  const byCategory = new Map<string, MacroRow[]>();
  for (const m of visible) {
    const key = m.category ?? t("app.settings.rules.macroUncategorized");
    byCategory.set(key, [...(byCategory.get(key) ?? []), m]);
  }
  const groups = [...byCategory.entries()].sort(([a], [b]) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    // The sort follows the workspace language: French collation orders neither
    // Cyrillic nor Czech diacritics correctly.
    return a.localeCompare(b, t.locale.tag);
  });

  return (
    <PageShell>
      <PageHeader
        title={t("app.settings.rules.macrosTitle")}
        subtitle={t("app.settings.rules.macrosSubtitle")}
      />

      {saved === "1" && (
        <p style={{ fontSize: 12.5, color: "var(--ok)" }}>{t("app.settings.rules.saved")}</p>
      )}

      <div className="st-rise flex flex-col" style={{ gap: 20 }}>
        {/* Search + creation */}
        <div className="flex flex-wrap items-center" style={{ gap: 9 }}>
          <form action="/app/settings/macros" className="min-w-0 flex-1" style={{ maxWidth: 300 }}>
            <TextInput
              name="q"
              defaultValue={query}
              placeholder={t("app.settings.rules.macroSearchPlaceholder")}
              aria-label={t("app.settings.rules.macroSearchLabel")}
              className="w-full"
              style={{ height: 34, padding: "0 11px", fontSize: 13 }}
            />
          </form>
          <span className="flex-1" />
          <Link
            href="/app/settings/macros/new"
            className="inline-flex items-center justify-center font-semibold"
            style={{
              height: 38,
              padding: "0 16px",
              borderRadius: 9,
              fontSize: 13.5,
              background: "var(--brand)",
              color: "var(--on-brand)",
              whiteSpace: "nowrap",
            }}
          >
            {t("app.settings.rules.macroNew")}
          </Link>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={t("app.settings.rules.macroEmptyTitle")}
            text={t("app.settings.rules.macroEmptyText")}
          />
        ) : groups.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {t("app.settings.rules.macroNoMatch", { query })}
          </p>
        ) : (
          groups.map(([category, list]) => (
            <div key={category} className="flex flex-col" style={{ gap: 9 }}>
              <p
                className="font-bold uppercase"
                style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--ink-3)" }}
              >
                {category}
              </p>
              <div
                className="overflow-hidden rounded-[14px] border"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                {list.map((m) => {
                  const actions = (m.actions as { type: string; value?: unknown }[]) ?? [];
                  const scope =
                    m.availability === "team" && m.teamId
                      ? (teamNameById.get(m.teamId) ?? t("app.settings.rules.macroScopeTeam"))
                      : m.availability === "personal"
                        ? t("app.settings.rules.macroScopePersonal")
                        : t("app.settings.rules.macroScopeEveryone");
                  return (
                    <div
                      key={m.id}
                      className="ohd-hover flex items-center border-b"
                      style={{ padding: "12px 15px", gap: 13, borderColor: "var(--line-2)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/app/settings/macros/${m.id}`}
                          className="block truncate text-left font-semibold"
                          style={{ fontSize: 13.5, color: "var(--ink)" }}
                        >
                          {m.name}
                        </Link>
                        <p className="truncate" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                          {macroActionsSummary(t, actions, teamNameById)}
                        </p>
                      </div>
                      <StatusPill tone={m.availability === "team" ? "open" : "closed"}>
                        {scope}
                      </StatusPill>
                      <span
                        className="whitespace-nowrap text-right tabular-nums"
                        style={{ fontSize: 12, color: "var(--ink-3)", width: 110 }}
                        title={t("app.settings.rules.macroUsageTitle")}
                      >
                        {t("app.settings.rules.macroUsageEmpty")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </PageShell>
  );
}
