"use server";

/**
 * ST — WhatsApp channel settings.
 *
 * Two rules shape this file, and both are about secrets:
 *
 *  - **a blank field means "keep the stored value"**, never "erase it". A form
 *    that required the access token on every save would force an operator to
 *    re-type it to change a team, and re-typing a secret is how secrets end up
 *    in clipboards and screenshots.
 *  - **nothing is ever sent back to the browser in clear.** The screen shows a
 *    masked hint, which is enough to tell whether a token was replaced.
 */
import { revalidatePath } from "next/cache";
import { getWhatsappSettings, saveWhatsappSettings, setWhatsappActive } from "@openhelpdesk/whatsapp";
import { requireAgent } from "@/lib/session";

async function requireAdmin() {
  const { tenant, agent } = await requireAgent();
  if (agent.role !== "owner" && agent.role !== "admin") {
    throw new Error("forbidden");
  }
  return { tenant, agent };
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? "").trim();

export async function saveWhatsapp(formData: FormData) {
  const { tenant } = await requireAdmin();

  const phoneNumberId = text(formData, "phoneNumberId");
  if (!phoneNumberId) return;

  /*
   * Only the secrets actually typed are passed on. `undefined` tells the
   * settings layer to keep what is stored; an empty string would overwrite it
   * with nothing, which is the failure mode this distinction exists to avoid.
   */
  const accessToken = text(formData, "accessToken") || undefined;
  const appSecret = text(formData, "appSecret") || undefined;
  const verifyToken = text(formData, "verifyToken") || undefined;

  await saveWhatsappSettings({
    tenantId: tenant.id,
    phoneNumberId,
    displayPhone: text(formData, "displayPhone") || null,
    wabaId: text(formData, "wabaId") || null,
    defaultTeamId: text(formData, "defaultTeamId") || null,
    ...(accessToken ? { accessToken } : {}),
    ...(appSecret ? { appSecret } : {}),
    ...(verifyToken ? { verifyToken } : {}),
  });

  revalidatePath("/app/settings/whatsapp");
}

/**
 * Switches the channel on or off without touching its credentials.
 *
 * Turning it off is not the same as deleting the configuration: inbound events
 * are then refused with `inactive` rather than `unknown_number`, which is the
 * difference between "this workspace closed the channel" and "nobody owns this
 * number" when something has to be diagnosed.
 */
export async function toggleWhatsapp(formData: FormData) {
  const { tenant } = await requireAdmin();
  const settings = await getWhatsappSettings(tenant.id);
  if (!settings) return;
  await setWhatsappActive(tenant.id, formData.get("active") === "true");
  revalidatePath("/app/settings/whatsapp");
}
