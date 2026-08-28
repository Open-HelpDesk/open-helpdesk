import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { db, formFields, ticketFields, ticketForms } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { FIELD_TYPE_KEYS } from "@/lib/rule-labels";
import { getT, type Translate } from "@/i18n/server";
import {
  Field,
  PageHeader,
  PageShell,
  Select,
  StatusPill,
  TextInput,
  Toggle,
} from "@/components/settings-page";
import { Drawer } from "@/components/settings-overlays";
import { addFieldToForm, createForm, deleteField, removeFieldFromForm, saveField } from "./actions";

const FIELDS_GRID = "minmax(200px,1.4fr) 170px 110px 110px 120px";
/** Long labels in the ST-04 table ("Drop-down list") — the composition uses "List". */
function typeLabelLong(type: string, t: Translate): string {
  if (type === "select") return t("app.settings.rules.typeSelectLong");
  return typeLabel(type, t);
}

/** Short label for a field type, or the raw type when it is unknown. */
function typeLabel(type: string, t: Translate): string {
  const messageKey = FIELD_TYPE_KEYS[type];
  return messageKey ? t(messageKey) : type;
}

type FieldRow = typeof ticketFields.$inferSelect;

/**
 * ST-04 — Fields & forms (1100 px). Fields tab: table
 * `minmax(200px,1.4fr) 170px 110px 110px 120px` + 420 px drawer. Forms tab:
 * 3 auto-fit minmax(260px,1fr) columns — available fields / composition / portal preview.
 */
