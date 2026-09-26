/**
 * Declarative hardware inventory (SD-A7, core) and the two employee requests
 * that are plain tickets: "report a problem" and "request a new tool".
 */
import { and, eq } from "drizzle-orm";
import { hardwareAssets, people, type Tx } from "@openhelpdesk/db";
import type { CsvImportReport, HardwareInput } from "./api";
import { writeDeskAudit } from "./audit";
import { loadPerson } from "./circuit-db";
import { parseCsv } from "./csv";
import { DeskNotFoundError, DeskValidationError } from "./errors";
import { domainT } from "./i18n";
import { inTenant, isIsoDate, normEmail, requireEntitlement, tenantInfo } from "./internal";
import { createDeskTicket } from "./tickets";
import type { Actor } from "./types";

const STATUSES = ["assigned", "in_stock", "in_repair", "to_recover", "retired"] as const;
type HardwareStatus = (typeof STATUSES)[number];

function normStatus(v: string | undefined): HardwareStatus | null | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (STATUSES as readonly string[]).includes(s) ? (s as HardwareStatus) : null;
}

function checkDate(v: string | null | undefined, field: string): void {
  if (v && !isIsoDate(v)) throw new DeskValidationError("invalid_date", field);
}

async function upsertHardwareTx(tx: Tx, tenantId: string, input: HardwareInput & { id?: string }, actor: Actor): Promise<{ id: string; created: boolean }> {
  const tag = input.tag?.trim();
  if (!tag || !input.model?.trim() || !input.type?.trim()) throw new DeskValidationError("invalid_input");
  checkDate(input.warrantyEndsOn, "warrantyEndsOn");
  checkDate(input.purchasedOn, "purchasedOn");
  if (input.status && !(STATUSES as readonly string[]).includes(input.status)) throw new DeskValidationError("invalid_input", "status");
  let person: { id: string; name: string } | null = null;
  if (input.assignedPersonId) {
    const p = await loadPerson(tx, tenantId, input.assignedPersonId);
    person = { id: p.id, name: p.name };
  }

  let existing = input.id
    ? (await tx.select().from(hardwareAssets).where(and(eq(hardwareAssets.tenantId, tenantId), eq(hardwareAssets.id, input.id))))[0]
    : (await tx.select().from(hardwareAssets).where(and(eq(hardwareAssets.tenantId, tenantId), eq(hardwareAssets.tag, tag))))[0];
  if (input.id && !existing) throw new DeskNotFoundError("hardware");
  if (existing && existing.tag !== tag) {
    const [clash] = await tx.select({ id: hardwareAssets.id }).from(hardwareAssets).where(and(eq(hardwareAssets.tenantId, tenantId), eq(hardwareAssets.tag, tag)));
    if (clash) throw new DeskValidationError("duplicate_tag");
  }

  // An assignee without a status means "assigned"; unassigning an assigned device puts it back in stock.
  const status: HardwareStatus =
    input.status ?? (input.assignedPersonId ? "assigned" : existing?.status === "assigned" && input.assignedPersonId === null ? "in_stock" : (existing?.status ?? "in_stock"));
  const values = {
    tag,
    model: input.model.trim(),
    type: input.type.trim(),
    serial: input.serial ?? existing?.serial ?? null,
    assignedPersonId: input.assignedPersonId !== undefined ? input.assignedPersonId : (existing?.assignedPersonId ?? null),
    status,
    warrantyEndsOn: input.warrantyEndsOn !== undefined ? input.warrantyEndsOn : (existing?.warrantyEndsOn ?? null),
    purchasedOn: input.purchasedOn !== undefined ? input.purchasedOn : (existing?.purchasedOn ?? null),
    costCents: input.costCents !== undefined ? input.costCents : (existing?.costCents ?? null),
  };

  if (!existing) {
    const [row] = await tx.insert(hardwareAssets).values({ tenantId, ...values }).returning({ id: hardwareAssets.id });
    await writeDeskAudit(tx, tenantId, actor, "desk.hardware.created", { type: "hardware", id: row!.id }, { tag, model: values.model, status });
    if (person) await writeDeskAudit(tx, tenantId, actor, "desk.hardware.assigned", { type: "hardware", id: row!.id }, { tag, person: person.name });
    return { id: row!.id, created: true };
  }
  const changed = (Object.keys(values) as Array<keyof typeof values>).filter((k) => existing[k] !== values[k]);
  if (changed.length === 0) return { id: existing.id, created: false };
  await tx.update(hardwareAssets).set({ ...values, updatedAt: new Date() }).where(eq(hardwareAssets.id, existing.id));
  if (changed.includes("assignedPersonId")) {
    await writeDeskAudit(tx, tenantId, actor, "desk.hardware.assigned", { type: "hardware", id: existing.id }, { tag, person: person?.name ?? null }, { assignedPersonId: existing.assignedPersonId });
  }
  const others = changed.filter((k) => k !== "assignedPersonId");
  if (others.length) {
    await writeDeskAudit(
      tx,
      tenantId,
      actor,
      "desk.hardware.updated",
      { type: "hardware", id: existing.id },
      { tag, fields: others, ...Object.fromEntries(others.map((k) => [k, values[k]])) },
      Object.fromEntries(others.map((k) => [k, existing[k]])),
    );
  }
  return { id: existing.id, created: false };
}

