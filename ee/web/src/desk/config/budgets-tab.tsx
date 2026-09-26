/**
 * SD-A9 → Budgets (ee/, deskBudgets). A ceiling per department, and what a
 * request that would exceed it does: alert the manager, add a finance
 * approval, or block. Spend is computed from active grants × tier cost.
 */
import type { Entitlements } from "@openhelpdesk/config";
import { getEdition } from "@openhelpdesk/config";
import { getT } from "@/i18n/server";
import { loadPeopleOptions } from "@/lib/desk/config-data";
import { LockedScreen } from "@/components/settings-page";
import { loadBudgetRows } from "./data";
import { BudgetsPanel } from "./budgets-panel";
import { Ghost } from "./ghost";

export default async function BudgetsTab({ tenantId, ent }: { tenantId: string; ent: Entitlements }) {
  const t = await getT();
  if (!ent.deskBudgets) {
    return <LockedScreen title={t("desk.cfg.budget.lockedTitle")} text={t("desk.cfg.budget.lockedText")} ghost={<Ghost rows={5} />} variant={getEdition()} />;
  }
  const [rows, people] = await Promise.all([loadBudgetRows(tenantId), loadPeopleOptions(tenantId)]);
  return <BudgetsPanel rows={rows} people={people} />;
}
