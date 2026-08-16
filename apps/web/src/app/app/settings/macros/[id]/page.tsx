import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { db, macros } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { STATUS_LABELS_FR } from "@/lib/format";
import { saveMacro } from "../actions";

/** ST-06 — Éditeur de macro : texte inséré (variables) + bascule de statut optionnelle. */
export default async function MacroEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireAgent();
  const { id } = await params;
  const isNew = id === "new";

  const macro = isNew
    ? undefined
    : (
        await db
          .select()
          .from(macros)
          .where(and(eq(macros.tenantId, tenant.id), eq(macros.id, id)))
      )[0];
  if (!isNew && !macro) notFound();

  const actions = (macro?.actions as { type: string; value?: unknown }[]) ?? [];
  const insertText = String(actions.find((a) => a.type === "insert_text")?.value ?? "");
  const setStatus = String(actions.find((a) => a.type === "set_status")?.value ?? "");

  const inputStyle = {
    borderColor: "var(--line)",
    background: "var(--bg)",
    color: "var(--ink)",
  } as const;

  return (
    <div>
      <Link href="/app/settings/macros" className="font-mono text-xs" style={{ color: "var(--mute)" }}>
        ← Macros
      </Link>
      <h1 className="mb-5 mt-2 text-lg font-semibold">
        {isNew ? "Nouvelle macro" : `Modifier « ${macro!.name} »`}
      </h1>

      <form action={saveMacro} className="flex max-w-xl flex-col gap-4">
        <input type="hidden" name="macroId" value={isNew ? "" : macro!.id} />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            NOM
            <input
              name="name"
              required
              defaultValue={macro?.name ?? ""}
              className="rounded-md border px-3 py-2 text-sm font-normal"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            CATÉGORIE
            <input
              name="category"
              defaultValue={macro?.category ?? ""}
              placeholder="Général"
              className="rounded-md border px-3 py-2 text-sm font-normal"
              style={inputStyle}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
          TEXTE INSÉRÉ — variables : {"{{contact.name}}"}, {"{{ticket.number}}"}
          <textarea
            name="insertText"
            required
            rows={6}
            defaultValue={insertText}
            className="rounded-md border px-3 py-2 text-sm font-normal"
            style={inputStyle}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
          PASSER LE TICKET À (OPTIONNEL)
          <select
            name="setStatus"
            defaultValue={setStatus}
            className="max-w-xs rounded-md border px-2 py-2 text-sm font-normal"
            style={inputStyle}
          >
            <option value="">— sans changement —</option>
            {Object.entries(STATUS_LABELS_FR).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--acc)" }}
          >
            Enregistrer
          </button>
          <Link
            href="/app/settings/macros"
            className="rounded-md border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--line)" }}
          >
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
