"use server";

/** SD-A7 — the declarative hardware inventory: manual entry and CSV import. */
import { revalidatePath } from "next/cache";
import { importHardwareCsv, upsertHardware, type CsvImportReport, type HardwareInput } from "@/lib/desk";
import { attempt, requireDeskAgent, type DeskActionResult } from "@/lib/desk/it-guard";

function refresh() {
  revalidatePath("/app/desk", "layout");
}

export async function upsertHardwareAction(input: HardwareInput & { id?: string }): Promise<DeskActionResult<string>> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent({ entitlement: "deskHardware" });
    const id = await upsertHardware(
      tenant.id,
      {
        ...input,
        tag: input.tag.trim(),
        model: input.model.trim(),
        type: input.type.trim(),
        serial: input.serial?.trim() || null,
        assignedPersonId: input.assignedPersonId || null,
        warrantyEndsOn: input.warrantyEndsOn || null,
        purchasedOn: input.purchasedOn || null,
      },
      actor,
    );
    refresh();
    return id;
  });
}

export async function importHardwareAction(csv: string): Promise<DeskActionResult<CsvImportReport>> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent({ entitlement: "deskHardware" });
    const report = await importHardwareCsv(tenant.id, csv.slice(0, 2_000_000), actor);
    refresh();
    return report;
  });
}
