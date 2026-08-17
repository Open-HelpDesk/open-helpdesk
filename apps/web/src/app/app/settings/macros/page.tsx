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

/**
 * ST-06 — Macros (1000 px) : liste par catégories avec résumé d'actions généré,
 * badge de périmètre (Tous les agents / équipe), usage 30 j (« — » tant que non
 * mesuré), éditeur en drawer (texte / note interne, statut appliqué, disponibilité).
 */
export default async function MacrosPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { saved } = await searchParams;

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
  const byCategory = new Map<string, MacroRow[]>();
  for (const m of rows) {
    const key = m.category ?? "Sans catégorie";
    byCategory.set(key, [...(byCategory.get(key) ?? []), m]);
  }

  return (
    <PageShell maxWidth={1000}>
      <PageHeader
        code="ST-06"
        title="Macros"
        subtitle="Réponses types et actions groupées, disponibles depuis le détail d'un ticket."
        actions={
          <Drawer
            title="Nouvelle macro"
            trigger={<>Nouvelle macro</>}
            triggerClassName="rounded-md px-3.5 font-semibold text-white"
            triggerStyle={{ height: 32, fontSize: 13, background: "var(--acc)" }}
          >
            <MacroForm teams={teamRows} />
          </Drawer>
        }
      />

      {saved === "1" && <p style={{ fontSize: 12.5, color: "var(--ok)" }}>✓ Enregistré</p>}

      {rows.length === 0 ? (
        <EmptyState
          title="Aucune macro"
          text="Créez des réponses types pour vos demandes récurrentes — accusé de réception, demande de précisions, résolution confirmée…"
        />
      ) : (
        [...byCategory.entries()].map(([category, list]) => (
          <div key={category}>
            <p
              className="mb-2 font-mono font-bold uppercase"
              style={{ fontSize: 10.5, letterSpacing: "0.07em", color: "var(--ink-3)" }}
            >
              {category}
            </p>
            <ul className="flex flex-col gap-2">
              {list.map((m) => {
                const actions = (m.actions as { type: string; value?: unknown }[]) ?? [];
                const scope =
                  m.availability === "team" && m.teamId
                    ? (teamNameById.get(m.teamId) ?? "Équipe")
                    : m.availability === "personal"
                      ? "Personnel"
                      : "Tous les agents";
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-[10px] border"
                    style={{
                      background: "var(--panel)",
                      borderColor: "var(--line)",
                      padding: "10px 14px",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <Drawer
                        title={`Modifier « ${m.name} »`}
                        trigger={<>{m.name}</>}
                        triggerClassName="block truncate text-left font-semibold"
                        triggerStyle={{ fontSize: 13.5, color: "var(--ink)" }}
                      >
                        <MacroForm macro={m} teams={teamRows} />
                      </Drawer>
                      <p className="truncate" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                        {macroActionsSummary(actions, teamNameById)}
                      </p>
                    </div>
                    <StatusPill tone={m.availability === "team" ? "open" : "acc"}>
                      {scope}
                    </StatusPill>
                    <span
                      className="whitespace-nowrap font-mono tabular-nums"
                      style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                      title="Utilisations sur 30 jours"
                    >
                      — / 30 j
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </PageShell>
  );
}

/** Drawer d'édition : texte / note interne, statut appliqué, disponibilité. */
function MacroForm({ macro, teams }: { macro?: MacroRow; teams: { id: string; name: string }[] }) {
  const actions = (macro?.actions as { type: string; value?: unknown }[]) ?? [];
  const insert = actions.find((a) => a.type === "insert_text" || a.type === "insert_note");
  const insertKind = insert?.type === "insert_note" ? "insert_note" : "insert_text";
  const insertText = String(insert?.value ?? "");
  const setStatus = String(actions.find((a) => a.type === "set_status")?.value ?? "");
  const availability =
    macro?.availability === "team" && macro.teamId ? `team:${macro.teamId}` : "everyone";

  return (
    <form action={saveMacro} className="flex h-full flex-col gap-4">
      {macro && <input type="hidden" name="macroId" value={macro.id} />}
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Nom">
          <TextInput name="name" required defaultValue={macro?.name ?? ""} />
        </Field>
        <Field label="Catégorie">
          <TextInput
            name="category"
            defaultValue={macro?.category ?? ""}
            placeholder="Réponses courantes"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
          Type d'insertion
        </span>
        <div className="flex gap-4" style={{ fontSize: 13 }}>
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
        label="Texte"
        hint="Variables : {{contact.name}}, {{ticket.number}}, {{ticket.subject}}."
      >
        <textarea
          name="insertText"
          required
          rows={6}
          defaultValue={insertText}
          className="rounded-md border px-2.5 py-1.5 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
        />
      </Field>

      <Field label="Statut appliqué">
        <Select name="setStatus" defaultValue={setStatus}>
          <option value="">— sans changement —</option>
          {Object.entries(STATUS_LABELS_FR).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Disponibilité">
        <Select name="availability" defaultValue={availability}>
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
            className="rounded-md border px-3 font-medium"
            style={{
              height: 32,
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
          className="rounded-md px-3.5 font-semibold text-white"
          style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
        >
          Enregistrer
        </button>
      </div>
    </form>
  );
}
