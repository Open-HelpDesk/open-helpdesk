/**
 * SD-A9 — the service desk configuration (spec 19, ST-16), eight tabs.
 *
 * One URL per tab (`?tab=`), rendered on the server: each tab loads only its
 * own data. Core tabs live next to this file; the ee/ ones (connectors,
 * budgets, joiners and leavers, and the ee blocks inside core tabs) come from
 * ee/web and show a locked state when the workspace lacks the entitlement —
 * never a 404, never a fake screen.
 *
 * Administrators only: the settings decide who approves what, which is not a
 * decision an agent takes for the workspace.
 */
import Link from "next/link";
import { getDeskConfig } from "@/lib/desk";
import { entitlementsFor } from "@/lib/entitlements";
import { isManager, requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { CfgProvider, SavedIndicator } from "@/components/desk/config/primitives";
import { saveDeskConfig } from "./actions";
import { CONFIG_TABS, type ConfigTab } from "./tabs";
import { DirectoryTab } from "./directory-tab";
import { ApprovalsTab } from "./approvals-tab";
import { AccessTab } from "./access-tab";
import { NotificationsTab } from "./notifications-tab";
import { ComplianceTab } from "./compliance-tab";
import ConnectorsTab from "@openhelpdesk/ee-web/desk/config/connectors-tab";
import BudgetsTab from "@openhelpdesk/ee-web/desk/config/budgets-tab";
import LifecycleTab from "@openhelpdesk/ee-web/desk/config/lifecycle-tab";

export default async function DeskConfigPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const { tab: raw } = await searchParams;
  const tab: ConfigTab = CONFIG_TABS.find((x) => x.key === raw)?.key ?? "dir";

  const header = (indicator: boolean) => (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <h1 style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 600, letterSpacing: "-.015em", color: "var(--ink)" }}>
          {t("desk.cfg.title")}
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 2 }}>{t("desk.cfg.subtitle")}</p>
      </div>
      {indicator && <SavedIndicator />}
    </div>
  );

  if (!isManager(agent.role)) {
    return (
      <Column>
        {header(false)}
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "22px 20px", fontSize: 13.5, color: "var(--ink-2)" }}>
          {t("desk.cfg.adminOnly")}
        </div>
      </Column>
    );
  }

  const ent = entitlementsFor(tenant);
  const config = await getDeskConfig(tenant.id);

  return (
    <CfgProvider key={tab} initial={config} save={saveDeskConfig}>
      <Column>
        {header(true)}
        <nav aria-label={t("desk.cfg.tabsLabel")} style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", overflowX: "auto" }}>
          {CONFIG_TABS.map((x) => {
            const on = x.key === tab;
            return (
              <Link
                key={x.key}
                href={`/app/desk/config?tab=${x.key}`}
                aria-current={on ? "page" : undefined}
                scroll={false}
                style={{
                  padding: "9px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  color: on ? "var(--ink)" : "var(--ink-3)",
                  boxShadow: `inset 0 -2px 0 ${on ? "var(--brand)" : "transparent"}`,
                }}
              >
                {t(x.label)}
              </Link>
            );
          })}
        </nav>
        {tab === "dir" && <DirectoryTab tenantId={tenant.id} ent={ent} />}
        {tab === "conn" && <ConnectorsTab tenantId={tenant.id} ent={ent} />}
        {tab === "appr" && <ApprovalsTab tenantId={tenant.id} ent={ent} />}
        {tab === "budget" && <BudgetsTab tenantId={tenant.id} ent={ent} />}
        {tab === "access" && <AccessTab tenantId={tenant.id} ent={ent} />}
        {tab === "notif" && <NotificationsTab />}
        {tab === "life" && <LifecycleTab tenantId={tenant.id} ent={ent} />}
        {tab === "audit" && <ComplianceTab ent={ent} />}
      </Column>
    </CfgProvider>
  );
}

function Column({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", minWidth: 0, flex: 1, overflow: "auto" }}>
      <div style={{ padding: "24px 28px 60px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 1040 }}>{children}</div>
    </div>
  );
}
