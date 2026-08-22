/**
 * Sending an agent's invitation email (ST-02, AG-02) — in the tenant's language,
 * through its email transport (tenant → instance → console cascade).
 */
import { headers } from "next/headers";
import { sendTenantEmail } from "@openhelpdesk/mail";
import type { tenants } from "@openhelpdesk/db";
import { getT } from "@/i18n/server";
import { inviteToken } from "@/lib/invite-token";

type TenantRow = typeof tenants.$inferSelect;

export async function sendAgentInvite(
  tenant: Pick<TenantRow, "id" | "name">,
  invited: { id: string; email: string },
): Promise<void> {
  const t = await getT();
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const url = `${proto}://${host}/invite/${inviteToken(tenant.id, invited.id)}`;

  await sendTenantEmail({
    tenantId: tenant.id,
    to: invited.email,
    subject: t("app.settings.workspace.inviteEmailSubject", { workspace: tenant.name }),
    text: t("app.settings.workspace.inviteEmailBody", { workspace: tenant.name, url }),
    kind: "other",
    immediate: true,
  });
}
