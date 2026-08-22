"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, formFields, ticketFields, ticketForms } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { requireManager } from "../guard";

const FIELD_TYPES = ["text", "select", "multi_select", "date", "number", "checkbox"] as const;
type FieldType = (typeof FIELD_TYPES)[number];

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** ST-04 — Creating / editing a custom field (drawer). */
export async function saveField(formData: FormData) {
  const { tenant } = await requireManager();
  const fieldId = String(formData.get("fieldId") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 120);
  const typeRaw = String(formData.get("type") ?? "text");
  const type: FieldType = (FIELD_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as FieldType)
    : "text";
  const options = String(formData.get("options") ?? "")
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 50);
  const portalVisible = formData.get("portalVisible") === "on";
  const required = formData.get("required") === "on";
  if (!label) return;

  if (fieldId) {
    await db
      .update(ticketFields)
      .set({ label, type, options, portalVisible, required })
      .where(and(eq(ticketFields.tenantId, tenant.id), eq(ticketFields.id, fieldId)));
  } else {
    const existing = await db
      .select({ position: ticketFields.position })
      .from(ticketFields)
      .where(eq(ticketFields.tenantId, tenant.id));
    const position = existing.length > 0 ? Math.max(...existing.map((f) => f.position)) + 1 : 0;
    await db.insert(ticketFields).values({
      tenantId: tenant.id,
      key: slugify(label) || `champ_${position}`,
      label,
      type,
      options,
      portalVisible,
      required,
      position,
    });
  }

  revalidatePath("/app/settings/fields");
  redirect("/app/settings/fields?saved=1");
}

export async function deleteField(formData: FormData) {
  const { tenant } = await requireManager();
  const fieldId = String(formData.get("fieldId") ?? "");
  await db
    .delete(ticketFields)
    .where(and(eq(ticketFields.tenantId, tenant.id), eq(ticketFields.id, fieldId)));
  revalidatePath("/app/settings/fields");
  redirect("/app/settings/fields?saved=1");
}

/** Forms tab — adding a field with one click (the "Available fields" column). */
export async function addFieldToForm(formData: FormData) {
  const { tenant } = await requireManager();
  const formId = String(formData.get("formId") ?? "");
  const fieldId = String(formData.get("fieldId") ?? "");
  if (!formId || !fieldId) return;

  const [form] = await db
    .select({ id: ticketForms.id })
    .from(ticketForms)
    .where(and(eq(ticketForms.tenantId, tenant.id), eq(ticketForms.id, formId)));
  const [field] = await db
    .select({ id: ticketFields.id })
    .from(ticketFields)
    .where(and(eq(ticketFields.tenantId, tenant.id), eq(ticketFields.id, fieldId)));
  if (!form || !field) return;

  const existing = await db
    .select({ position: formFields.position })
    .from(formFields)
    .where(eq(formFields.formId, form.id));
  const position = existing.length > 0 ? Math.max(...existing.map((f) => f.position)) + 1 : 0;

  await db
    .insert(formFields)
    .values({ tenantId: tenant.id, formId: form.id, fieldId: field.id, position })
    .onConflictDoNothing();

  revalidatePath("/app/settings/fields");
}

export async function removeFieldFromForm(formData: FormData) {
  const { tenant } = await requireManager();
  const formId = String(formData.get("formId") ?? "");
  const fieldId = String(formData.get("fieldId") ?? "");
  await db
    .delete(formFields)
    .where(
      and(
        eq(formFields.tenantId, tenant.id),
        eq(formFields.formId, formId),
        eq(formFields.fieldId, fieldId),
      ),
    );
  revalidatePath("/app/settings/fields");
}

export async function createForm(formData: FormData) {
  const { tenant } = await requireManager();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return;
  const existing = await db
    .select({ position: ticketForms.position })
    .from(ticketForms)
    .where(eq(ticketForms.tenantId, tenant.id));
  const position = existing.length > 0 ? Math.max(...existing.map((f) => f.position)) + 1 : 0;
  const [form] = await db
    .insert(ticketForms)
    .values({ tenantId: tenant.id, name, position })
    .returning();
  revalidatePath("/app/settings/fields");
  redirect(`/app/settings/fields?tab=forms${form ? `&form=${form.id}` : ""}`);
}
