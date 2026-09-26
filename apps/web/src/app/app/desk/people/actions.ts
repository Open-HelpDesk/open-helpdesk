"use server";

/**
 * SD-A5 — the directory as IT maintains it: a direct assignment (journalled
 * under the agent's name, doctrine rule 1), the CSV import and a manual entry.
 */
import { revalidatePath } from "next/cache";
import { directGrant, importPeopleCsv, upsertPerson, type CsvImportReport, type PersonInput } from "@/lib/desk";
import { attempt, requireDeskAgent, type DeskActionResult } from "@/lib/desk/it-guard";

function refresh() {
  revalidatePath("/app/desk", "layout");
}

export async function directGrantAction(
  personId: string,
  appId: string,
  tierId: string,
  durationDays: number | null,
): Promise<DeskActionResult<string>> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent();
    const id = await directGrant(tenant.id, personId, appId, tierId, durationDays, actor);
    refresh();
    return id;
  });
}

/** 2 MB of CSV is some twenty thousand people — more is a mistake, not a directory. */
const MAX_CSV = 2_000_000;

export async function importPeopleAction(csv: string): Promise<DeskActionResult<CsvImportReport>> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent();
    const report = await importPeopleCsv(tenant.id, csv.slice(0, MAX_CSV), actor);
    refresh();
    return report;
  });
}

export async function addPersonAction(input: PersonInput): Promise<DeskActionResult<string>> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent();
    const clean: PersonInput = {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      title: input.title?.trim() || null,
      department: input.department?.trim() || null,
      managerEmail: input.managerEmail?.trim().toLowerCase() || null,
      startsOn: input.startsOn || null,
      leavesOn: input.leavesOn || null,
      source: "manual",
    };
    const { personId } = await upsertPerson(tenant.id, clean, actor);
    refresh();
    return personId;
  });
}
