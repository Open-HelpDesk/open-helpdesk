import { redirect } from "next/navigation";
import { previewCircuit } from "@/lib/desk";
import { absencePanel, pendingApprovals, portalSettings } from "@/lib/desk/portal-data";
import { getT } from "@/i18n/server";
import { ApprovalsView, type ApprovalWithBudget } from "@/components/desk/portal/approvals";
import { AbsencePanel } from "@/components/desk/portal/absence-panel";
import { requireEmployee } from "../../session";

/**
 * SD-M1 — Approvals (`/desk/approvals`).
 *
 * The department budget shown to the approver is the budget check of the
 * circuit itself (`previewCircuit` for the requester) — the same figure the
 * rule acts on, never a second computation that could disagree with it. No
 * budget configured (or no budget module): the fact is simply absent.
 *
 * Above the list, "Absence and delegation": the approver hands their approvals
 * to a colleague while away. Approvals received as a delegate are in the list
 * (they are assigned to this person) and say on whose behalf.
 */
export default async function DeskApprovalsPage() {
  const viewer = await requireEmployee();
  if (!viewer.isApprover) redirect("/desk");
  const t = await getT();
  const [items, settings, absence] = await Promise.all([
    pendingApprovals(viewer.tenantId, viewer.person.id),
    portalSettings(viewer.tenantId),
    absencePanel(viewer.tenantId, viewer.person.id),
  ]);
  const withBudget: ApprovalWithBudget[] = await Promise.all(
    items.map(async (item) => {
      try {
        const p = await previewCircuit(viewer.tenantId, item.requester.id, item.app.id, item.tier.id);
        return { ...item, budget: p.budget };
      } catch {
        return { ...item, budget: null };
      }
    }),
  );
  const { person } = viewer;
  const subtitle =
    person.reportCount > 0 && person.department
      ? t("desk.portal.approvals.subtitleTeam", { department: person.department, count: person.reportCount })
      : t("desk.portal.approvals.subtitle");
  return (
    <ApprovalsView
      items={withBudget}
      subtitle={subtitle}
      budgetPeriod={settings.budgetPeriod}
      absence={
        <AbsencePanel data={absence} escalateAfterHours={settings.escalateAfterHours} whenAbsent={settings.whenAbsent} />
      }
    />
  );
}
