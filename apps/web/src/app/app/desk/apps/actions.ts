"use server";

/**
 * SD-A2 — catalogue configuration. Owners and admins only; every change goes
 * through the desk API, which journals it (the screen promises "every change
 * is logged", and this is what keeps that true).
 */
import { revalidatePath } from "next/cache";
import { createApp, setAutoGroups, setTiers, updateApp, type AppInput, type TierInput } from "@/lib/desk";
import { attempt, requireDeskAgent, type DeskActionResult } from "@/lib/desk/it-guard";

function refresh() {
  revalidatePath("/app/desk", "layout");
}

export async function createAppAction(input: { name: string; category: string }): Promise<DeskActionResult<string>> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent({ manage: true });
    const id = await createApp(
      tenant.id,
      { name: input.name.trim(), category: input.category.trim(), approvalLevels: 1, visible: false },
      actor,
    );
    refresh();
    return id;
  });
}

export async function updateAppAction(appId: string, patch: Partial<AppInput>): Promise<DeskActionResult> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent({ manage: true });
    // The SCIM token is write-only: an empty value means "keep the saved one".
    const clean = { ...patch };
    if ("scimToken" in clean && !clean.scimToken) delete clean.scimToken;
    await updateApp(tenant.id, appId, clean, actor);
    refresh();
    return undefined;
  });
}

export async function setTiersAction(appId: string, tiers: TierInput[]): Promise<DeskActionResult> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent({ manage: true });
    await setTiers(tenant.id, appId, tiers, actor);
    refresh();
    return undefined;
  });
}

export async function setAutoGroupsAction(appId: string, groupIds: string[]): Promise<DeskActionResult> {
  return attempt(async () => {
    const { tenant, actor } = await requireDeskAgent({ manage: true });
    await setAutoGroups(tenant.id, appId, groupIds, actor);
    refresh();
    return undefined;
  });
}
