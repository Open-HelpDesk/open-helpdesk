"use client";

/**
 * Éditeur de AG-04 : onglets Réponse / Note interne, menu macros (ST-06) qui insère le
 * texte (variables résolues) et présélectionne la bascule de statut, bouton scindé
 * « Envoyer & passer à ». Reste à venir : texte riche, pièces jointes, slash-commands,
 * insertion d'article KB, détection de collision.
 */
import { useState } from "react";
import { sendReply } from "../actions";

export type MacroOption = {
  id: string;
  name: string;
  category: string | null;
  insertText: string;
  setStatus: string;
};

export function ReplyEditor({
  ticketId,
  ticketNumber,
  contactName,
  macros,
}: {
  ticketId: string;
  ticketNumber: number;
  contactName: string;
  macros: MacroOption[];
}) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"public_reply" | "internal_note">("public_reply");
  const [nextStatus, setNextStatus] = useState("waiting");

  function applyMacro(macroId: string) {
    const macro = macros.find((m) => m.id === macroId);
    if (!macro) return;
    const rendered = macro.insertText
      .replaceAll("{{contact.name}}", contactName)
      .replaceAll("{{ticket.number}}", String(ticketNumber));
    setBody((prev) => (prev ? `${prev}\n${rendered}` : rendered));
    if (macro.setStatus) setNextStatus(macro.setStatus);
  }

  const inputStyle = { borderColor: "var(--line)", background: "var(--bg)" } as const;

  return (
    <form
      action={sendReply}
      className="shrink-0 border-t p-4"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="mb-2 flex items-center gap-4 text-sm">
        <button
          type="button"
          onClick={() => setKind("public_reply")}
          className="font-medium"
          style={kind === "public_reply" ? { color: "var(--acc)" } : { color: "var(--mute)" }}
        >
          Réponse
        </button>
        <button
          type="button"
          onClick={() => setKind("internal_note")}
          className="font-medium"
          style={kind === "internal_note" ? { color: "var(--wait)" } : { color: "var(--mute)" }}
        >
          Note interne
        </button>
        <span className="flex-1" />
        {macros.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              applyMacro(e.target.value);
              e.target.value = "";
            }}
            className="rounded-md border px-2 py-1 text-xs"
            style={inputStyle}
            title="Appliquer une macro"
          >
            <option value="">Macros…</option>
            {macros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.category ? `${m.category} · ` : ""}
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <textarea
        name="body"
        required
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          kind === "internal_note"
            ? "Note visible uniquement par les agents…"
            : `Répondre à ${contactName}…`
        }
        className="w-full resize-y rounded-md border p-3 text-sm outline-none"
        style={
          kind === "internal_note"
            ? { borderColor: "var(--note-line)", background: "var(--note)" }
            : inputStyle
        }
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <label className="text-xs" style={{ color: "var(--mute)" }}>
          Envoyer &amp; passer à
        </label>
        <select
          name="nextStatus"
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={inputStyle}
        >
          <option value="">— sans changement —</option>
          <option value="open">Ouvert</option>
          <option value="waiting">En attente</option>
          <option value="resolved">Résolu</option>
        </select>
        <button
          type="submit"
          className="rounded-md px-4 py-1.5 text-sm font-semibold text-white"
          style={{ background: kind === "internal_note" ? "var(--wait)" : "var(--acc)" }}
        >
          {kind === "internal_note" ? "Ajouter la note" : "Envoyer"}
        </button>
      </div>
    </form>
  );
}
