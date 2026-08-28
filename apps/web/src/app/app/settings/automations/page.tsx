import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { automationRules, automationRuns, db, teams, tickets } from "@openhelpdesk/db";
import { and, asc, count, desc, eq, gt } from "drizzle-orm";
import { ruleSummary } from "@/lib/rule-labels";
import { getT, type Translate } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/settings-page";
import { Drawer } from "@/components/settings-overlays";
import { deleteRule, duplicateRule, moveRule, toggleRule } from "./actions";

/** Empty-state templates — design verbatim (ST-05). */
function templates(t: Translate): { key: string; name: string; description: string }[] {
  return [
    {
      key: "ack",
      name: t("app.settings.rules.ackReceipt"),
      description: t("app.settings.rules.templateAckDesc"),
    },
    {
      key: "escalade",
      name: t("app.settings.rules.templateEscalationName"),
      description: t("app.settings.rules.templateEscalationDesc"),
    },
    {
      key: "relance",
      name: t("app.settings.rules.templateFollowUpName"),
      description: t("app.settings.rules.templateFollowUpDesc"),
    },
    {
      key: "cloture",
      name: t("app.settings.rules.templateCloseName"),
      description: t("app.settings.rules.templateCloseDesc"),
    },
  ];
}

/** "0 run / 7 d" · "312 runs / 7 d" (design verbatim). */
function runsLabel(n: number, t: Translate): string {
  return t("app.settings.rules.runsPerWeek", { count: n });
}

/**
 * ST-05 — Automations (1000 px): ordered list in a single card
 * (⠿ handle + 18 px mono number, summary, real 7-day run counts, 34×20 toggle,
 * log in a drawer), "+ New rule" below the list. Empty state with 4 templates.
 */
