import { requireAgent } from "@/lib/session";
import { db, macros, teams } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { macroActionsSummary } from "@/lib/rule-labels";
import { STATUS_LABELS_FR } from "@/lib/format";
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

  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));
  const needle = query.toLocaleLowerCase("fr-FR");
  const visible = needle
    ? rows.filter((m) => m.name.toLocaleLowerCase("fr-FR").includes(needle))
    : rows;

  const byCategory = new Map<string, MacroRow[]>();
  for (const m of visible) {
    const key = m.category ?? "Sans catégorie";
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
        title="Macros"
        subtitle="Réponses types et actions groupées, disponibles depuis le détail d'un ticket."
      />

      {saved === "1" && <p style={{ fontSize: 12.5, color: "var(--ok)" }}>✓ Enregistré</p>}

      <div className="st-rise flex flex-col" style={{ gap: 20 }}>
        {/* Recherche + création */}
        <div className="flex flex-wrap items-center" style={{ gap: 9 }}>
          <form action="/app/settings/macros" className="min-w-0 flex-1" style={{ maxWidth: 300 }}>
            <TextInput
              name="q"
              defaultValue={query}
              placeholder="Rechercher une macro…"
              aria-label="Rechercher une macro"
              className="w-full"
              style={{ height: 34, padding: "0 11px", fontSize: 13 }}
            />
          </form>
          <span className="flex-1" />
          <Drawer
            title="Créer une macro"
            trigger={<>+ Nouvelle macro</>}
            triggerClassName="inline-flex items-center justify-center rounded-md font-semibold text-white"
            triggerStyle={{ height: 34, padding: "0 14px", fontSize: 13, background: "var(--acc)" }}
          >
            <MacroForm teams={teamRows} />
          </Drawer>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="Aucune macro"
            text="Créez des réponses types pour vos demandes récurrentes — accusé de réception, demande de précisions, résolution confirmée…"
          />
        ) : groups.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
            Aucune macro ne correspond à « {query} ».
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
                      ? (teamNameById.get(m.teamId) ?? "Équipe")
                      : m.availability === "personal"
                        ? "Personnel"
                        : "Tous les agents";
                  return (
                    <div
                      key={m.id}
                      className="st-row flex items-center border-b"
                      style={{ padding: "12px 15px", gap: 13, borderColor: "var(--line-2)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <Drawer
                          title="Modifier une macro"
                          trigger={<>{m.name}</>}
                          triggerClassName="block truncate text-left font-semibold"
                          triggerStyle={{ fontSize: 13.5, color: "var(--ink)" }}
                        >
                          <MacroForm macro={m} teams={teamRows} />
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
                        title="Utilisations sur 30 jours"
                      >
                        — / 30 j
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
function MacroForm({ macro, teams }: { macro?: MacroRow; teams: { id: string; name: string }[] }) {
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

      <Field label="Nom">
        <TextInput
          name="name"
          required
          defaultValue={macro?.name ?? ""}
          placeholder="Accusé de réception"
          style={control}
        />
      </Field>

      <Field label="Catégorie">
        <TextInput
          name="category"
          defaultValue={macro?.category ?? ""}
          placeholder="Réponses courantes"
          style={control}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          Type d&apos;insertion
        </span>
        <div className="flex gap-4" style={{ fontSize: 13.5 }}>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="insertKind"
              value="insert_text"
              defaultChecked={insertKind === "insert_text"}
            />
            Insérer un texte
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="insertKind"
              value="insert_note"
              defaultChecked={insertKind === "insert_note"}
            />
            Note interne
          </label>
        </div>
      </div>

      <Field
        label="Texte inséré"
        hint="Variables : {{contact.name}}, {{ticket.number}}, {{ticket.subject}}."
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

      <Field label="Statut appliqué">
        <Select name="setStatus" defaultValue={setStatus} style={control}>
          <option value="">— sans changement —</option>
          {Object.entries(STATUS_LABELS_FR).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Disponibilité"
        hint="Restreignez à une équipe pour éviter de surcharger la liste des macros."
      >
        <Select name="availability" defaultValue={availability} style={control}>
          <option value="everyone">Tous les agents</option>
          {teams.map((t) => (
            <option key={t.id} value={`team:${t.id}`}>
              {t.name}
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
            Supprimer
          </button>
        )}
        <span className="flex-1" />
        <button
          type="submit"
          className="rounded-md font-semibold text-white"
          style={{ height: 34, padding: "0 16px", fontSize: 13, background: "var(--acc)" }}
        >
          Enregistrer
        </button>
      </div>
    </form>
  );
}
