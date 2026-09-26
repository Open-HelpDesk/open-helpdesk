"use client";

/**
 * SD-M1 — Approvals: the list of what waits for this person (as manager,
 * owner, second approver, finance or delegate) and, beside it, everything
 * needed to decide in ten seconds — who asks, what, for how long, why, what it
 * costs against the department budget, how many colleagues already have it,
 * and who comes after.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { AppIcon } from "@/components/desk/app-icon";
import type { ApprovalItem } from "@/lib/desk/portal-data";
import type { BudgetCheck } from "@openhelpdesk/desk";
import { decideAction } from "@/app/desk/actions";
import { errorMessage } from "./request-drawer";
import { useToast } from "./shell";
import {
  CONNECTOR_BRAND,
  avatarTone,
  day,
  durationLabel,
  initialsOf,
  money,
  monthly,
  monthYear,
  stepLabel,
  type PortalT,
} from "./format";
import { firstName } from "@/i18n/format";

export type ApprovalWithBudget = ApprovalItem & { budget: BudgetCheck | null };

export function ApprovalsView({
  items,
  subtitle,
  budgetPeriod,
  absence,
}: {
  items: ApprovalWithBudget[];
  subtitle: string;
  budgetPeriod: "monthly" | "yearly";
  /** The "Absence and delegation" panel — rendered above the list. */
  absence?: React.ReactNode;
}) {
  const t = useT();
  const [selId, setSelId] = useState<string | null>(null);
  const sel = items.find((i) => i.approvalId === selId) ?? items[0] ?? null;

  return (
    <div className="sd-rise flex flex-col gap-[22px]">
      <div>
        <h1 className="sd-title text-[28px] max-sm:text-[23px]">{t("desk.portal.approvals.title")}</h1>
        <p className="mt-1 text-[14.5px]" style={{ color: "var(--ink-2)" }}>
          {subtitle}
        </p>
      </div>
      {absence}
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2">
          {items.map((r) => {
            const tone = avatarTone(r.requester.name);
            const on = sel?.approvalId === r.approvalId;
            return (
              <button
                key={r.approvalId}
                type="button"
                aria-current={on}
                onClick={() => {
                  setSelId(r.approvalId);
                  // On a phone the detail sits under the list: bring it into view.
                  if (window.matchMedia("(max-width: 900px)").matches) {
                    requestAnimationFrame(() =>
                      document.getElementById("sd-approval-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    );
                  }
                }}
                className="sd-row-select flex items-center gap-[11px] rounded-xl px-3.5 py-3"
              >
                <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full text-[11.5px] font-bold" style={{ background: tone.bg, color: tone.c }}>
                  {initialsOf(r.requester.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{r.requester.name}</span>
                  <span className="block truncate text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                    {r.app.name} · {r.tier.name}
                  </span>
                  {r.onBehalfOfName && (
                    <span className="block truncate text-[12px] font-medium" style={{ color: "var(--open)" }}>
                      {t("desk.portal.approvals.onBehalfShort", { name: r.onBehalfOfName })}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  {t.fmt.messageTime(new Date(r.createdAt))}
                </span>
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="rounded-[14px] px-[18px] py-[22px] text-[13.5px] leading-[1.5]" style={{ background: "var(--panel)", border: "1px dashed var(--line)", color: "var(--ink-3)" }}>
              {t("desk.portal.approvals.empty")}
            </div>
          )}
        </div>
        {sel && <Detail key={sel.approvalId} item={sel} budgetPeriod={budgetPeriod} />}
      </div>
    </div>
  );
}

function roleOf(t: PortalT, step: string): string {
  switch (step) {
    case "owner":
      return t("desk.portal.drawer.roleOwner");
    case "privileged":
      return t("desk.portal.drawer.rolePrivileged");
    case "finance":
      return t("desk.portal.drawer.roleFinance");
    default:
      return t("desk.portal.drawer.roleManagerOf");
  }
}

function Detail({ item, budgetPeriod }: { item: ApprovalWithBudget; budgetPeriod: "monthly" | "yearly" }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const who = item.requester;
  const tone = avatarTone(who.name);
  const first = firstName(who.name);
  const cost = item.tier.monthlyCostCents;
  const b = item.budget;

  const roleLine = [
    who.title,
    who.department,
    who.startsOn ? t("desk.portal.approvals.sinceDate", { date: monthYear(t, day(who.startsOn)) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const facts: Array<{ l: string; v: string }> = [{ l: t("desk.portal.approvals.cost"), v: monthly(t, cost) }];
  if (b) {
    facts.push({
      l: t("desk.portal.approvals.budgetAfter", { department: b.department }),
      v: t(budgetPeriod === "yearly" ? "desk.portal.approvals.budgetValueYearly" : "desk.portal.approvals.budgetValueMonthly", {
        after: money(t, b.spendCents + cost),
        budget: money(t, b.budgetCents),
      }),
    });
  }
  if (item.peers && who.department) {
    facts.push({
      l: t("desk.portal.approvals.peersLabel", { department: who.department }),
      v: t("desk.portal.approvals.peersValue", { count: item.peers.holding, total: item.peers.total }),
    });
  }

  let chain: string;
  if (item.after.length > 0) {
    chain = t("desk.portal.approvals.afterYou", {
      list: item.after
        .map((a) => t("desk.portal.approvals.afterItem", { name: a.name ?? "—", role: roleOf(t, a.step) }))
        .join(" → "),
    });
  } else if (item.merged.includes("owner") && item.merged.includes("manager")) {
    chain = t("desk.portal.approvals.mergedOwner");
  } else {
    chain =
      item.app.provisioning === "manual"
        ? t("desk.portal.approvals.onlyApproverManual")
        : t("desk.portal.approvals.onlyApproverAuto", { connector: CONNECTOR_BRAND[item.app.provisioning] });
  }

  const decide = (decision: "approved" | "refused") =>
    start(async () => {
      const res = await decideAction(item.approvalId, decision, comment);
      if (!res.ok) {
        toast(errorMessage(t, res.error));
        router.refresh();
        return;
      }
      if (decision === "refused") toast(t("desk.portal.toast.refused", { name: first }));
      else if (item.after.length > 0 && item.after[0]?.name)
        toast(t("desk.portal.toast.approvedNext", { name: first, next: item.after[0].name }));
      else toast(t("desk.portal.toast.approved", { name: first }));
      router.refresh();
    });

  return (
    <div id="sd-approval-detail" className="flex min-w-0 flex-[2_1_460px] scroll-mt-28 flex-col gap-4">
      <div className="sd-card flex flex-col gap-[18px] px-6 py-[22px] max-sm:px-4" style={{ borderRadius: 16 }}>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full text-[13px] font-bold" style={{ background: tone.bg, color: tone.c }}>
            {initialsOf(who.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">{who.name}</div>
            {roleLine && (
              <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                {roleLine}
              </div>
            )}
          </div>
          <span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold" style={{ background: "var(--sunk)", color: "var(--ink-2)" }}>
            {stepLabel(t, item.step, item.merged)}
          </span>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl p-4" style={{ background: "var(--sunk)" }}>
          <AppIcon name={item.app.name} iconKey={item.app.iconKey} logoUrl={item.app.logoUrl} color={item.app.color} size={46} />
          <div className="min-w-0">
            <div className="sd-title text-[19px] leading-tight">{t("desk.portal.appTier", { app: item.app.name, tier: item.tier.name })}</div>
            <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              <span className="sd-mono">#{item.ticketNumber}</span> · {t.fmt.messageTime(new Date(item.createdAt))} ·{" "}
              {t("desk.portal.approvals.duration", { duration: durationLabel(t, item.durationDays) })}
            </div>
          </div>
        </div>

        {item.onBehalfOfName && (
          <div className="rounded-[10px] px-3.5 py-[11px] text-[13px]" style={{ background: "var(--open-t)", color: "var(--open)" }}>
            {t("desk.portal.approvals.onBehalf", { name: item.onBehalfOfName })}
          </div>
        )}

        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          {facts.map((f) => (
            <div key={f.l} className="rounded-xl px-3.5 py-3" style={{ border: "1px solid var(--line)" }}>
              <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                {f.l}
              </div>
              <div className="mt-0.5 text-[14px] font-semibold">{f.v}</div>
            </div>
          ))}
        </div>
        {b && (
          <div className="-mt-2 text-[12px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
            {t(budgetPeriod === "yearly" ? "desk.portal.approvals.budgetSourceYearly" : "desk.portal.approvals.budgetSourceMonthly", {
              spend: money(t, b.spendCents),
              department: b.department,
              budget: money(t, b.budgetCents),
            })}
          </div>
        )}
        {b && b.overCents > 0 && (
          <div className="rounded-[10px] px-3.5 py-[11px] text-[13px] font-medium" style={{ background: "var(--wait-t)", color: "var(--wait)" }}>
            {t(budgetPeriod === "yearly" ? "desk.portal.approvals.overYearly" : "desk.portal.approvals.overMonthly", { amount: money(t, b.overCents) })}
          </div>
        )}

        <div>
          <div className="sd-eyebrow mb-1.5">{t("desk.portal.approvals.justification")}</div>
          <div className="text-[14.5px] leading-[1.55]">
            {item.justification ? t("desk.portal.quote", { text: item.justification }) : t("desk.portal.approvals.noJustification")}
          </div>
        </div>

        {item.tier.privileged && (
          <div className="rounded-[10px] px-3.5 py-[11px] text-[13px] font-medium" style={{ background: "var(--dang-t)", color: "var(--dang)" }}>
            {t("desk.portal.approvals.privileged")}
          </div>
        )}

        <div className="text-[13px]" style={{ color: "var(--ink-2)" }}>
          {chain}
        </div>

        <label className="block">
          <span className="sr-only">{t("desk.portal.approvals.commentLabel")}</span>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("desk.portal.approvals.commentPlaceholder", { name: first })}
            className="sd-input h-[42px] px-[13px] text-[13.5px]"
          />
        </label>
        <div className="flex justify-end gap-2.5">
          <button type="button" className="sd-btn sd-btn-danger" disabled={pending} onClick={() => decide("refused")}>
            {t("desk.portal.approvals.refuse")}
          </button>
          <button type="button" className="sd-btn sd-btn-primary px-5" disabled={pending} onClick={() => decide("approved")}>
            {t("desk.portal.approvals.approve")}
          </button>
        </div>
      </div>
    </div>
  );
}
