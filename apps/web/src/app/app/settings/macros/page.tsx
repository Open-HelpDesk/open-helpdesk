import { requireAgent } from "@/lib/session";
import { db, macros, teams } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { macroActionsSummary } from "@/lib/rule-labels";
import { STATUS_KEYS } from "@/lib/format";
import { getT, type Translate } from "@/i18n/server";
import {
  EmptyState,
  Field,
  PageHeader,
  PageShell,
  Select,
  StatusPill,
  TextInput,
} from "@/components/settings-page";
import { Drawer } from "@/components/settings-overlays";
import { deleteMacro, saveMacro } from "./actions";

type MacroRow = typeof macros.$inferSelect;

/** Ordre des catégories du design ; les autres suivent, alphabétiquement. */
const CATEGORY_ORDER = ["Réponses courantes", "Escalade", "Facturation"];

/**
 * ST-06 — Macros (1000 px) : barre de recherche + « + Nouvelle macro », groupes par
 * catégorie (titre 11px/700 uppercase) dans une carte par groupe, résumé d'actions
 * généré, pastille de périmètre, usage 30 j, éditeur en drawer 420 px.
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
    return a.localeCompare(b, "fr-FR");
  });

  return (
    <PageShell maxWidth={1000}>
      <PageHeader
        title={t("app.settings.rules.macrosTitle")}
        subtitle={t("app.settings.rules.macrosSubtitle")}
      />

      {saved === "1" && (
        <p style={{ fontSize: 12.5, color: "var(--ok)" }}>{t("app.settings.rules.saved")}</p>
      )}

      <div className="st-rise flex flex-col" style={{ gap: 20 }}>
        {/* Recherche + création */}
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
          <Drawer
            title={t("app.settings.rules.macroCreateTitle")}
            trigger={<>{t("app.settings.rules.macroNew")}</>}
            triggerClassName="inline-flex items-center justify-center rounded-md font-semibold text-white"
            triggerStyle={{ height: 34, padding: "0 14px", fontSize: 13, background: "var(--acc)" }}
          >
            <MacroForm teams={teamRows} t={t} />
          </Drawer>
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
                className="overflow-hidden rounded-[10px] border"
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
                      className="st-row flex items-center border-b"
                      style={{ padding: "12px 15px", gap: 13, borderColor: "var(--line-2)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <Drawer
                          title={t("app.settings.rules.macroEditTitle")}
                          trigger={<>{m.name}</>}
                          triggerClassName="block truncate text-left font-semibold"
                          triggerStyle={{ fontSize: 13.5, color: "var(--ink)" }}
                        >
                          <MacroForm macro={m} teams={teamRows} t={t} />
                        </Drawer>
                        <p className="truncate" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                          {macroActionsSummary(actions, teamNameById)}
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

/** Drawer d'édition 420 px : nom, catégorie, texte inséré, statut appliqué, disponibilité. */
function MacroForm({
  macro,
  teams,
  t,
}: {
  macro?: MacroRow;
  teams: { id: string; name: string }[];
  t: Translate;
}) {
  const actions = (macro?.actions as { type: string; value?: unknown }[]) ?? [];
  const insert = actions.find((a) => a.type === "insert_text" || a.type === "insert_note");
  const insertKind = insert?.type === "insert_note" ? "insert_note" : "insert_text";
  const insertText = String(insert?.value ?? "");
  const setStatus = String(actions.find((a) => a.type === "set_status")?.value ?? "");
  const availability =
    macro?.availability === "team" && macro.teamId ? `team:${macro.teamId}` : "everyone";
  const control = { minHeight: 36, padding: "7px 11px", fontSize: 13.5 } as const;

  return (
    <form action={saveMacro} className="flex h-full flex-col" style={{ gap: 14 }}>
      {macro && <input type="hidden" name="macroId" value={macro.id} />}

      <Field label={t("app.settings.rules.macroName")}>
        <TextInput
          name="name"
          required
          defaultValue={macro?.name ?? ""}
          placeholder={t("app.settings.rules.ackReceipt")}
          style={control}
        />
      </Field>

      <Field label={t("app.settings.rules.macroCategory")}>
        <TextInput
          name="category"
          defaultValue={macro?.category ?? ""}
          placeholder={t("app.settings.rules.macroCategoryPlaceholder")}
          style={control}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          {t("app.settings.rules.macroInsertKind")}
        </span>
        <div className="flex gap-4" style={{ fontSize: 13.5 }}>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="insertKind"
              value="insert_text"
              defaultChecked={insertKind === "insert_text"}
            />
            {t("app.settings.rules.macroInsertText")}
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="insertKind"
              value="insert_note"
              defaultChecked={insertKind === "insert_note"}
            />
            {t("app.settings.rules.macroInsertNote")}
          </label>
        </div>
      </div>

      <Field
        label={t("app.settings.rules.macroText")}
        hint={t("app.settings.rules.macroTextHint")}
      >
        <textarea
          name="insertText"
          required
          rows={4}
          defaultValue={insertText}
          className="rounded-md border"
          style={{
            minHeight: 96,
            padding: "10px 11px",
            fontSize: 13.5,
            lineHeight: 1.55,
            borderColor: "var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
        />
      </Field>

      <Field label={t("app.settings.rules.macroStatus")}>
        <Select name="setStatus" defaultValue={setStatus} style={control}>
          <option value="">{t("app.settings.rules.macroStatusNone")}</option>
          {Object.entries(STATUS_KEYS).map(([k, v]) => (
            <option key={k} value={k}>
              {t(v)}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={t("app.settings.rules.macroAvailability")}
        hint={t("app.settings.rules.macroAvailabilityHint")}
      >
        <Select name="availability" defaultValue={availability} style={control}>
          <option value="everyone">{t("app.settings.rules.macroScopeEveryone")}</option>
          {teams.map((team) => (
            <option key={team.id} value={`team:${team.id}`}>
              {team.name}
            </option>
          ))}
        </Select>
      </Field>

      <div
        className="mt-auto flex items-center gap-2 border-t pt-3"
        style={{ borderColor: "var(--line)" }}
      >
        {macro && (
          <button
            type="submit"
            formAction={deleteMacro}
            className="rounded-md border font-medium"
            style={{
              height: 34,
              padding: "0 14px",
              fontSize: 13,
              borderColor: "var(--dang)",
              color: "var(--dang)",
              background: "var(--panel)",
            }}
          >
            {t("app.settings.rules.delete")}
          </button>
        )}
        <span className="flex-1" />
        <button
          type="submit"
          className="rounded-md font-semibold text-white"
          style={{ height: 34, padding: "0 16px", fontSize: 13, background: "var(--acc)" }}
        >
          {t("app.settings.rules.save")}
        </button>
      </div>
    </form>
  );
}
