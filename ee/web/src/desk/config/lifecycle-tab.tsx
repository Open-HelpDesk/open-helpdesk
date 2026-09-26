/**
 * SD-A9 → Joiners and leavers (ee/, deskLifecycle): how far ahead onboarding
 * prepares, the packs per department, and what an offboarding does.
 */
import Link from "next/link";
import type { Entitlements } from "@openhelpdesk/config";
import { getEdition } from "@openhelpdesk/config";
import { getT } from "@/i18n/server";
import { loadPacks } from "@/lib/desk/config-data";
import { LockedScreen } from "@/components/settings-page";
import { ConfigSeg, ConfigSwitch, Panel, Row } from "@/components/desk/config/primitives";
import { Ghost } from "./ghost";

export default async function LifecycleTab({ tenantId, ent }: { tenantId: string; ent: Entitlements }) {
  const t = await getT();
  if (!ent.deskLifecycle) {
    return <LockedScreen title={t("desk.cfg.life.lockedTitle")} text={t("desk.cfg.life.lockedText")} ghost={<Ghost rows={4} />} variant={getEdition()} />;
  }
  const packs = await loadPacks(tenantId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title={t("desk.cfg.life.onTitle")} hint={t("desk.cfg.life.onHint")}>
        <Row label={t("desk.cfg.life.lead")} hint={t("desk.cfg.life.leadHint")}>
          <ConfigSeg
            section="lifecycle"
            field="onboardingLeadDays"
            label={t("desk.cfg.life.lead")}
            options={[1, 3, 5].map((d) => ({ value: d as 1 | 3 | 5, label: t("desk.cfg.life.daysBefore", { count: d }) }))}
          />
        </Row>
        <Row label={t("desk.cfg.life.reserve")} hint={t("desk.cfg.life.reserveHint")}>
          <ConfigSwitch section="lifecycle" field="reserveHardware" label={t("desk.cfg.life.reserve")} />
        </Row>
        {packs.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", flexWrap: "wrap" }}>
            <span style={{ flex: 1, fontSize: 13, color: "var(--ink-3)" }}>{t("desk.cfg.life.noPacks")}</span>
            <Link href="/app/desk/lifecycle?tab=on" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand-2)" }}>
              {t("desk.cfg.life.createPack")}
            </Link>
          </div>
        )}
        {packs.map((p) => (
          <div key={p.department} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t("desk.cfg.life.pack", { department: p.department })}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{p.apps.length ? p.apps.join(", ") : t("desk.cfg.life.packEmpty")}</div>
            </div>
            <Link href={`/app/desk/lifecycle?tab=on&pack=${encodeURIComponent(p.department)}`} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand-2)" }}>
              {t("desk.cfg.life.editPack")}
            </Link>
          </div>
        ))}
      </Panel>

      <Panel title={t("desk.cfg.life.offTitle")} hint={t("desk.cfg.life.offHint")}>
        <Row label={t("desk.cfg.life.when")} hint={t("desk.cfg.life.whenHint")}>
          <ConfigSeg
            section="lifecycle"
            field="offboardingAt"
            label={t("desk.cfg.life.when")}
            options={[
              { value: "immediately", label: t("desk.cfg.life.when.immediately") },
              { value: "end_of_last_day", label: t("desk.cfg.life.when.endOfLastDay") },
              { value: "midnight", label: t("desk.cfg.life.when.midnight") },
            ]}
          />
        </Row>
        <Row label={t("desk.cfg.life.mail")} hint={t("desk.cfg.life.mailHint")}>
          <ConfigSeg
            section="lifecycle"
            field="mailForwardDays"
            label={t("desk.cfg.life.mail")}
            options={[30, 90, 180].map((d) => ({ value: d as 30 | 90 | 180, label: t("desk.cfg.days", { count: d }) }))}
          />
        </Row>
        <Row label={t("desk.cfg.life.drive")}>
          <ConfigSeg
            section="lifecycle"
            field="driveTransferTo"
            label={t("desk.cfg.life.drive")}
            options={[
              { value: "manager", label: t("desk.cfg.life.drive.manager") },
              { value: "manager_of_manager", label: t("desk.cfg.life.drive.managerOfManager") },
            ]}
          />
        </Row>
        <Row label={t("desk.cfg.life.label")} hint={t("desk.cfg.life.labelHint")} last>
          <ConfigSwitch section="lifecycle" field="returnLabel" label={t("desk.cfg.life.label")} />
        </Row>
      </Panel>
    </div>
  );
}
