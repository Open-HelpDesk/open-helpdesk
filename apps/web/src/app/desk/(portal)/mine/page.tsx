import { myAccess, portalCatalogue, portalSettings } from "@/lib/desk/portal-data";
import { MyAccessView } from "@/components/desk/portal/my-access";
import { requireEmployee } from "../../session";

/** SD-E2 — My access (`/desk/mine`). */
export default async function DeskMinePage() {
  const viewer = await requireEmployee();
  const [data, apps, settings] = await Promise.all([
    myAccess(viewer.tenantId, viewer.person.id),
    portalCatalogue(viewer.tenantId, viewer.person.id),
    portalSettings(viewer.tenantId),
  ]);
  return (
    <MyAccessView
      data={data}
      apps={apps}
      expiry={{
        reminderDays: settings.reminderDays,
        revokeOnExpiry: settings.revokeOnExpiry,
        defaultDays: settings.defaultTemporaryDays,
      }}
    />
  );
}
