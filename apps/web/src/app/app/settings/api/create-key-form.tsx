"use client";

/**
 * ST-10 — Encadré « Nouvelle clé créée — copiez-la maintenant » (bordure --acc-b,
 * fond --acc-t, clé complète en mono + bouton Copier accent) suivi de la barre de
 * création « + Créer une clé ». La clé complète n'est renvoyée qu'une seule fois
 * par la server action.
 */
import { useActionState } from "react";
import { CopyButton } from "@/components/settings-overlays";
import { useT } from "@/i18n/client";
import type { NewKeyState } from "./actions";

export function CreateKeyForm({
  action,
}: {
  action: (prev: NewKeyState, formData: FormData) => Promise<NewKeyState>;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {state && (
        <div
          className="flex items-center border"
          style={{
            gap: 11,
            padding: "13px 15px",
            borderRadius: 9,
            borderColor: "var(--acc-b)",
            background: "var(--acc-t)",
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold" style={{ fontSize: 13, color: "var(--acc)" }}>
              {t("app.settings.dev.newKeyTitle")}
            </div>
            <div className="truncate font-mono" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              {state.key}
            </div>
          </div>
          <CopyButton text={state.key} />
        </div>
      )}

      <form
        action={formAction}
        className="flex flex-wrap items-center self-start"
        style={{ gap: 9 }}
      >
        <input
          name="name"
          required
          placeholder={t("app.settings.dev.keyNamePlaceholder")}
          className="min-w-0 border"
          style={{
            minWidth: 250,
            height: 32,
            padding: "0 11px",
            borderRadius: 6,
            fontSize: 12.5,
            borderColor: "var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
        />
        <select
          name="scopes"
          defaultValue="read"
          className="border"
          style={{
            height: 32,
            padding: "0 9px",
            borderRadius: 6,
            fontSize: 12.5,
            borderColor: "var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
        >
          <option value="read">{t("app.settings.dev.scopeRead")}</option>
          <option value="read_write">{t("app.settings.dev.scopeReadWrite")}</option>
          <option value="ticket_create">{t("app.settings.dev.scopeTicketCreate")}</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="grid place-items-center border font-semibold disabled:opacity-50"
          style={{
            height: 32,
            padding: "0 13px",
            borderRadius: 6,
            fontSize: 13,
            borderColor: "var(--line)",
            background: "var(--panel)",
            color: "var(--ink-2)",
          }}
        >
          {pending ? t("app.settings.dev.creating") : t("app.settings.dev.createKey")}
        </button>
      </form>
    </div>
  );
}
