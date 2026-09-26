/**
 * SD-A9 → Directory → inbound SCIM 2.0 (ee/, deskConnectors).
 *
 * The endpoint the identity provider pushes to, and its bearer token: stored
 * as a hash, shown once at generation, then only by its last four characters.
 */
import type { Entitlements } from "@openhelpdesk/config";
import { getT } from "@/i18n/server";
import { LockedNote, Panel } from "@/components/desk/config/primitives";
import { ScimTokenRows } from "./scim-token";

export default async function ScimSection({
  ent,
  endpoint,
  suffix,
  createdAt,
}: {
  tenantId: string;
  ent: Entitlements;
  endpoint: string;
  suffix: string | null;
  createdAt: string | null;
}) {
  const t = await getT();
  return (
    <Panel title={t("desk.cfg.scim.title")} hint={t("desk.cfg.scim.hint")}>
      {ent.deskConnectors ? (
        <ScimTokenRows endpoint={endpoint} suffix={suffix} createdAt={createdAt} />
      ) : (
        <LockedNote text={t("desk.cfg.scim.locked")} />
      )}
    </Panel>
  );
}
