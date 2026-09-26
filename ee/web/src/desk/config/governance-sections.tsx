/**
 * SD-A9 → Approvals → privileged roles and separation of duties (ee/,
 * deskGovernance). Without the entitlement the two blocks stay on screen,
 * locked: hiding them would suggest the product cannot do it.
 */
import type { Entitlements } from "@openhelpdesk/config";
import { sodViolations } from "@openhelpdesk/ee-desk";
import { getT } from "@/i18n/server";
import { loadTiers } from "@/lib/desk/config-data";
import { ConfigSwitch, LockedNote, Panel, Row } from "@/components/desk/config/primitives";
import { loadSodRules } from "./data";
import { SodRules } from "./sod-rules";

export default async function GovernanceSections({ tenantId, ent }: { tenantId: string; ent: Entitlements }) {
  const t = await getT();
  if (!ent.deskGovernance) {
    return (
      <>
        <Panel title={t("desk.cfg.priv.title")} hint={t("desk.cfg.priv.hint")}>
          <LockedNote text={t("desk.cfg.priv.locked")} />
        </Panel>
        <Panel title={t("desk.cfg.sod.title")} hint={t("desk.cfg.sod.hint")}>
          <LockedNote text={t("desk.cfg.sod.locked")} />
        </Panel>
      </>
    );
  }
  const [tiers, rules, violations] = await Promise.all([loadTiers(tenantId), loadSodRules(tenantId), sodViolations(tenantId)]);
  const privileged = tiers.filter((x) => x.privileged);
  const people = new Set(violations.map((v) => v.personId)).size;
  return (
    <>
      <Panel title={t("desk.cfg.priv.title")} hint={t("desk.cfg.priv.hint")}>
        <Row label={t("desk.cfg.priv.second")} hint={t("desk.cfg.priv.secondHint")}>
          <ConfigSwitch section="approvals" field="privilegedSecondApprover" label={t("desk.cfg.priv.second")} />
        </Row>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 18px", alignItems: "center" }}>
          {privileged.length === 0 && <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.cfg.priv.none")}</span>}
          {privileged.map((x) => (
            <span key={x.id} style={{ padding: "4px 10px", borderRadius: 999, background: "var(--dang-t)", color: "var(--dang)", fontSize: 12, fontWeight: 600 }}>
              {x.app} · {x.tier}
            </span>
          ))}
        </div>
      </Panel>
      <SodRules rules={rules} tiers={tiers} violatingPeople={people} />
    </>
  );
}
