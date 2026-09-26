import { portalCatalogue, portalSettings } from "@/lib/desk/portal-data";
import { firstName } from "@/i18n/format";
import { Catalogue } from "@/components/desk/portal/catalogue";
import { requireEmployee } from "../session";

/** SD-E1 — Catalogue (`/desk`). */
export default async function DeskCataloguePage() {
  const viewer = await requireEmployee();
  const [apps, settings] = await Promise.all([
    portalCatalogue(viewer.tenantId, viewer.person.id),
    portalSettings(viewer.tenantId),
  ]);
  return (
    <Catalogue
      firstName={firstName(viewer.person.name)}
      apps={apps}
      expiry={{
        reminderDays: settings.reminderDays,
        revokeOnExpiry: settings.revokeOnExpiry,
        defaultDays: settings.defaultTemporaryDays,
      }}
    />
  );
}
