/**
 * SD-A4 — Access review (`/app/desk/reviews`, ee/ deskAccessReviews).
 *
 * The open campaign: its frameworks and due date, the global progress, the
 * reviewers with their own progress, and the selected reviewer's scope line
 * by line. Revocations decided here run when the campaign is closed, not
 * before — the screen says it next to the buttons.
 */
import Link from "next/link";
import { AppIcon } from "@/components/desk/app-icon";
import { getDeskConfig } from "@/lib/desk";
import { deskScreen } from "../shared/server";
import { DeskColumn, DeskLocked } from "../shared/screen";
import { Avatar, Bar, DeskToaster } from "../shared/ui";
import { CARD, GROUP_HEAD } from "../shared/styles";
import { daysUntil, isoDay, parseDay } from "../shared/format";
import { loadReview } from "./data";
import { CampaignActions, OpenCampaignForm, RemindButton, ScopeRows } from "./client";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewer?: string }>;
}) {
  const ctx = await deskScreen("deskAccessReviews");
  const { t } = ctx;
  const title = t("desk.ee.rev.title");
  if (!ctx.allowed) {
    return <DeskLocked t={t} title={title} lockedTitle="desk.ee.rev.lockedTitle" lockedText="desk.ee.rev.lockedText" />;
  }
  const { reviewer } = await searchParams;
  const [data, config] = await Promise.all([
    loadReview(ctx.tenant.id, reviewer),
    getDeskConfig(ctx.tenant.id).catch(() => null),
  ]);

  if (!data.campaign) {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return (
      <DeskToaster>
        <DeskColumn width={880}>
          <div>
            <h1 style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 600, letterSpacing: "-.015em" }}>{title}</h1>
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 2 }}>{t("desk.ee.rev.noneSubtitle")}</p>
          </div>
          {data.lastClosed && (
            <div style={{ ...CARD, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
              <span style={{ flex: 1, minWidth: 240, color: "var(--ink-2)" }}>
                {data.lastClosed.closedAt
                  ? t("desk.ee.rev.lastClosed", {
                      name: data.lastClosed.name,
                      date: t.fmt.dateLong(new Date(data.lastClosed.closedAt)),
                    })
                  : data.lastClosed.name}
              </span>
              <a className="ohd-link" style={{ fontWeight: 600 }} href={`/app/desk/reviews/${data.lastClosed.id}/evidence?format=pdf`}>
                {t("desk.ee.rev.evidencePdf")}
              </a>
              <a className="ohd-link" style={{ fontWeight: 600 }} href={`/app/desk/reviews/${data.lastClosed.id}/evidence?format=csv`}>
                {t("desk.ee.rev.evidenceCsv")}
              </a>
            </div>
          )}
          {ctx.manager ? (
            <OpenCampaignForm
              defaults={{
                name: t("desk.ee.rev.defaultName", { quarter: String(quarter), year: String(now.getFullYear()) }),
                dueOn: isoDay(21, now),
                scope: config?.reviews.scope ?? "sensitive",
                reviewers: config?.reviews.reviewers ?? "managers",
              }}
            />
          ) : (
            <div style={{ ...CARD, padding: "20px 22px", fontSize: 13.5, color: "var(--ink-2)" }}>{t("desk.ee.rev.noneAgent")}</div>
          )}
        </DeskColumn>
      </DeskToaster>
    );
  }

  const { campaign, selected, items } = data;
  const pct = campaign.total ? Math.round((campaign.done / campaign.total) * 100) : 0;
  const dueIn = daysUntil(campaign.dueOn);
  const open = campaign.state !== "closed";
  const unanswered = campaign.total - campaign.done;

  return (
    <DeskToaster>
      <DeskColumn>
        <div style={{ ...CARD, borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--brand-2)" }}>
                {t("desk.ee.rev.current")}
              </div>
              <h1 style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 600, letterSpacing: "-.015em", marginTop: 4 }}>
                {campaign.name}
              </h1>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {campaign.frameworks.map((f) => (
                  <span key={f} style={{ padding: "2px 9px", borderRadius: 999, background: "var(--sunk)", fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
                    {f}
                  </span>
                ))}
                <span
                  style={{
                    padding: "2px 9px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: dueIn < 0 ? "var(--dang-t)" : "var(--wait-t)",
                    color: dueIn < 0 ? "var(--dang)" : "var(--wait)",
                  }}
                >
                  {dueIn < 0
                    ? t("desk.ee.rev.overdue", { date: t.fmt.dateLong(parseDay(campaign.dueOn)) })
                    : t("desk.ee.rev.due", { date: t.fmt.dateLong(parseDay(campaign.dueOn)) })}
                </span>
              </div>
            </div>
            <CampaignActions
              reviewId={campaign.id}
              canClose={ctx.manager && open}
              counts={{ revoke: campaign.revokes, keep: campaign.done - campaign.revokes, unanswered }}
              unansweredRule={config?.reviews.whenUnanswered ?? "escalate"}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Bar pct={pct} height={8} />
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{t("desk.ee.rev.pct", { pct: String(pct) })}</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
              {t("desk.ee.rev.decisions", { done: t.fmt.number(campaign.done), count: campaign.total })}
            </span>
          </div>
        </div>

        {campaign.total === 0 ? (
          <div style={{ ...CARD, padding: "32px 24px", textAlign: "center", fontSize: 13.5, color: "var(--ink-2)" }}>
            {t("desk.ee.rev.emptyScope")}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start" }}>
            <div style={{ ...CARD, flex: "1 1 280px", minWidth: 0, overflow: "hidden" }}>
              <div style={GROUP_HEAD}>{t("desk.ee.rev.reviewers")}</div>
              {campaign.reviewers.map((r) => {
                const on = selected && r.personId === selected.personId;
                const done = r.done === r.total;
                return (
                  <div
                    key={r.personId ?? "none"}
                    className="ohd-row"
                    style={
                      {
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--line-2)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        "--row-bg": on ? "var(--brand-t)" : "transparent",
                      } as React.CSSProperties
                    }
                  >
                    <Link
                      href={`/app/desk/reviews?reviewer=${r.personId ?? "none"}`}
                      scroll={false}
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <Avatar name={r.name || "?"} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name || t("desk.ee.rev.noReviewer")}</div>
                        {r.department && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{r.department}</div>}
                      </div>
                      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                        {t("desk.ee.rev.ratio", { a: t.fmt.number(r.done), b: t.fmt.number(r.total) })}
                      </span>
                    </Link>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Bar pct={(r.done / Math.max(r.total, 1)) * 100} height={5} color={done ? "var(--brand)" : "var(--wait)"} />
                      {open && !done && r.personId && <RemindButton reviewId={campaign.id} personId={r.personId} name={r.name} />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ ...CARD, flex: "2 1 560px", minWidth: 0, overflowX: "auto" }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  minWidth: 640,
                }}
              >
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>
                  {selected?.department
                    ? t("desk.ee.rev.scopeOfTeam", { name: selected.name, team: selected.department })
                    : t("desk.ee.rev.scopeOf", { name: selected?.name || t("desk.ee.rev.noReviewer") })}
                </span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("desk.ee.rev.atClosing")}</span>
              </div>
              <ScopeRows
                open={open}
                items={items.map((it) => ({
                  ...it,
                  lastSeenLabel: it.lastSeenAt
                    ? t("desk.ee.rev.usedAgo", { when: t.fmt.relative(new Date(it.lastSeenAt)) })
                    : t("desk.ee.rev.usedUnknown"),
                  signalLabel:
                    it.signal?.kind === "leaving"
                      ? t("desk.ee.rev.signalLeaving", { date: t.fmt.dateShort(parseDay(it.signal.on)) })
                      : it.signal?.kind === "unused"
                        ? t("desk.ee.rev.signalUnused", { count: it.signal.days })
                        : it.signal?.kind === "other"
                          ? it.signal.text
                          : null,
                }))}
                icons={Object.fromEntries(
                  items.map((it) => [it.id, <AppIcon key={it.id} name={it.appName} iconKey={it.appIconKey} color={it.appColor} size={26} />]),
                )}
              />
            </div>
          </div>
        )}
      </DeskColumn>
    </DeskToaster>
  );
}
