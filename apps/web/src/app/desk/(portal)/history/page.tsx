import { redirect } from "next/navigation";
import { decisionHistory } from "@/lib/desk/portal-data";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/en";
import { avatarTone, initialsOf, stateLabel, stateTone } from "@/components/desk/portal/format";
import { requireEmployee } from "../../session";

const VIA: Record<string, MessageKey> = {
  portal: "desk.portal.via.portal",
  web: "desk.portal.via.web",
  slack: "desk.portal.via.slack",
  teams: "desk.portal.via.teams",
  email: "desk.portal.via.email",
  api: "desk.portal.via.api",
  rule: "desk.portal.via.rule",
};

/** SD-M2 — History (`/desk/history`): every decision of this approver, read-only. */
export default async function DeskHistoryPage() {
  const viewer = await requireEmployee();
  if (!viewer.isApprover) redirect("/desk");
  const t = await getT();
  const rows = await decisionHistory(viewer.tenantId, viewer.person.id);

  return (
    <div className="sd-rise flex flex-col gap-[22px]">
      <div>
        <h1 className="sd-title text-[28px] max-sm:text-[23px]">{t("desk.portal.history.title")}</h1>
        <p className="mt-1 text-[14.5px]" style={{ color: "var(--ink-2)" }}>
          {t("desk.portal.history.intro")}
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-[14px] p-[18px] text-[13.5px]" style={{ background: "var(--panel)", border: "1px dashed var(--line)", color: "var(--ink-3)" }}>
          {t("desk.portal.history.empty")}
        </div>
      ) : (
        <div className="sd-card overflow-hidden">
          {rows.map((r, i) => {
            const tone = avatarTone(r.requesterName);
            const st = stateTone(r.state);
            const via = r.via && VIA[r.via] ? t(VIA[r.via]!) : null;
            const decided = r.decidedAt ? t.fmt.messageTime(new Date(r.decidedAt)) : "";
            return (
              <div
                key={r.approvalId}
                className="flex flex-wrap items-center gap-3 px-4 py-[13px]"
                style={{ borderTop: i ? "1px solid var(--line-2)" : undefined }}
              >
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-bold" style={{ background: tone.bg, color: tone.c }}>
                  {initialsOf(r.requesterName)}
                </span>
                <div className="min-w-[180px] flex-1">
                  <div className="text-[14px] font-semibold">{r.requesterName}</div>
                  <div className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                    {r.appName} · {r.tierName}
                  </div>
                  {r.comment && (
                    <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      {t("desk.portal.quote", { text: r.comment })}
                    </div>
                  )}
                </div>
                <span className="sd-mono text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  #{r.ticketNumber}
                </span>
                <span className="min-w-[150px] text-[12px]" style={{ color: "var(--ink-3)" }}>
                  <span className="block font-semibold" style={{ color: r.decision === "approved" ? "var(--ok)" : "var(--dang)" }}>
                    {r.decision === "approved" ? t("desk.portal.history.approved") : t("desk.portal.history.refused")}
                  </span>
                  {via ? t("desk.portal.history.whenVia", { when: decided, via }) : decided}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold"
                  style={{ background: st.bg, color: st.c }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.c }} />
                  {stateLabel(t, r.state)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
