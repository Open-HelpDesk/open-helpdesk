import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { db, formFields, ticketFields, ticketForms } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { FIELD_TYPE_LABELS } from "@/lib/rule-labels";
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
/** Libellés longs de la table ST-04 (« Liste déroulante ») — la composition utilise « Liste ». */
const TYPE_LABELS_LONG: Record<string, string> = {
  ...FIELD_TYPE_LABELS,
  select: "Liste déroulante",
};

type FieldRow = typeof ticketFields.$inferSelect;

/**
 * ST-04 — Champs & formulaires (1100 px). Onglet Champs : table
 * `minmax(200px,1.4fr) 170px 110px 110px 120px` + drawer 420 px. Onglet Formulaires :
 * 3 colonnes auto-fit minmax(260px,1fr) — champs disponibles / composition / aperçu portail.
 */
export default async function FieldsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; form?: string; saved?: string }>;
}) {
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
    { label: "Champs", href: "/app/settings/fields", active: activeTab === "fields" },
    { label: "Formulaires", href: "/app/settings/fields?tab=forms", active: activeTab === "forms" },
  ];

  return (
    <PageShell maxWidth={1100}>
      <PageHeader
        title="Champs & formulaires"
        subtitle="Champs personnalisés et composition des formulaires de ticket."
        tabs={tabs}
      />

      {saved === "1" && <p style={{ fontSize: 12.5, color: "var(--ok)" }}>✓ Enregistré</p>}

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
              <span>Champ</span>
              <span>Type</span>
              <span>Portail</span>
              <span>Requis</span>
              <span className="text-right">Formulaires</span>
            </div>
            {fields.length === 0 && (
              <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                Aucun champ personnalisé. Créez le premier — liste, texte, date…
              </p>
            )}
            {fields.map((f) => (
              <div
                key={f.id}
                className="st-row grid items-center border-b"
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
                    title="Modifier un champ"
                    trigger={<>{f.label}</>}
                    triggerClassName="min-w-0 truncate text-left"
                    triggerStyle={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}
                  >
                    <FieldForm field={f} />
                  </Drawer>
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {TYPE_LABELS_LONG[f.type] ?? f.type}
                </span>
                <span>
                  {f.portalVisible ? (
                    <StatusPill tone="ok">Visible</StatusPill>
                  ) : (
                    <StatusPill tone="closed">Masqué</StatusPill>
                  )}
                </span>
                <span style={{ fontSize: 12.5, color: f.required ? "var(--dang)" : "var(--ink-3)" }}>
                  {f.required ? "Requis" : "—"}
                </span>
                <span className="text-right tabular-nums" style={{ color: "var(--ink-2)" }}>
                  {formCountByField.get(f.id) ?? 0}
                </span>
              </div>
            ))}
          </div>

          <Drawer
            title="Créer un champ"
            trigger={<>+ Créer un champ</>}
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
            <FieldForm />
          </Drawer>
        </div>
      ) : (
        <>
          {/* Sélecteur de formulaire + création */}
          <div className="flex flex-wrap items-center gap-2">
            {forms.map((f) => {
              const active = selectedForm?.id === f.id;
              return (
                <Link
                  key={f.id}
                  href={`/app/settings/fields?tab=forms&form=${f.id}`}
                  className="rounded-full border font-medium"
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
                placeholder="Nom du formulaire"
                style={{ width: 180, height: 32, padding: "0 11px", fontSize: 12.5 }}
              />
              <button
                type="submit"
                className="rounded-md border font-semibold"
                style={{
                  height: 32,
                  padding: "0 13px",
                  fontSize: 12.5,
                  borderColor: "var(--line)",
                  background: "var(--panel)",
                  color: "var(--ink-2)",
                }}
              >
                + Créer un formulaire
              </button>
            </form>
          </div>

          {!selectedForm ? (
            <div
              className="rounded-[10px] border"
              style={{ background: "var(--panel)", borderColor: "var(--line)", padding: 15 }}
            >
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Aucun formulaire. Créez le premier pour composer votre portail.
              </p>
            </div>
          ) : (
            <div
              className="st-rise grid items-start"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}
            >
              {/* Colonne 1 — champs disponibles */}
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
                  Champs disponibles
                </div>
                <div className="flex flex-col" style={{ padding: 9, gap: 5 }}>
                  {availableFields.length === 0 && (
                    <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                      Tous les champs sont déjà dans ce formulaire.
                    </p>
                  )}
                  {availableFields.map((f) => (
                    <form key={f.id} action={addFieldToForm}>
                      <input type="hidden" name="formId" value={selectedForm.id} />
                      <input type="hidden" name="fieldId" value={f.id} />
                      <button
                        type="submit"
                        title="Ajouter au formulaire"
                        className="flex w-full items-center rounded-[7px] border text-left"
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
                          {FIELD_TYPE_LABELS[f.type] ?? f.type}
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </div>

              {/* Colonne 2 — composition */}
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
                  Formulaire « {selectedForm.name} »
                </div>
                <div className="flex flex-col" style={{ padding: 9, gap: 5 }}>
                  <ComposedRow label="Sujet" type="Texte" required />
                  <ComposedRow label="Description" type="Texte long" required />
                  {composedFields.map((f) => (
                    <ComposedRow
                      key={f.id}
                      label={f.label}
                      type={FIELD_TYPE_LABELS[f.type] ?? f.type}
                      required={f.required}
                      remove={
                        <form action={removeFieldFromForm}>
                          <input type="hidden" name="formId" value={selectedForm.id} />
                          <input type="hidden" name="fieldId" value={f.id} />
                          <button title="Retirer du formulaire" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                            ✕
                          </button>
                        </form>
                      }
                    />
                  ))}
                  <ComposedRow label="Pièces jointes" type="Fichier" />
                </div>
              </div>

              {/* Colonne 3 — aperçu portail */}
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
                  Aperçu portail
                </div>
                <div className="flex flex-col" style={{ padding: 16, gap: 11 }}>
                  <PreviewField label="Sujet" height={36} />
                  <PreviewField label="Description" height={72} />
                  {composedFields.map((f) => (
                    <PreviewField key={f.id} label={f.label} height={36} />
                  ))}
                  <span
                    className="flex items-center justify-center font-semibold text-white"
                    style={{ height: 40, borderRadius: 8, fontSize: 13.5, background: "var(--acc)" }}
                  >
                    Envoyer
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

/** Ligne de la composition — pastille « Requis » 10.5/700 sur --dang-t. */
function ComposedRow({
  label,
  type,
  required,
  remove,
}: {
  label: string;
  type: string;
  required?: boolean;
  remove?: React.ReactNode;
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
          Requis
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

/** Drawer création/édition d'un champ (420 px) — types FR, options une par ligne, portail. */
function FieldForm({ field }: { field?: FieldRow }) {
  const control = { minHeight: 36, padding: "7px 11px", fontSize: 13.5 } as const;
  return (
    <form action={saveField} className="flex h-full flex-col" style={{ gap: 14 }}>
      {field && <input type="hidden" name="fieldId" value={field.id} />}
      <Field label="Nom du champ">
        <TextInput
          name="label"
          required
          defaultValue={field?.label ?? ""}
          placeholder="Numéro de commande"
          style={control}
        />
      </Field>
      <Field label="Type">
        <Select name="type" defaultValue={field?.type ?? "text"} style={control}>
          {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Options">
        <textarea
          name="options"
          rows={3}
          placeholder="Une option par ligne"
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
        label="Visibilité portail"
        hint="Les champs masqués restent visibles des agents uniquement."
      >
        <Select
          name="portalVisible"
          defaultValue={field?.portalVisible ? "on" : ""}
          style={control}
        >
          <option value="on">Visible et modifiable</option>
          <option value="">Masqué</option>
        </Select>
      </Field>
      <Toggle name="required" defaultChecked={field?.required ?? false} label="Requis" />
      <div
        className="mt-auto flex items-center gap-2 border-t pt-3"
        style={{ borderColor: "var(--line)" }}
      >
        {field && (
          <button
            type="submit"
            formAction={deleteField}
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