export async function upsertHardware(tenantId: string, input: HardwareInput & { id?: string }, actor: Actor): Promise<string> {
  return inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk", "deskHardware");
    return (await upsertHardwareTx(tx, tenantId, input, actor)).id;
  });
}

export async function importHardwareCsv(tenantId: string, csv: string, actor: Actor): Promise<CsvImportReport> {
  return inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk", "deskHardware");
    const report: CsvImportReport = { created: 0, updated: 0, errors: [] };
    const { headers, rows } = parseCsv(csv);
    if (!["tag", "model", "type"].every((c) => headers.includes(c))) {
      report.errors.push({ line: 1, message: "missing_columns" });
      return report;
    }
    const seen = new Set<string>();
    for (const row of rows) {
      const v = row.values;
      const tag = v.tag ?? "";
      if (!tag) {
        report.errors.push({ line: row.line, message: "missing_tag" });
        continue;
      }
      if (seen.has(tag)) {
        report.errors.push({ line: row.line, message: "duplicate_in_file" });
        continue;
      }
      seen.add(tag);
      const status = normStatus(v.status);
      if (status === null) {
        report.errors.push({ line: row.line, message: "invalid_status" });
        continue;
      }
      try {
        const out = await tx.transaction(async (sp) => {
          let assignedPersonId: string | null | undefined = undefined;
          const email = normEmail(v.assigned_email ?? "");
          if (email) {
            const [p] = await sp.select({ id: people.id }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.email, email)));
            if (!p) throw new DeskValidationError("person_not_found");
            assignedPersonId = p.id;
          }
          return upsertHardwareTx(
            sp,
            tenantId,
            {
              tag,
              model: v.model ?? "",
              type: v.type ?? "",
              serial: v.serial || null,
              assignedPersonId,
              status,
              warrantyEndsOn: v.warranty_ends_on || undefined,
            },
            actor,
          );
        });
        if (out.created) report.created++;
        else report.updated++;
      } catch (err) {
        report.errors.push({ line: row.line, message: err instanceof DeskValidationError ? err.code : "invalid_input" });
      }
    }
    await writeDeskAudit(tx, tenantId, actor, "desk.hardware.imported", { type: "hardware", id: null }, { created: report.created, updated: report.updated, errors: report.errors.length });
    return report;
  });
}

/** "Report a problem": a ticket for IT, requested by the employee's contact. */
export async function reportHardwareProblem(tenantId: string, hardwareId: string, personId: string, message: string): Promise<{ ticketNumber: number }> {
  return inTenant(tenantId, async (tx, fx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk", "deskHardware");
    const [asset] = await tx.select().from(hardwareAssets).where(and(eq(hardwareAssets.tenantId, tenantId), eq(hardwareAssets.id, hardwareId)));
    if (!asset) throw new DeskNotFoundError("hardware");
    const person = await loadPerson(tx, tenantId, personId);
    if (!message?.trim()) throw new DeskValidationError("invalid_input", "message");
    const tenant = await tenantInfo(tx, tenantId);
    const t = domainT(tenant.locale);
    const ticket = await createDeskTicket(tx, fx, {
      tenantId,
      type: "hardware_problem",
      requesterContactId: person.contactId,
      subject: t("desk.domain.ticket.hardwareSubject", { model: asset.model, tag: asset.tag }),
      body: t("desk.domain.ticket.hardwareBody", { model: asset.model, tag: asset.tag, serial: asset.serial ?? "—", message: message.trim() }),
    });
    await writeDeskAudit(tx, tenantId, { kind: "person", personId }, "desk.hardware.problem_reported", { type: "hardware", id: asset.id }, {
      tag: asset.tag,
      person: person.name,
      ticketNumber: ticket.number,
    });
    return { ticketNumber: ticket.number };
  });
}

/** "Request a new tool": a regular ticket; IT evaluates security, GDPR and budget first. */
export async function requestNewTool(tenantId: string, personId: string, name: string, why: string): Promise<{ ticketNumber: number }> {
  return inTenant(tenantId, async (tx, fx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const person = await loadPerson(tx, tenantId, personId);
    if (!name?.trim()) throw new DeskValidationError("invalid_input", "name");
    const tenant = await tenantInfo(tx, tenantId);
    const t = domainT(tenant.locale);
    const ticket = await createDeskTicket(tx, fx, {
      tenantId,
      type: "tool_request",
      requesterContactId: person.contactId,
      subject: t("desk.domain.ticket.toolSubject", { name: name.trim() }),
      body: t("desk.domain.ticket.toolBody", { name: name.trim(), why: why?.trim() || "—" }),
    });
    await writeDeskAudit(tx, tenantId, { kind: "person", personId }, "desk.tool.requested", { type: "person", id: personId }, {
      name: name.trim(),
      person: person.name,
      ticketNumber: ticket.number,
    });
    return { ticketNumber: ticket.number };
  });
}
