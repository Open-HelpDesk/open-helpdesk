/**
 * SD-A1 — the access request queue and the selected request (spec 19 §6).
 *
 * Server component: the list, the facts, the circuit and the journal are read
 * here; only the buttons are a client island (request-actions.tsx). The
 * selection lives in the URL (/app/desk/requests/<id>), so a request can be
 * linked to from a ticket, a notification or a colleague.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import { describeDeskAudit } from "@/lib/desk";
import { AppIcon } from "@/components/desk/app-icon";
import { getT, type Translate } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/en";
import { requireAgent } from "@/lib/session";
import {
  accessQueue,
  accessRequestDetail,
  personOfAgent,
  type ConnectorKindName,
  type QueueFilter,
  type RequestDetail,
} from "@/lib/desk/it-data";
import { RequestActions } from "./request-actions";
import { Avatar, StatePill } from "./ui";
import { card, sectionLabel } from "./styles";

const FILTERS: Array<{ value: QueueFilter; key: MessageKey }> = [
  { value: "all", key: "desk.it.queue.filterAll" },
  { value: "approval", key: "desk.it.queue.filterApproval" },
  { value: "provision", key: "desk.it.queue.filterProvision" },
  { value: "closed", key: "desk.it.queue.filterClosed" },
];

function withFilter(path: string, filter: QueueFilter) {
  return filter === "all" ? path : `${path}?f=${filter}`;
}

export function connectorName(kind: ConnectorKindName | null | undefined, t: (k: MessageKey) => string): string {
  return t(`desk.it.provisioning.${kind ?? "manual"}` as MessageKey);
}

export function money(cents: number, t: Translate): string {
  return t("desk.it.money", { amount: t.fmt.amount(cents / 100) });
}

export async function RequestsScreen({ filter, selectedId }: { filter: QueueFilter; selectedId: string | null }) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const queue = await accessQueue(tenant.id, filter);
  const targetId = selectedId ?? queue.rows[0]?.id ?? null;
  const [detail, me] = await Promise.all([
    targetId ? accessRequestDetail(tenant.id, targetId) : Promise.resolve(null),
    personOfAgent(tenant.id, agent.id),
  ]);

  return (
    <div className="flex min-h-0 flex-1" data-screen-label="SD-A1">
      {/* ---- Queue ---- */}
      <div className="flex min-h-0 shrink-0 flex-col border-r" style={{ width: 340, borderColor: "var(--line)", background: "var(--panel)" }}>
        <div className="flex flex-col border-b" style={{ padding: "16px 16px 12px", gap: 12, borderColor: "var(--line)" }}>
          <h1 style={{ fontFamily: "var(--font-title)", fontSize: 19, fontWeight: 600, letterSpacing: "-.015em" }}>{t("desk.it.queue.title")}</h1>
          <div role="tablist" className="flex" style={{ background: "var(--sunk)", borderRadius: 9, padding: 2.5, gap: 2 }}>
            {FILTERS.map((f) => {
              const on = f.value === filter;
              return (
                <Link
                  key={f.value}
                  role="tab"
                  aria-selected={on}
                  href={withFilter("/app/desk", f.value)}
                  className="whitespace-nowrap"
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "5px 2px",
                    borderRadius: 7,
                    fontSize: 11.5,
                    fontWeight: 600,
                    background: on ? "var(--panel)" : "transparent",
                    color: on ? "var(--ink)" : "var(--ink-2)",
                    boxShadow: on ? "0 1px 2px rgba(13,28,23,.1)" : "none",
                  }}
                >
                  {t(f.key)} <span style={{ opacity: 0.55 }}>{t.fmt.number(queue.counts[f.value])}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {queue.rows.length === 0 && <p style={{ padding: "18px 16px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.it.queue.empty")}</p>}
          {queue.rows.map((r) => {
            const on = r.id === targetId;
            return (
              <Link
                key={r.id}
                href={withFilter(`/app/desk/requests/${r.id}`, filter)}
                aria-current={on ? "true" : undefined}
                className="ohd-row flex border-b"
                style={
                  {
                    gap: 11,
                    padding: "12px 16px 12px 13px",
                    borderColor: "var(--line-2)",
                    boxShadow: `inset 3px 0 0 ${on ? "var(--brand)" : "transparent"}`,
                    "--row-bg": on ? "var(--brand-t)" : "transparent",
                  } as CSSProperties
                }
              >
                <AppIcon name={r.appName} iconKey={r.appIconKey} logoUrl={r.appLogoUrl} color={r.appColor} size={32} />
                <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
                  <div className="flex items-baseline" style={{ gap: 8 }}>
                    <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                      {t("desk.it.queue.rowTitle", { app: r.appName, tier: r.tierName })}
                    </span>
                    <span className="whitespace-nowrap" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {t.fmt.messageTime(new Date(r.createdAt))}
                    </span>
                  </div>
                  <div className="truncate" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {r.department ? `${r.requesterName} · ${r.department}` : r.requesterName}
                  </div>
                  <div className="flex items-center" style={{ gap: 8, marginTop: 4 }}>
                    <StatePill state={r.state} />
                    <span className="flex-1" />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)" }}>{t("desk.it.ref", { number: String(r.ticketNumber) })}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ---- Detail ---- */}
      <div className="min-w-0 flex-1 overflow-auto">
        {detail ? (
          <RequestDetailView d={detail} t={t} myPersonId={me?.id ?? null} />
        ) : (
          <p style={{ padding: "26px", fontSize: 13.5, color: "var(--ink-3)" }}>
            {selectedId ? t("desk.it.queue.notFound") : t("desk.it.queue.noSelection")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The journal line's payload, with the actor's name filled from the actor
 * column when the line did not freeze it (older lines, imports).
 */
function withActor(l: RequestDetail["journal"][number]): unknown {
  const after = (l.after && typeof l.after === "object" ? l.after : {}) as Record<string, unknown>;
  return after.actor || !l.actorLabel ? after : { ...after, actor: l.actorLabel };
}

/* ---------- The circuit, as the design draws it ---------- */

type StepStatus = "done" | "cur" | "todo" | "ref" | "can";
type Step = { key: string; label: string; detail: string; status: StepStatus };

const DOT: Record<StepStatus, { bg: string; ink: string; bd: string; label: string }> = {
  done: { bg: "var(--brand)", ink: "#fff", bd: "var(--brand)", label: "var(--ink)" },
  cur: { bg: "var(--wait-t)", ink: "var(--wait)", bd: "var(--wait)", label: "var(--ink)" },
  todo: { bg: "var(--panel)", ink: "var(--ink-3)", bd: "var(--line)", label: "var(--ink-3)" },
  ref: { bg: "var(--dang-t)", ink: "var(--dang)", bd: "var(--dang)", label: "var(--dang)" },
  can: { bg: "var(--sunk)", ink: "var(--ink-3)", bd: "var(--line)", label: "var(--ink-3)" },
};

function circuitSteps(d: RequestDetail, t: Translate): Step[] {
  const connector = d.app.connector ? connectorName(d.app.connector.kind, t) : null;
  const steps: Step[] = [];
  const createdDetail =
    d.effectiveLevels === 0 && d.approvals.length === 0
      ? `${t.fmt.messageTime(new Date(d.createdAt))} · ${d.autoRule?.startsWith("group") ? t("desk.it.step.autoGroup") : t("desk.it.step.autoLevel0")}`
      : t.fmt.messageTime(new Date(d.createdAt));
  steps.push({ key: "created", label: t("desk.it.step.created"), detail: createdDetail, status: "done" });

  let blocked = false; // a refusal or cancellation stops the circuit: later steps stay "to do"
  for (const a of d.approvals) {
    const label = t(`desk.it.step.${a.step}` as MessageKey);
    const who = a.approverName
      ? a.onBehalfOfName
        ? t("desk.it.step.onBehalf", { name: a.approverName, manager: a.onBehalfOfName })
        : a.approverName
      : t("desk.it.step.unknownApprover");
    const merged = a.mergedSteps.includes("manager") && a.mergedSteps.includes("owner");
    if (a.decision === "approved") {
      steps.push({ key: a.id, label, status: "done", detail: merged ? t("desk.it.step.approvedMerged", { name: who }) : t("desk.it.step.approvedBy", { name: who }) });
    } else if (a.decision === "refused") {
      steps.push({ key: a.id, label, status: "ref", detail: t("desk.it.step.refusedBy", { name: who }) });
      blocked = true;
    } else if (a.decision === "skipped") {
      steps.push({ key: a.id, label, status: "done", detail: t("desk.it.step.skipped") });
    } else if (blocked) {
      steps.push({ key: a.id, label, status: "todo", detail: who });
    } else if (d.state === "cancelled") {
      steps.push({ key: a.id, label, status: "can", detail: t("desk.it.step.cancelled") });
      blocked = true;
    } else {
      steps.push({ key: a.id, label, status: "cur", detail: t("desk.it.step.waitingFor", { name: who }) });
      blocked = true;
    }
  }

  const provStatus: StepStatus =
    d.state === "provisioning" || d.state === "provisioning_failed" ? "cur" : d.state === "active" ? "done" : "todo";
  const provDetail =
    d.state === "provisioning_failed"
      ? t("desk.it.step.provFailed")
      : d.state === "provisioning"
        ? connector && d.job?.state !== "manual"
          ? t("desk.it.step.provRunning", { connector })
          : t("desk.it.step.provManualRunning")
        : connector
          ? t("desk.it.step.provVia", { connector })
          : t("desk.it.step.provManual");
  steps.push({ key: "prov", label: t("desk.it.step.provisioning"), detail: provDetail, status: provStatus });
  steps.push({
    key: "active",
    label: t("desk.it.step.active"),
    detail: d.state === "active" ? t("desk.it.step.activeDone") : "",
    status: d.state === "active" ? "done" : "todo",
  });
  return steps;
}

function RequestDetailView({ d, t, myPersonId }: { d: RequestDetail; t: Translate; myPersonId: string | null }) {
  const connector = d.app.connector ? connectorName(d.app.connector.kind, t) : null;
  const current = d.approvals.find((a) => a.decision === "pending") ?? null;
  const awaiting = d.state === "awaiting_manager" || d.state === "awaiting_owner" || d.state === "awaiting_extra";
  const canDecide = awaiting && !!current && current.step === "owner" && !!myPersonId && current.approverPersonId === myPersonId && d.requester.id !== myPersonId;
  const manualJob = (d.state === "provisioning" || d.state === "provisioning_failed") && d.job && (d.job.state === "manual" || d.job.state === "failed") ? d.job.id : null;
  const holdsAccess = d.state === "active" && d.grant && !d.grant.revokedAt;
  const steps = circuitSteps(d, t);

  const cost = d.tier.monthlyCostCents
    ? t("desk.it.facts.tierCost", { tier: d.tier.name, cost: money(d.tier.monthlyCostCents, t) })
    : t("desk.it.facts.tierFree", { tier: d.tier.name });
  const facts: Array<[MessageKey, string]> = [
    ["desk.it.facts.requester", d.requester.name],
    ["desk.it.facts.manager", d.requester.managerName ?? t("desk.it.common.none")],
    ["desk.it.facts.app", d.app.name],
    ["desk.it.facts.tier", cost],
    ["desk.it.facts.duration", d.durationDays == null ? t("desk.it.duration.permanent") : t("desk.it.duration.days", { count: d.durationDays })],
    ["desk.it.facts.provisioning", connector ?? t("desk.it.provisioning.manual")],
    ["desk.it.facts.owner", d.app.ownerName ?? t("desk.it.common.none")],
  ];

  const total = d.app.seatsPurchased;
  const free = total != null ? total - d.app.seatsUsed : null;
  const when = t.fmt.messageTime(new Date(d.createdAt));

  const failedError =
    d.state === "provisioning_failed"
      ? (d.job?.lastError ??
        (d.journal.find((l) => l.action === "desk.provisioning.failed")?.after as { error?: string } | undefined)?.error ??
        null)
      : null;

  return (
    <div className="flex flex-col" style={{ padding: "22px 26px 60px", gap: 18, maxWidth: 980 }}>
      <div className="flex flex-wrap items-start" style={{ gap: 16 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="flex items-center" style={{ gap: 8, fontSize: 12, color: "var(--ink-3)" }}>
            <span style={{ fontFamily: "var(--font-mono)" }}>{t("desk.it.ref", { number: String(d.ticketNumber) })}</span>
            <span style={{ padding: "1px 8px", borderRadius: 999, background: "var(--brand-t)", color: "var(--brand)", fontWeight: 600 }}>{t("desk.it.detail.kind")}</span>
            <Link href={`/app/tickets/${d.ticketNumber}`} className="underline-offset-2 hover:underline" style={{ color: "var(--brand-2)", fontWeight: 600 }}>
              {t("desk.it.detail.openTicket", { number: String(d.ticketNumber) })}
            </Link>
          </div>
          <h2 style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 600, letterSpacing: "-.015em", marginTop: 6 }}>
            {t("desk.it.detail.title", { app: d.app.name, tier: d.tier.name })}
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
            {d.requester.department
              ? t("desk.it.detail.meta", { name: d.requester.name, department: d.requester.department, when })
              : t("desk.it.detail.metaNoDepartment", { name: d.requester.name, when })}
          </p>
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <StatePill state={d.state} size="md" />
          <RequestActions
            requestId={d.id}
            requesterName={d.requester.name}
            appName={d.app.name}
            remind={awaiting && current && !canDecide && current.approverName ? { name: current.approverName } : null}
            decide={canDecide && current ? { approvalId: current.id } : null}
            markJobId={manualJob}
            creatingVia={d.state === "provisioning" && !manualJob && connector ? connector : null}
            revoke={holdsAccess ? { grantId: d.grant!.id, connector } : null}
          />
        </div>
      </div>

      {d.state === "provisioning_failed" && (
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--dang-t)", border: "1px solid var(--dang)", fontSize: 13, lineHeight: 1.5 }}>
          <p style={{ fontWeight: 650, color: "var(--dang)" }}>{t("desk.it.detail.failedTitle")}</p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", marginTop: 4, wordBreak: "break-word" }}>
            {failedError ?? t("desk.it.detail.failedNoError")}
          </p>
          <p style={{ color: "var(--ink-2)", marginTop: 6 }}>{t("desk.it.detail.failedText", { app: d.app.name })}</p>
        </div>
      )}

      <div className="grid items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <div className="flex flex-col" style={{ gap: 16 }}>
          <section style={{ ...card, padding: "18px 20px" }}>
            <h3 style={{ ...sectionLabel, marginBottom: 14 }}>{t("desk.it.circuit.title")}</h3>
            <ol>
              {steps.map((s, i) => {
                const dot = DOT[s.status];
                const next = steps[i + 1];
                return (
                  <li key={s.key} className="flex" style={{ gap: 12 }}>
                    <div className="flex flex-col items-center">
                      <span
                        className="grid place-items-center"
                        style={{ width: 26, height: 26, borderRadius: 99, flex: "none", fontSize: 11.5, fontWeight: 700, background: dot.bg, color: dot.ink, border: `1.5px solid ${dot.bd}` }}
                      >
                        {s.status === "done" ? "✓" : s.status === "cur" ? "•" : s.status === "ref" || s.status === "can" ? "✕" : String(i + 1)}
                      </span>
                      {next && <span style={{ width: 2, flex: 1, minHeight: 14, background: s.status === "done" && next.status !== "todo" ? "var(--brand)" : "var(--line)" }} />}
                    </div>
                    <div style={{ padding: "2px 0 14px", minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: dot.label }}>{s.label}</div>
                      {s.detail && <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{s.detail}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section style={{ ...card, padding: "18px 20px" }}>
            <div className="flex items-center" style={{ gap: 10, marginBottom: 10 }}>
              <Avatar name={d.requester.name} size={28} />
              <h3 style={sectionLabel}>{t("desk.it.justification.title")}</h3>
            </div>
            {d.justification ? (
              <p style={{ fontSize: 14.5, lineHeight: 1.55 }}>{t("desk.it.justification.quoted", { text: d.justification })}</p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("desk.it.justification.none")}</p>
            )}
          </section>

          <section style={{ ...card, padding: "18px 20px" }}>
            <div className="flex items-center" style={{ marginBottom: 10 }}>
              <h3 className="flex-1" style={sectionLabel}>{t("desk.it.journal.title")}</h3>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{t("desk.it.journal.sub")}</span>
            </div>
            {d.journal.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("desk.it.journal.empty")}</p>}
            {d.journal.map((l) => (
              <div key={l.id} className="flex border-t" style={{ gap: 14, padding: "7px 0", borderColor: "var(--line-2)", fontSize: 13 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)", minWidth: 96, flex: "none" }}>
                  {t.fmt.messageTime(new Date(l.at))}
                </span>
                <span style={{ color: "var(--ink-2)", minWidth: 0, wordBreak: "break-word" }}>
                  {describeDeskAudit(l.action, withActor(l), t, (iso: string) => t.fmt.dateShort(new Date(iso)))}
                </span>
              </div>
            ))}
          </section>
        </div>

        <div className="flex flex-col" style={{ gap: 16 }}>
          <section style={{ ...card, overflow: "hidden" }}>
            {facts.map(([k, v]) => (
              <div key={k} className="flex border-b" style={{ gap: 10, padding: "10px 16px", borderColor: "var(--line-2)", fontSize: 13 }}>
                <span style={{ width: 92, flex: "none", color: "var(--ink-3)" }}>{t(k)}</span>
                <span className="min-w-0 flex-1" style={{ fontWeight: 500 }}>
                  {v}
                </span>
              </div>
            ))}
            {d.tier.privileged && (
              <div className="border-b" style={{ padding: "8px 16px", borderColor: "var(--line-2)", fontSize: 12.5, fontWeight: 600, color: "var(--wait)" }}>
                {t("desk.it.facts.privileged")}
              </div>
            )}
            {d.budgetOverCents != null && d.budgetOverCents > 0 && (
              <div className="border-b" style={{ padding: "8px 16px", borderColor: "var(--line-2)", fontSize: 12.5, color: "var(--dang)" }}>
                {t("desk.it.facts.budgetOver", { amount: money(d.budgetOverCents, t) })}
              </div>
            )}
            <div className="flex flex-col" style={{ padding: "14px 16px", gap: 8 }}>
              {total != null ? (
                <>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{t("desk.it.seats.used", { used: d.app.seatsUsed, total })}</div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--sunk)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 99,
                        background: free != null && free <= 0 ? "var(--wait)" : "var(--brand)",
                        width: `${total > 0 ? Math.min(100, Math.round((d.app.seatsUsed / total) * 100)) : 100}%`,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: free != null && free <= 0 ? "var(--wait)" : "var(--ink-3)", fontWeight: free != null && free <= 0 ? 600 : 400 }}>
                    {free != null && free > 0 ? t("desk.it.seats.free", { count: free }) : t("desk.it.seats.none")}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{t("desk.it.seats.usedNoContract", { count: d.app.seatsUsed })}</div>
              )}
            </div>
          </section>
          <p style={{ padding: "14px 16px", borderRadius: 14, background: "var(--brand-t)", border: "1px solid var(--brand-b)", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {t("desk.it.detail.ticketNote", { number: String(d.ticketNumber) })}
          </p>
        </div>
      </div>
    </div>
  );
}
