"use client";

/**
 * AG-04 — Composeur : onglets Réponse / Note interne, brouillon localStorage horodaté,
 * toolbar markdown B I U S ≔ ⛓ ❝ ‹›, menu « / Macros », variables {{var}},
 * split button « Envoyer & {statut} | ▾ » (Résolu / En attente / Ouvert / sans changement).
 */
import { useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { STATUS_LABELS_FR } from "@/lib/format";
import { sendReply } from "../actions";

export type MacroOption = {
  id: string;
  name: string;
  category: string | null;
  insertText: string;
  insertKind: "public_reply" | "internal_note";
  setStatus: string;
  hasServerActions: boolean;
};

const SEND_STATUSES = ["resolved", "waiting", "open", ""] as const;

function sendLabel(status: string): string {
  if (!status) return "Envoyer";
  return `Envoyer & ${STATUS_LABELS_FR[status] ?? status}`;
}

const VARIABLES = [
  { key: "{{contact.prenom}}", label: "Prénom du contact" },
  { key: "{{contact.name}}", label: "Nom du contact" },
  { key: "{{ticket.number}}", label: "Numéro du ticket" },
];

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
  const [nextStatus, setNextStatus] = useState("resolved");
  const [appliedMacroId, setAppliedMacroId] = useState("");
  const [statusMenu, setStatusMenu] = useState(false);
  const [macroMenu, setMacroMenu] = useState(false);
  const [varMenu, setVarMenu] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftKey = `ohd-draft-${ticketId}`;

  // Brouillon : restauration au montage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as { body: string; at: number };
        if (draft.body) {
          setBody(draft.body);
          setDraftSavedAt(draft.at);
        }
      }
    } catch {
      /* brouillon illisible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  // Brouillon : enregistrement debouncé + horloge du libellé.
  useEffect(() => {
    if (!body) return;
    const t = setTimeout(() => {
      const at = Date.now();
      try {
        localStorage.setItem(draftKey, JSON.stringify({ body, at }));
        setDraftSavedAt(at);
      } catch {
        /* stockage plein */
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  useEffect(() => {
    const t = setInterval(() => forceTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  function draftLabel(): string | null {
    if (!draftSavedAt || !body) return null;
    const sec = Math.max(1, Math.round((Date.now() - draftSavedAt) / 1000));
    if (sec < 60) return `Brouillon enregistré il y a ${sec} s`;
    return `Brouillon enregistré il y a ${Math.floor(sec / 60)} min`;
  }

  /** Insère du markdown autour de la sélection du textarea. */
  function insertMd(before: string, after = "", placeholder = "") {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const selectedText = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + selectedText + after + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    });
  }

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(start));
    requestAnimationFrame(() => el?.focus());
  }

  function applyMacro(macroId: string) {
    const macro = macros.find((m) => m.id === macroId);
    if (!macro) return;
    const prenom = contactName.split(/\s+/)[0] ?? contactName;
    const rendered = macro.insertText
      .replaceAll("{{contact.name}}", contactName)
      .replaceAll("{{contact.nom}}", contactName)
      .replaceAll("{{contact.prenom}}", prenom)
      .replaceAll("{{ticket.number}}", String(ticketNumber));
    setBody((prev) => (prev ? `${prev}\n${rendered}` : rendered));
    setKind(macro.insertKind);
    if (macro.setStatus) setNextStatus(macro.setStatus);
    if (macro.hasServerActions || macro.setStatus) setAppliedMacroId(macro.id);
    setMacroMenu(false);
  }

  const isNote = kind === "internal_note";

  const toolBtn = {
    width: 26,
    height: 24,
    borderRadius: 5,
    color: "var(--ink-2)",
    fontSize: 12.5,
  } as const;

  const TOOLBAR: { label: string; title: string; run: () => void }[] = [
    { label: "B", title: "Gras", run: () => insertMd("**", "**", "texte") },
    { label: "I", title: "Italique", run: () => insertMd("*", "*", "texte") },
    { label: "U", title: "Souligné", run: () => insertMd("<u>", "</u>", "texte") },
    { label: "S", title: "Barré", run: () => insertMd("~~", "~~", "texte") },
    { label: "≔", title: "Liste", run: () => insertMd("\n- ", "", "élément") },
    { label: "⛓", title: "Lien", run: () => insertMd("[", "](https://)", "texte") },
    { label: "❝", title: "Citation", run: () => insertMd("\n> ", "", "citation") },
    { label: "‹›", title: "Code", run: () => insertMd("`", "`", "code") },
  ];

  return (
    <form
      action={sendReply}
      onSubmit={() => {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignoré */
        }
      }}
      className="shrink-0 border-t px-4 pb-3 pt-2"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="macroId" value={appliedMacroId} />
      <input type="hidden" name="nextStatus" value={isNote ? "" : nextStatus} />

      {/* Onglets + brouillon */}
      <div className="mb-2 flex items-center gap-1 text-[13px]">
        <button
          type="button"
          onClick={() => setKind("public_reply")}
          className="rounded-md px-2.5 py-1 font-medium"
          style={
            !isNote
              ? { background: "var(--acc-t)", color: "var(--acc)" }
              : { color: "var(--ink-3)" }
          }
        >
          Réponse
        </button>
        <button
          type="button"
          onClick={() => setKind("internal_note")}
          className="rounded-md px-2.5 py-1 font-medium"
          style={
            isNote
              ? { background: "var(--note)", color: "var(--wait)" }
              : { color: "var(--ink-3)" }
          }
        >
          Note interne
        </button>
        <span className="flex-1" />
        {draftLabel() && (
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{draftLabel()}</span>
        )}
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 rounded-t-md border border-b-0 px-1.5 py-1"
        style={{
          borderColor: isNote ? "var(--note-line)" : "var(--line)",
          background: isNote ? "var(--note)" : "var(--sunk)",
        }}
      >
        {TOOLBAR.map((b) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            onClick={b.run}
            className="flex items-center justify-center hover:opacity-70"
            style={{
              ...toolBtn,
              fontWeight: b.label === "B" ? 700 : 500,
              fontStyle: b.label === "I" ? "italic" : undefined,
              textDecoration:
                b.label === "U" ? "underline" : b.label === "S" ? "line-through" : undefined,
            }}
          >
            {b.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px" style={{ background: "var(--line)" }} />

        {/* / Macros */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setMacroMenu((v) => !v);
              setVarMenu(false);
              setStatusMenu(false);
            }}
            className="rounded px-2 py-0.5 text-[12px] font-medium"
            style={{ color: "var(--ink-2)" }}
          >
            / Macros
          </button>
          {macroMenu && (
            <div
              className="absolute bottom-full left-0 z-30 mb-1 flex max-h-64 min-w-64 flex-col overflow-y-auto rounded-md border py-1 shadow-lg"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              {macros.length === 0 && (
                <span className="px-3 py-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  Aucune macro disponible.
                </span>
              )}
              {macros.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => applyMacro(m.id)}
                  className="px-3 py-1.5 text-left text-[12.5px] hover:opacity-70"
                >
                  {m.category && (
                    <span style={{ color: "var(--ink-3)" }}>{m.category} · </span>
                  )}
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Variables */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setVarMenu((v) => !v);
              setMacroMenu(false);
              setStatusMenu(false);
            }}
            className="rounded px-2 py-0.5 text-[12px]"
            style={{ color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}
          >
            {"{{var}}"}
          </button>
          {varMenu && (
            <div
              className="absolute bottom-full left-0 z-30 mb-1 flex min-w-56 flex-col rounded-md border py-1 shadow-lg"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    insertAtCursor(v.key);
                    setVarMenu(false);
                  }}
                  className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-left text-[12.5px] hover:opacity-70"
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                    {v.key}
                  </span>
                  <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>{v.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        name="body"
        required
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          isNote ? "Note visible uniquement par les agents…" : `Répondre à ${contactName}…`
        }
        className="w-full resize-y rounded-b-md border p-3 text-sm outline-none"
        style={
          isNote
            ? { borderColor: "var(--note-line)", background: "var(--note)" }
            : { borderColor: "var(--line)", background: "var(--bg)" }
        }
      />

      <div className="mt-2 flex items-center gap-2">
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 text-[12px]"
          style={{ color: "var(--ink-3)" }}
          title="Joindre des fichiers (10 Mo max par fichier)"
        >
          <Paperclip size={14} />
          <input name="files" type="file" multiple className="max-w-44 text-[11px]" />
        </label>
        <span className="flex-1" />

        {isNote ? (
          <button
            type="submit"
            className="rounded-md px-4 text-[13px] font-semibold text-white"
            style={{ height: 32, background: "var(--wait)" }}
          >
            Ajouter la note
          </button>
        ) : (
          <div className="relative flex">
            <button
              type="submit"
              className="rounded-l-md px-4 text-[13px] font-semibold text-white"
              style={{ height: 32, background: "var(--acc)" }}
            >
              {sendLabel(nextStatus)}
            </button>
            <button
              type="button"
              aria-label="Choisir le statut après envoi"
              onClick={() => {
                setStatusMenu((v) => !v);
                setMacroMenu(false);
                setVarMenu(false);
              }}
              className="rounded-r-md px-2 text-[11px] text-white"
              style={{
                height: 32,
                background: "var(--acc)",
                borderLeft: "1px solid rgba(255,255,255,.3)",
              }}
            >
              ▾
            </button>
            {statusMenu && (
              <div
                className="absolute bottom-full right-0 z-30 mb-1 flex min-w-48 flex-col rounded-md border py-1 shadow-lg"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                {SEND_STATUSES.map((s) => (
                  <button
                    key={s || "none"}
                    type="button"
                    onClick={() => {
                      setNextStatus(s);
                      setStatusMenu(false);
                    }}
                    className="px-3 py-1.5 text-left text-[12.5px] hover:opacity-70"
                    style={{
                      fontWeight: s === nextStatus ? 600 : 400,
                      color: s === nextStatus ? "var(--acc)" : "var(--ink)",
                    }}
                  >
                    {s ? sendLabel(s) : "Envoyer sans changement de statut"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
