import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { db, formFields, ticketFields, ticketForms } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { FIELD_TYPE_LABELS } from "@/lib/rule-labels";
import {
  Card,
  Field,
  GridHead,
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

type FieldRow = typeof ticketFields.$inferSelect;

/**
 * ST-04 — Champs & formulaires (1100 px). Onglet Champs : table réelle + drawer de
 * création/édition. Onglet Formulaires : 3 colonnes (champs disponibles /
 * composition avec intrinsèques Sujet, Description, Pièces jointes / aperçu portail).
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
  const availableFields = fields.filter(
    (f) => !selectedLinks.some((l) => l.fieldId === f.id),
  );

  const tabs = [
    { label: "Champs", href: "/app/settings/fields", active: activeTab === "fields" },
    { label: "Formulaires", href: "/app/settings/fields?tab=forms", active: activeTab === "forms" },
  ];

  return (
    <PageShell maxWidth={1100}>
      <PageHeader
        code="ST-04"
        title="Champs & formulaires"
        subtitle="Champs personnalisés et composition des formulaires de ticket."
        tabs={tabs}
        actions={
          activeTab === "fields" ? (
            <Drawer
              title="Nouveau champ"
              trigger={<>Nouveau champ</>}
              triggerClassName="rounded-md px-3.5 font-semibold text-white"
              triggerStyle={{ height: 32, fontSize: 13, background: "var(--acc)" }}
            >
              <FieldForm />
            </Drawer>
          ) : undefined
        }
      />

      {saved === "1" && <p style={{ fontSize: 12.5, color: "var(--ok)" }}>✓ Enregistré</p>}

      {activeTab === "fields" ? (
        <div
          className="overflow-x-auto rounded-[10px] border"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div style={{ minWidth: 760 }}>
            <GridHead
              template={FIELDS_GRID}
              columns={["Champ", "Type", "Portail", "Requis", "Formulaires"]}
            />
            {fields.length === 0 && (
              <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                Aucun champ personnalisé. Créez le premier — liste, texte, date…
              </p>
            )}
            {fields.map((f) => (
              <div
                key={f.id}
                className="grid items-center gap-3 border-t"
                style={{
                  gridTemplateColumns: FIELDS_GRID,
                  padding: "10px 14px",
                  borderColor: "var(--line-2)",
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Drawer
                    title={`Modifier « ${f.label} »`}
                    trigger={<>{f.label}</>}
                    triggerClassName="truncate text-left font-medium"
                    triggerStyle={{ fontSize: 13, color: "var(--ink)" }}
                  >
                    <FieldForm field={f} />
                  </Drawer>
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {FIELD_TYPE_LABELS[f.type] ?? f.type}
                </span>
                <span>
                  {f.portalVisible ? (
                    <StatusPill tone="ok">Visible</StatusPill>
                  ) : (
                    <StatusPill tone="closed">Masqué</StatusPill>
                  )}
                </span>
                <span style={{ fontSize: 12.5, color: f.required ? "var(--ink)" : "var(--ink-3)" }}>
                  {f.required ? "Requis" : "—"}
                </span>
                <span
                  className="text-right font-mono tabular-nums"
                  style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                >
                  {formCountByField.get(f.id) ?? 0}
                </span>
              </div>
            ))}
          </div>
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
                    color: active ? "var(--acc)" : "var(--ink)",
                  }}
                >
                  {f.name}
                </Link>
              );
            })}
            <span className="flex-1" />
            <form action={createForm} className="flex items-center gap-2">
              <TextInput name="name" required placeholder="Nom du formulaire" style={{ width: 180 }} />
              <button
                type="submit"
                className="rounded-md border px-3 font-medium"
                style={{
                  height: 30,
                  fontSize: 12.5,
                  borderColor: "var(--line)",
                  background: "var(--panel)",
                  color: "var(--ink)",
                }}
              >
                Nouveau formulaire
              </button>
            </form>
          </div>

          {!selectedForm ? (
            <Card>
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Aucun formulaire. Créez le premier pour composer votre portail.
              </p>
            </Card>
          ) : (
            <div className="grid items-start gap-4" style={{ gridTemplateColumns: "1fr 1.2fr 1.1fr" }}>
              {/* Colonne 1 — champs disponibles */}
              <Card title="Champs disponibles">
                <div className="flex flex-col gap-1.5">
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
                        className="flex w-full items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-left"
                        style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                      >
                        <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13, color: "var(--ink)" }}>
                          {f.label}
                        </span>
                        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                          {FIELD_TYPE_LABELS[f.type] ?? f.type}
                        </span>
                        <span style={{ color: "var(--acc)", fontWeight: 600 }}>+</span>
                      </button>
                    </form>
                  ))}
                </div>
              </Card>

              {/* Colonne 2 — composition */}
              <Card title={`Composition — ${selectedForm.name}`}>
                <div className="flex flex-col gap-1.5">
                  <IntrinsicRow label="Sujet" type="Texte" />
                  <IntrinsicRow label="Description" type="Texte long" />
                  {composedFields.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 rounded-md border px-2.5 py-1.5"
                      style={{ borderColor: "var(--line)", background: "var(--panel)" }}
                    >
                      <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13, color: "var(--ink)" }}>
                        {f.label}
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {FIELD_TYPE_LABELS[f.type] ?? f.type}
                        {f.required ? " · Requis" : ""}
                      </span>
                      <form action={removeFieldFromForm}>
                        <input type="hidden" name="formId" value={selectedForm.id} />
                        <input type="hidden" name="fieldId" value={f.id} />
                        <button title="Retirer" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                          ✕
                        </button>
                      </form>
                    </div>
                  ))}
                  <IntrinsicRow label="Pièces jointes" type="Fichier" optional />
                </div>
              </Card>

              {/* Colonne 3 — aperçu portail */}
              <Card title="Aperçu portail">
                <div
                  className="flex flex-col gap-3 rounded-lg border p-3"
                  style={{ borderColor: "var(--line-2)", background: "var(--canvas)" }}
                >
                  <PreviewField label="Sujet" required>
                    <span className="block rounded-md border px-2 py-1.5" style={{ borderColor: "var(--line)", background: "var(--bg)", height: 30 }} />
                  </PreviewField>
                  <PreviewField label="Description" required>
                    <span className="block rounded-md border px-2 py-1.5" style={{ borderColor: "var(--line)", background: "var(--bg)", height: 56 }} />
                  </PreviewField>
                  {composedFields.map((f) => (
                    <PreviewField key={f.id} label={f.label} required={f.required}>
                      {f.type === "checkbox" ? (
                        <span className="flex items-center gap-2" style={{ fontSize: 12 }}>
                          <span
                            className="inline-block rounded border"
                            style={{ width: 14, height: 14, borderColor: "var(--line)", background: "var(--bg)" }}
                          />
                          <span style={{ color: "var(--ink-3)" }}>Oui</span>
                        </span>
                      ) : (
                        <span
                          className="flex items-center justify-between rounded-md border px-2"
                          style={{
                            borderColor: "var(--line)",
                            background: "var(--bg)",
                            height: 30,
                            fontSize: 11.5,
                            color: "var(--ink-3)",
                          }}
                        >
                          <span>
                            {f.type === "select" || f.type === "multi_select"
                              ? (f.options as string[])[0] ?? "Choisir…"
                              : f.type === "date"
                                ? "jj/mm/aaaa"
                                : ""}
                          </span>
                          {(f.type === "select" || f.type === "multi_select") && <span>▾</span>}
                        </span>
                      )}
                    </PreviewField>
                  ))}
                  <PreviewField label="Pièces jointes">
                    <span
                      className="flex items-center justify-center rounded-md border border-dashed"
                      style={{
                        borderColor: "var(--line)",
                        height: 38,
                        fontSize: 11.5,
                        color: "var(--ink-3)",
                        background: "var(--bg)",
                      }}
                    >
                      Glissez vos fichiers ici
                    </span>
                  </PreviewField>
                  <span
                    className="inline-flex items-center justify-center self-start rounded-md px-3 font-semibold text-white"
                    style={{ height: 30, fontSize: 12.5, background: "var(--acc)" }}
                  >
                    Envoyer la demande
                  </span>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

