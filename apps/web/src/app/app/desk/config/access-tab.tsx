/**
 * SD-A9 → Access and reviews. Temporary access (core): default duration,
 * reminder, revocation, and the list of what expires. Review campaigns
 * (ee/, deskAccessReviews).
 */
import type { Entitlements } from "@openhelpdesk/config";
import { getT } from "@/i18n/server";
import { loadTemporaryGrants } from "@/lib/desk/config-data";
import { ConfigSeg, ConfigSwitch, Panel, Pill, Row } from "@/components/desk/config/primitives";
import { AppIcon } from "@/components/desk/app-icon";
import ReviewsSection from "@openhelpdesk/ee-web/desk/config/reviews-section";

export async function AccessTab({ tenantId, ent }: { tenantId: string; ent: Entitlements }) {
  const t = await getT();
  const grants = await loadTemporaryGrants(tenantId);
  const todayIso = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title={t("desk.cfg.access.tempTitle")}>
        <Row label={t("desk.cfg.access.default")} hint={t("desk.cfg.access.defaultHint")}>
          <ConfigSeg
            section="access"
            field="defaultTemporaryDays"
            label={t("desk.cfg.access.default")}
            options={[30, 90, 180].map((d) => ({ value: d as 30 | 90 | 180, label: t("desk.cfg.days", { count: d }) }))}
          />
        </Row>
        <Row label={t("desk.cfg.access.reminder")} hint={t("desk.cfg.access.reminderHint")}>
          <ConfigSeg
            section="access"
            field="expiryReminderDays"
            label={t("desk.cfg.access.reminder")}
            options={[3, 7, 14].map((d) => ({ value: d as 3 | 7 | 14, label: t("desk.cfg.days", { count: d }) }))}
          />
        </Row>
        <Row label={t("desk.cfg.access.revoke")} hint={t("desk.cfg.access.revokeHint")}>
          <ConfigSwitch section="access" field="revokeOnExpiry" label={t("desk.cfg.access.revoke")} />
        </Row>
        {grants.length === 0 && <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.cfg.access.tempEmpty")}</div>}
        {grants.map((g) => {
          const overdue = g.expiresOn < todayIso;
          return (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderBottom: "1px solid var(--line-2)" }}>
              <AppIcon name={g.app} iconKey={g.iconKey} color={g.color} size={26} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>
                {g.person} · {g.app} <span style={{ fontWeight: 450, color: "var(--ink-3)" }}>· {g.tier}</span>
              </span>
              <Pill tone={overdue ? "dang" : g.expiresOn <= soon ? "wait" : "neutral"}>
                {t("desk.cfg.access.until", { date: t.fmt.dateShort(new Date(`${g.expiresOn}T12:00:00Z`)) })}
              </Pill>
            </div>
          );
        })}
      </Panel>

      <ReviewsSection tenantId={tenantId} ent={ent} />
    </div>
  );
}
