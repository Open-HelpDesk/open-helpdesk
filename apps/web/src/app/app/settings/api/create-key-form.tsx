"use client";

/**
 * ST-10 — Création d'une clé API : la clé complète est renvoyée par la server
 * action et affichée UNE seule fois dans l'encadré « copiez-la maintenant ».
 */
import { useActionState } from "react";
import { CopyButton } from "@/components/settings-overlays";
import type { NewKeyState } from "./actions";

export function CreateKeyForm({
  action,
}: {
  action: (prev: NewKeyState, formData: FormData) => Promise<NewKeyState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          name="name"
          required
          placeholder="Nom de la clé — ex. Intégration Salesforce"
          className="min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-sm"
          style={{
            minWidth: 220,
            borderColor: "var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
        />
        <select
          name="scopes"
          defaultValue="read"
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
        >
          <option value="read">Lecture seule</option>
          <option value="read_write">Lecture + écriture</option>
          <option value="ticket_create">Création de ticket</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md px-3.5 font-semibold text-white disabled:opacity-50"
          style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
        >
          {pending ? "Création…" : "Créer une clé"}
        </button>
      </form>

      {state && (
        <div
          className="rounded-[10px] border"
          style={{ borderColor: "var(--acc-b)", background: "var(--acc-t)", padding: 14 }}
        >
          <p className="font-semibold" style={{ fontSize: 13, color: "var(--acc)" }}>
            Nouvelle clé créée — copiez-la maintenant
          </p>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            « {state.name} » — cette clé ne sera plus jamais affichée.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-md border px-2.5 py-1.5 font-mono"
              style={{
                fontSize: 12.5,
                borderColor: "var(--acc-b)",
                background: "var(--bg)",
                color: "var(--ink)",
              }}
            >
              {state.key}
            </code>
            <CopyButton text={state.key} />
          </div>
        </div>
      )}
    </div>
  );
}
