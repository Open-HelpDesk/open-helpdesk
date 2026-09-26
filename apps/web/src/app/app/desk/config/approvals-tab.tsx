/**
 * SD-A9 → Approvals. The delays of the circuit (core), privileged roles and
 * separation of duties (ee/, deskGovernance), and the delegations in force.
 */
import type { Entitlements } from "@openhelpdesk/config";
import { getT } from "@/i18n/server";
import { loadDelegations, loadPeopleOptions } from "@/lib/desk/config-data";
import { ConfigSeg, Panel, Row } from "@/components/desk/config/primitives";
import { DelegationsPanel } from "@/components/desk/config/delegations-panel";
import GovernanceSections from "@openhelpdesk/ee-web/desk/config/governance-sections";

export async function ApprovalsTab({ tenantId, ent }: { tenantId: string; ent: Entitlements }) {
  const t = await getT();
  const [delegations, people] = await Promise.all([loadDelegations(tenantId), loadPeopleOptions(tenantId)]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title={t("desk.cfg.appr.delaysTitle")} hint={t("desk.cfg.appr.delaysHint")}>
        <Row label={t("desk.cfg.appr.remind")} hint={t("desk.cfg.appr.remindHint")}>
          <ConfigSeg
            section="approvals"
            field="remindAfterHours"
            label={t("desk.cfg.appr.remind")}
            options={[
              { value: 4, label: t("desk.cfg.hours", { count: 4 }) },
              { value: 24, label: t("desk.cfg.hours", { count: 24 }) },
            ]}
          />
        </Row>
        <Row label={t("desk.cfg.appr.escalate")} hint={t("desk.cfg.appr.escalateHint")}>
          <ConfigSeg
            section="approvals"
            field="escalateAfterHours"
            label={t("desk.cfg.appr.escalate")}
            options={[24, 48, 72].map((h) => ({ value: h as 24 | 48 | 72, label: t("desk.cfg.hours", { count: h }) }))}
          />
        </Row>
        <Row label={t("desk.cfg.appr.backup")} hint={t("desk.cfg.appr.backupHint")} last>
          <ConfigSeg
            section="approvals"
            field="whenAbsent"
            label={t("desk.cfg.appr.backup")}
            options={[
              { value: "manager_of_manager", label: t("desk.cfg.appr.backup.managerOfManager") },
              { value: "app_owner", label: t("desk.cfg.appr.backup.appOwner") },
            ]}
          />
        </Row>
      </Panel>

      <GovernanceSections tenantId={tenantId} ent={ent} />

      <DelegationsPanel delegations={delegations} people={people} />
    </div>
  );
}
