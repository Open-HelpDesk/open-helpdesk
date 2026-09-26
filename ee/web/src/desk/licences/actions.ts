"use server";

/** SD-A3 — the one write of the licences screen: "Libérer les inactifs". */
import { revalidatePath } from "next/cache";
import "@/lib/desk";
import { reclaimInactiveSeats } from "@openhelpdesk/ee-desk";
import { deskAction } from "../shared/server";

export async function reclaimAction(appId: string) {
  return deskAction("deskLicences", {}, async ({ tenant, actor }) => {
    const res = await reclaimInactiveSeats(tenant.id, appId, actor);
    revalidatePath("/app/desk/licences");
    return res;
  });
}
