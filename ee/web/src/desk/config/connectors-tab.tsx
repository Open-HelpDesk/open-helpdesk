/**
 * SD-A9 → Connectors (ee/, deskConnectors): Entra ID, Google Workspace,
 * outbound SCIM, and the apps with no connector (a task for IT).
 */
import type { Entitlements } from "@openhelpdesk/config";
import { getEdition } from "@openhelpdesk/config";
import { getT } from "@/i18n/server";
import { LockedScreen } from "@/components/settings-page";
import { loadConnectors } from "./data";
import { ConnectorsPanel } from "./connectors-panel";
import { Ghost } from "./ghost";

export default async function ConnectorsTab({ tenantId, ent }: { tenantId: string; ent: Entitlements }) {
  const t = await getT();
  if (!ent.deskConnectors) {
    return <LockedScreen title={t("desk.cfg.conn.lockedTitle")} text={t("desk.cfg.conn.lockedText")} ghost={<Ghost rows={4} />} variant={getEdition()} />;
  }
  const data = await loadConnectors(tenantId);
  return <ConnectorsPanel data={data} />;
}
