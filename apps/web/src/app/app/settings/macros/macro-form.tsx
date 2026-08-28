import { Card, Field, Select, TextInput } from "@/components/settings-page";
import { STATUS_KEYS } from "@/lib/format";
import type { Translate } from "@/i18n/server";
import { deleteMacro, saveMacro } from "./actions";

/**
 * The macro form — name, category, inserted text, applied status, availability.
 *
 * It used to live inside macros/page.tsx because a 420 px drawer was its only
 * home. ST-06b gives it a page, so the form moves out here and both the list and
 * that page use the same one.
 */

export type MacroRow = {
  id: string;
  name: string;
  category: string | null;
  actions: unknown;
  availability: string;
  teamId: string | null;
};

export function MacroForm({
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

  return (
    <form action={saveMacro} className="flex flex-col" style={{ gap: 16 }}>
      {macro && <input type="hidden" name="macroId" value={macro.id} />}

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("app.settings.rules.macroName")}>
            <TextInput
              name="name"
              required
              defaultValue={macro?.name ?? ""}
              placeholder={t("app.settings.rules.ackReceipt")}
            />
          </Field>
          <Field label={t("app.settings.rules.macroCategory")}>
            <TextInput
              name="category"
              defaultValue={macro?.category ?? ""}
              placeholder={t("app.settings.rules.macroCategoryPlaceholder")}
            />
          </Field>
        </div>

        <div className="flex flex-col" style={{ gap: 6 }}>
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

        <Field label={t("app.settings.rules.macroText")} hint={t("app.settings.rules.macroTextHint")}>
          <textarea
            name="insertText"
            required
            rows={6}
            defaultValue={insertText}
            className="ohd-field outline-none"
            style={{
              minHeight: 150,
              padding: "11px 12px",
              borderRadius: 9,
              border: "1px solid var(--line)",
              fontSize: 13.5,
              lineHeight: 1.55,
              background: "var(--panel)",
              color: "var(--ink)",
            }}
          />
        </Field>
      </Card>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("app.settings.rules.macroStatus")}>
            <Select name="setStatus" defaultValue={setStatus}>
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
            <Select name="availability" defaultValue={availability}>
              <option value="everyone">{t("app.settings.rules.macroScopeEveryone")}</option>
              {teams.map((team) => (
                <option key={team.id} value={`team:${team.id}`}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <div className="flex items-center" style={{ gap: 10 }}>
        {macro && (
          <button
            type="submit"
            formAction={deleteMacro}
            className="ohd-hover-edge-ink font-medium"
            style={{
              height: 38,
              padding: "0 15px",
              borderRadius: 9,
              border: "1px solid var(--dang)",
              fontSize: 13,
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
          className="font-semibold"
          style={{
            color: "var(--on-brand)",
            height: 38,
            padding: "0 16px",
            borderRadius: 9,
            fontSize: 13.5,
            background: "var(--brand)",
          }}
        >
          {t("app.settings.rules.save")}
        </button>
      </div>
    </form>
  );
}