/** Ligne intrinsèque de la composition (Sujet / Description / Pièces jointes). */
function IntrinsicRow({
  label,
  type,
  optional,
}: {
  label: string;
  type: string;
  optional?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-md border px-2.5 py-1.5"
      style={{ borderColor: "var(--line-2)", background: "var(--sunk)" }}
    >
      <span className="min-w-0 flex-1 truncate font-medium" style={{ fontSize: 13, color: "var(--ink-2)" }}>
        {label}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
        {type}
        {optional ? "" : " · Requis"}
      </span>
      <span title="Champ intrinsèque du formulaire" style={{ fontSize: 11, color: "var(--ink-3)" }}>
        intrinsèque
      </span>
    </div>
  );
}

function PreviewField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="flex flex-col gap-1">
      <span className="font-medium" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
        {label}
        {required && <span style={{ color: "var(--dang)" }}> *</span>}
      </span>
      {children}
    </span>
  );
}

/** Drawer création/édition d'un champ (types FR, options une par ligne, portail). */
function FieldForm({ field }: { field?: FieldRow }) {
  return (
    <form action={saveField} className="flex h-full flex-col gap-4">
      {field && <input type="hidden" name="fieldId" value={field.id} />}
      <Field label="Libellé">
        <TextInput name="label" required defaultValue={field?.label ?? ""} placeholder="Module concerné" />
      </Field>
      <Field label="Type">
        <Select name="type" defaultValue={field?.type ?? "text"}>
          {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Options" hint="Une option par ligne — pour les types Liste et Multi-sélection.">
        <textarea
          name="options"
          rows={4}
          defaultValue={((field?.options as string[]) ?? []).join("\n")}
          className="rounded-md border px-2.5 py-1.5 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
        />
      </Field>
      <Toggle
        name="portalVisible"
        defaultChecked={field?.portalVisible ?? false}
        label="Visible sur le portail"
        hint="Masqué, le champ reste disponible pour les agents et les automatisations."
      />
      <Toggle name="required" defaultChecked={field?.required ?? false} label="Requis" />
      <div
        className="mt-auto flex items-center gap-2 border-t pt-3"
        style={{ borderColor: "var(--line)" }}
      >
        {field && (
          <button
            type="submit"
            formAction={deleteField}
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