export default async function FieldsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; form?: string; saved?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { tab, form: formParam, saved } = await searchParams;
  const activeTab = tab === "forms" ? "forms" : "fields";

  const [fields, forms, links] = await Promise.all([
    db
      .select()
      .from(ticketFields)
      .where(eq(ticketFields.tenantId, tenant.id))
      .orderBy(asc(ticketFields.position), asc(ticketFields.label)),
    db
      .select()
      .from(ticketForms)
      .where(eq(ticketForms.tenantId, tenant.id))
      .orderBy(asc(ticketForms.position), asc(ticketForms.name)),
    db.select().from(formFields).where(eq(formFields.tenantId, tenant.id)),
  ]);

  const formCountByField = new Map<string, number>();
  for (const l of links) {
    formCountByField.set(l.fieldId, (formCountByField.get(l.fieldId) ?? 0) + 1);
  }

  const selectedForm = forms.find((f) => f.id === formParam) ?? forms[0];
  const selectedLinks = selectedForm
    ? links.filter((l) => l.formId === selectedForm.id).sort((a, b) => a.position - b.position)
    : [];
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const composedFields = selectedLinks
    .map((l) => fieldById.get(l.fieldId))
    .filter((f): f is FieldRow => Boolean(f));
  const availableFields = fields.filter((f) => !selectedLinks.some((l) => l.fieldId === f.id));

  const tabs = [
    {
      label: t("app.settings.rules.fieldsTab"),
      href: "/app/settings/fields",
      active: activeTab === "fields",
    },
    {
      label: t("app.settings.rules.formsTab"),
      href: "/app/settings/fields?tab=forms",
      active: activeTab === "forms",
    },
  ];

  return (
    <PageShell maxWidth={1100}>
      <PageHeader
        title={t("app.settings.rules.fieldsTitle")}
        subtitle={t("app.settings.rules.fieldsSubtitle")}
        tabs={tabs}
      />

      {saved === "1" && (
        <p style={{ fontSize: 12.5, color: "var(--ok)" }}>{t("app.settings.rules.saved")}</p>
      )}

      {activeTab === "fields" ? (
        <div className="st-rise flex flex-col" style={{ gap: 14 }}>
          <div
            className="overflow-x-auto rounded-[10px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <div
              className="grid items-center border-b"
              style={{
                gridTemplateColumns: FIELDS_GRID,
                minWidth: 760,
                padding: "0 14px",
                height: 34,
                background: "var(--sunk)",
                borderColor: "var(--line)",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--ink-3)",
              }}
            >
              <span>{t("app.settings.rules.colField")}</span>
              <span>{t("app.settings.rules.colType")}</span>
              <span>{t("app.settings.rules.colPortal")}</span>
              <span>{t("app.settings.rules.required")}</span>
              <span className="text-right">{t("app.settings.rules.formsTab")}</span>
            </div>
            {fields.length === 0 && (
              <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                {t("app.settings.rules.fieldsEmpty")}
              </p>
            )}
            {fields.map((f) => (
              <div
                key={f.id}
                className="ohd-hover grid items-center border-b"
                style={{
                  gridTemplateColumns: FIELDS_GRID,
                  minWidth: 760,
                  padding: "0 14px",
                  minHeight: 44,
                  borderColor: "var(--line-2)",
                  fontSize: 13,
                }}
              >
                <span className="flex min-w-0 items-center" style={{ paddingRight: 10 }}>
                  <Drawer
                    title={t("app.settings.rules.fieldEditTitle")}
                    trigger={<>{f.label}</>}
                    triggerClassName="min-w-0 truncate text-left"
                    triggerStyle={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}
                  >
                    <FieldForm field={f} t={t} />
                  </Drawer>
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {typeLabelLong(f.type, t)}
                </span>
                <span>
                  {f.portalVisible ? (
                    <StatusPill tone="ok">{t("app.settings.rules.portalVisible")}</StatusPill>
                  ) : (
                    <StatusPill tone="closed">{t("app.settings.rules.portalHidden")}</StatusPill>
                  )}
                </span>
                <span style={{ fontSize: 12.5, color: f.required ? "var(--dang)" : "var(--ink-3)" }}>
                  {f.required ? t("app.settings.rules.required") : "—"}
                </span>
                <span className="text-right tabular-nums" style={{ color: "var(--ink-2)" }}>
                  {formCountByField.get(f.id) ?? 0}
                </span>
              </div>
            ))}
          </div>

          <Drawer
            title={t("app.settings.rules.fieldCreateTitle")}
            trigger={<>{t("app.settings.rules.fieldCreateButton")}</>}
            triggerClassName="inline-flex items-center justify-center self-start rounded-md border font-semibold"
            triggerStyle={{
              height: 32,
              padding: "0 13px",
              fontSize: 13,
              borderColor: "var(--line)",
              background: "var(--panel)",
              color: "var(--ink-2)",
            }}
          >
            <FieldForm t={t} />
          </Drawer>
        </div>
      ) : (
        <>
          {/* Form selector + creation */}
          <div className="flex flex-wrap items-center gap-2">
            {forms.map((f) => {
              const active = selectedForm?.id === f.id;
              return (
                <Link
                  key={f.id}
                  href={`/app/settings/fields?tab=forms&form=${f.id}`}
                  className="ohd-hover-edge-ink rounded-full border font-medium"
                  style={{
                    fontSize: 12.5,
                    padding: "4px 12px",
                    borderColor: active ? "var(--acc)" : "var(--line)",
                    background: active ? "var(--acc-t)" : "var(--panel)",
                    color: active ? "var(--acc)" : "var(--ink-2)",
                  }}
                >
                  {f.name}
                </Link>
              );
            })}
            <span className="flex-1" />
            <form action={createForm} className="flex items-center gap-2">
              <TextInput
                name="name"
                required
                placeholder={t("app.settings.rules.formNamePlaceholder")}
                style={{ width: 180, height: 32, padding: "0 11px", fontSize: 12.5 }}
              />
              <button
                type="submit"
                className="ohd-hover-edge-ink rounded-md border font-semibold"
                style={{
                  height: 32,
                  padding: "0 13px",
                  fontSize: 12.5,
                  borderColor: "var(--line)",
                  background: "var(--panel)",
                  color: "var(--ink-2)",
                }}
              >
                {t("app.settings.rules.formCreateButton")}
              </button>
            </form>
          </div>

          {!selectedForm ? (
            <div
              className="rounded-[10px] border"
              style={{ background: "var(--panel)", borderColor: "var(--line)", padding: 15 }}
            >
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {t("app.settings.rules.formsEmpty")}
              </p>
            </div>
          ) : (
            <div
              className="st-rise grid items-start"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}
            >
              {/* Column 1 — available fields */}
              <div
                className="overflow-hidden rounded-[10px] border"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                <div
                  className="border-b font-semibold"
                  style={{
                    padding: "11px 14px",
                    borderColor: "var(--line)",
                    fontSize: 12.5,
                    color: "var(--ink-2)",
                  }}
                >
                  {t("app.settings.rules.availableFields")}
                </div>
                <div className="flex flex-col" style={{ padding: 9, gap: 5 }}>
                  {availableFields.length === 0 && (
                    <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                      {t("app.settings.rules.allFieldsUsed")}
                    </p>
                  )}
                  {availableFields.map((f) => (
                    <form key={f.id} action={addFieldToForm}>
                      <input type="hidden" name="formId" value={selectedForm.id} />
                      <input type="hidden" name="fieldId" value={f.id} />
                      <button
                        type="submit"
                        title={t("app.settings.rules.addToForm")}
                        className="ohd-hover-edge-ink flex w-full items-center rounded-[7px] border text-left"
                        style={{
                          padding: "9px 11px",
                          gap: 9,
                          borderColor: "var(--line)",
                          background: "var(--bg)",
                          fontSize: 13,
                          color: "var(--ink)",
                          cursor: "grab",
                        }}
                      >
                        <span aria-hidden style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          ⠿
                        </span>
                        <span className="min-w-0 flex-1 truncate">{f.label}</span>
                        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                          {typeLabel(f.type, t)}
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </div>

              {/* Column 2 — composition */}
              <div
                className="overflow-hidden rounded-[10px] border"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                <div
                  className="border-b font-semibold"
                  style={{
                    padding: "11px 14px",
                    borderColor: "var(--acc-b)",
                    background: "var(--acc-t)",
                    fontSize: 12.5,
                    color: "var(--acc)",
                  }}
                >
                  {t("app.settings.rules.formHeading", { name: selectedForm.name })}
                </div>
                <div className="flex flex-col" style={{ padding: 9, gap: 5 }}>
                  <ComposedRow
                    label={t("app.settings.rules.previewSubject")}
                    type={t("app.settings.rules.typeText")}
                    required
                    t={t}
                  />
                  <ComposedRow
                    label={t("app.settings.rules.previewDescription")}
                    type={t("app.settings.rules.typeLongText")}
                    required
                    t={t}
                  />
                  {composedFields.map((f) => (
                    <ComposedRow
                      key={f.id}
                      label={f.label}
                      type={typeLabel(f.type, t)}
                      required={f.required}
                      t={t}
                      remove={
                        <form action={removeFieldFromForm}>
                          <input type="hidden" name="formId" value={selectedForm.id} />
                          <input type="hidden" name="fieldId" value={f.id} />
                          <button
                            title={t("app.settings.rules.removeFromForm")}
                            style={{ fontSize: 11, color: "var(--ink-3)" }}
                          >
                            ✕
                          </button>
                        </form>
                      }
                    />
                  ))}
                  <ComposedRow
                    label={t("app.settings.rules.previewAttachments")}
                    type={t("app.settings.rules.typeFile")}
                    t={t}
                  />
                </div>
              </div>

              {/* Column 3 — portal preview */}
              <div
                className="overflow-hidden rounded-[10px] border"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                <div
                  className="border-b"
                  style={{
                    padding: "9px 13px",
                    background: "var(--sunk)",
                    borderColor: "var(--line)",
                    fontSize: 11.5,
                    color: "var(--ink-3)",
                  }}
                >
                  {t("app.settings.rules.portalPreview")}
                </div>
                <div className="flex flex-col" style={{ padding: 16, gap: 11 }}>
                  <PreviewField label={t("app.settings.rules.previewSubject")} height={36} />
                  <PreviewField label={t("app.settings.rules.previewDescription")} height={72} />
                  {composedFields.map((f) => (
                    <PreviewField key={f.id} label={f.label} height={36} />
                  ))}
                  <span
                    className="flex items-center justify-center font-semibold"
                    style={{ color: "var(--on-brand)", height: 40, borderRadius: 8, fontSize: 13.5, background: "var(--acc)" }}
                  >
                    {t("app.settings.rules.previewSubmit")}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

/** Composition row — "Required" pill 10.5/700 on --dang-t. */
function ComposedRow({
  label,
  type,
  required,
  remove,
  t,
}: {
  label: string;
  type: string;
  required?: boolean;
  remove?: React.ReactNode;
  t: Translate;
}) {
  return (
    <div
      className="flex items-center rounded-[7px] border"
      style={{
        padding: "9px 11px",
        gap: 9,
        borderColor: "var(--acc-b)",
        background: "var(--acc-t)",
        fontSize: 13,
        color: "var(--ink)",
        cursor: "grab",
      }}
    >
      <span aria-hidden style={{ fontSize: 11, color: "var(--ink-3)" }}>
        ⠿
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{type}</span>
      {required && (
        <span
          className="rounded-full font-bold"
          style={{
            padding: "1px 7px",
            fontSize: 10.5,
            background: "var(--dang-t)",
            color: "var(--dang)",
          }}
        >
          {t("app.settings.rules.required")}
        </span>
      )}
      {remove}
    </div>
  );
}

function PreviewField({ label, height }: { label: string; height: number }) {
  return (
    <span className="flex flex-col" style={{ gap: 5 }}>
      <span className="font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
        {label}
      </span>
      <span
        className="block border"
        style={{ height, borderRadius: 7, borderColor: "var(--line)", background: "var(--bg)" }}
      />
    </span>
  );
}

/** Field create/edit drawer (420 px) — localized types, options one per line, portal. */
function FieldForm({ field, t }: { field?: FieldRow; t: Translate }) {
  const control = { minHeight: 36, padding: "7px 11px", fontSize: 13.5 } as const;
  return (
    <form action={saveField} className="flex h-full flex-col" style={{ gap: 14 }}>
      {field && <input type="hidden" name="fieldId" value={field.id} />}
      <Field label={t("app.settings.rules.fieldName")}>
        <TextInput
          name="label"
          required
          defaultValue={field?.label ?? ""}
          placeholder={t("app.settings.rules.fieldNamePlaceholder")}
          style={control}
        />
      </Field>
      <Field label={t("app.settings.rules.colType")}>
        <Select name="type" defaultValue={field?.type ?? "text"} style={control}>
          {Object.entries(FIELD_TYPE_KEYS).map(([v, messageKey]) => (
            <option key={v} value={v}>
              {t(messageKey)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("app.settings.rules.fieldOptions")}>
        <textarea
          name="options"
          rows={3}
          placeholder={t("app.settings.rules.fieldOptionsPlaceholder")}
          defaultValue={((field?.options as string[]) ?? []).join("\n")}
          className="rounded-md border"
          style={{
            minHeight: 76,
            padding: "10px 11px",
            fontSize: 13.5,
            lineHeight: 1.55,
            borderColor: "var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
        />
      </Field>
      <Field
        label={t("app.settings.rules.fieldPortalVisibility")}
        hint={t("app.settings.rules.fieldPortalHint")}
      >
        <Select
          name="portalVisible"
          defaultValue={field?.portalVisible ? "on" : ""}
          style={control}
        >
          <option value="on">{t("app.settings.rules.fieldPortalOn")}</option>
          <option value="">{t("app.settings.rules.portalHidden")}</option>
        </Select>
      </Field>
      <Toggle
        name="required"
        defaultChecked={field?.required ?? false}
        label={t("app.settings.rules.required")}
      />
      <div
        className="mt-auto flex items-center gap-2 border-t pt-3"
        style={{ borderColor: "var(--line)" }}
      >
        {field && (
          <button
            type="submit"
            formAction={deleteField}
            className="ohd-hover-edge-ink rounded-md border font-medium"
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
          className="rounded-md font-semibold"
          style={{ color: "var(--on-brand)", height: 34, padding: "0 16px", fontSize: 13, background: "var(--acc)" }}
        >
          {t("app.settings.rules.save")}
        </button>
      </div>
    </form>
  );
}
