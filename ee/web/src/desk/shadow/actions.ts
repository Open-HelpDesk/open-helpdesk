"use server";

/** SD-A8 — Add to catalogue / Block / Ignore a shadow IT finding. */
import { revalidatePath } from "next/cache";
import "@/lib/desk";
import { setShadowStatus } from "@openhelpdesk/ee-desk";
import { deskAction } from "../shared/server";

export async function setShadowStatusAction(findingId: string, status: "added" | "blocked" | "ignored") {
  const safe = status === "added" || status === "blocked" ? status : "ignored";
  return deskAction("deskShadowIt", { managerOnly: safe === "blocked" }, async ({ tenant, actor }) => {
    await setShadowStatus(tenant.id, findingId, safe, actor);
    revalidatePath("/app/desk/shadow");
    return { status: safe };
  });
}