export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { saved } = await searchParams;

  // Deterministic sort: position, then kind (trigger before scheduled) and name.
  // `createdAt` does not discriminate between rows inserted in one transaction.
  const rules = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.tenantId, tenant.id))
    .orderBy(asc(automationRules.position), asc(automationRules.kind), asc(automationRules.name));

  // Team names: the summary reads "assign to Escalation", not an id.
  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tenantId, tenant.id));
  const teamNames = new Map(teamRows.map((team) => [team.id, team.name]));

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const runCounts = await db
    .select({ ruleId: automationRuns.ruleId, n: count() })
    .from(automationRuns)
    .where(and(eq(automationRuns.tenantId, tenant.id), gt(automationRuns.createdAt, since)))
    .groupBy(automationRuns.ruleId);
  const runs7d = new Map(runCounts.map((r) => [r.ruleId, r.n]));

  // Per-rule log (drawer) — last 20 runs with the ticket number.
  const journals = new Map<
    string,
    { createdAt: Date; ticketNumber: number | null; actionsApplied: unknown }[]
  >();
  for (const rule of rules) {
    const rows = await db
      .select({
        createdAt: automationRuns.createdAt,
        actionsApplied: automationRuns.actionsApplied,
        ticketNumber: tickets.number,
      })
      .from(automationRuns)
      .leftJoin(tickets, eq(automationRuns.ticketId, tickets.id))
      .where(and(eq(automationRuns.tenantId, tenant.id), eq(automationRuns.ruleId, rule.id)))
      .orderBy(desc(automationRuns.createdAt))
      .limit(20);
    journals.set(rule.id, rows);
  }

  const tabs = [
    { label: t("app.settings.rules.triggersTab"), href: "/app/settings/automations", active: true },
    {
      label: t("app.settings.rules.editorTab"),
      href: "/app/settings/automations/new",
      active: false,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title={t("app.settings.rules.automationsTitle")}
        subtitle={t("app.settings.rules.automationsSubtitle")}
        tabs={tabs}
      />

      {saved === "1" && (
        <p style={{ fontSize: 12.5, color: "var(--ok)" }}>{t("app.settings.rules.saved")}</p>
      )}

      <div className="st-rise flex flex-col" style={{ gap: 14 }}>
        {rules.length === 0 ? (
          <div
            className="flex flex-col items-center rounded-xl border border-dashed text-center"
            style={{ padding: "40px 24px", gap: 15, borderColor: "var(--line)" }}
          >
            <p className="font-semibold" style={{ fontSize: 16, color: "var(--ink)" }}>
              {t("app.settings.rules.rulesEmptyTitle")}
            </p>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)", maxWidth: 420 }}>
              {t("app.settings.rules.rulesEmptyText")}
            </p>
            <div
              className="grid w-full text-left"
              style={{ gridTemplateColumns: "1fr 1fr", gap: 9, maxWidth: 540, marginTop: 4 }}
            >
              {templates(t).map((tpl) => (
                <Link
                  key={tpl.key}
                  href={`/app/settings/automations/new?template=${tpl.key}`}
                  className="ohd-hover-edge-ink rounded-[9px] border"
                  style={{
                    padding: "13px 15px",
                    borderColor: "var(--line)",
                    background: "var(--panel)",
                  }}
                >
                  <span className="block font-semibold" style={{ fontSize: 13.5, color: "var(--ink)" }}>
                    {tpl.name}
                  </span>
                  <span className="block" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {tpl.description}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-[14px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            {rules.map((rule, index) => (
              <div
                key={rule.id}
                className="flex flex-wrap items-center border-b"
                style={{
                  padding: "13px 15px",
                  gap: 13,
                  borderColor: "var(--line-2)",
                  opacity: rule.active ? 1 : 0.7,
                }}
              >
                <span aria-hidden style={{ fontSize: 12, color: "var(--ink-3)", cursor: "grab" }}>
                  ⠿
                </span>
                <span
                  className="font-mono tabular-nums"
                  style={{ fontSize: 11, color: "var(--ink-3)", width: 18 }}
                >
                  {index + 1}
                </span>
                <span className="flex flex-col">
                  <form action={moveRule}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      disabled={index === 0}
                      className="block leading-none disabled:opacity-30"
                      style={{ color: "var(--ink-3)", fontSize: 9 }}
                      title={t("app.settings.rules.moveUp")}
                    >
                      ▲
                    </button>
                  </form>
                  <form action={moveRule}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      disabled={index === rules.length - 1}
                      className="block leading-none disabled:opacity-30"
                      style={{ color: "var(--ink-3)", fontSize: 9 }}
                      title={t("app.settings.rules.moveDown")}
                    >
                      ▼
                    </button>
                  </form>
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/settings/automations/${rule.id}`}
                    className="block truncate font-semibold"
                    style={{ fontSize: 13.5, color: "var(--ink)" }}
                  >
                    {rule.name}
                  </Link>
                  <p className="truncate" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {ruleSummary(
                      t,
                      (rule.conditionsAll as never[]) ?? [],
                      (rule.conditionsAny as never[]) ?? [],
                      (rule.actions as never[]) ?? [],
                      teamNames,
                    )}
                  </p>
                </div>

                <span
                  className="whitespace-nowrap tabular-nums"
                  style={{ fontSize: 12, color: "var(--ink-3)" }}
                >
                  {runsLabel(runs7d.get(rule.id) ?? 0, t)}
                </span>

                <form action={toggleRule}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={rule.active}
                    className="ohd-switch"
                    title={
                      rule.active
                        ? t("app.settings.rules.ruleDisable")
                        : t("app.settings.rules.ruleEnable")
                    }
                  />
                </form>

                <Drawer
                  title={t("app.settings.rules.journalTitle")}
                  trigger={<>{t("app.settings.rules.journalTrigger")}</>}
                  triggerClassName="whitespace-nowrap"
                  triggerStyle={{ fontSize: 12, color: "var(--acc-2)" }}
                >
                  <RuleJournal rows={journals.get(rule.id) ?? []} t={t} />
                </Drawer>

                <form action={duplicateRule}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <button style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {t("app.settings.rules.duplicate")}
                  </button>
                </form>
                <form action={deleteRule}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <button style={{ fontSize: 12, color: "var(--dang)" }}>
                    {t("app.settings.rules.delete")}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <Link
          href="/app/settings/automations/new"
          className="inline-flex items-center justify-center self-start rounded-[9px] font-semibold"
          style={{ color: "var(--on-brand)", height: 38, padding: "0 13px", fontSize: 13, background: "var(--acc)" }}
        >
          {t("app.settings.rules.ruleNew")}
        </Link>
      </div>
    </PageShell>
  );
}

function RuleJournal({
  rows,
  t,
}: {
  rows: { createdAt: Date; ticketNumber: number | null; actionsApplied: unknown }[];
  t: Translate;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
        {t("app.settings.rules.journalEmpty")}
      </p>
    );
  }
  return (
    <ul className="flex flex-col" style={{ gap: 14 }}>
      {rows.map((r, i) => (
        <li key={i} className="flex flex-col" style={{ gap: 6 }}>
          <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            {t.fmt.relative(r.createdAt)}
          </span>
          <span
            className="flex items-start rounded-md border"
            style={{
              minHeight: 48,
              padding: "10px 11px",
              borderColor: "var(--line)",
              background: "var(--bg)",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--ink)",
            }}
          >
            {r.ticketNumber != null ? `#${r.ticketNumber} → ` : ""}
            {/* The engine records applied actions as ready-to-read labels
                (packages/rules/src/apply.ts). Reading them as objects made the
                journal claim "no action" on every run that did something. */}
            {Array.isArray(r.actionsApplied)
              ? (r.actionsApplied as string[]).filter(Boolean).join(", ") ||
                t("app.settings.rules.journalNoAction")
              : t("app.settings.rules.journalNoAction")}
          </span>
        </li>
      ))}
    </ul>
  );
}
