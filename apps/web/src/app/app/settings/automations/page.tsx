import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { automationRules, automationRuns, db, tickets } from "@openhelpdesk/db";
import { and, asc, count, desc, eq, gt } from "drizzle-orm";
import { ruleSummary } from "@/lib/rule-labels";
import { relativeFr } from "@/lib/format";
import { EmptyState, PageHeader, PageShell } from "@/components/settings-page";
import { Drawer } from "@/components/settings-overlays";
import { deleteRule, duplicateRule, moveRule, toggleRule } from "./actions";

/** Modèles de l'état vide — verbatim design (ST-05). */
const TEMPLATES: { key: string; name: string; description: string }[] = [
  { key: "ack", name: "Accusé de réception", description: "Répond automatiquement à chaque nouveau ticket." },
  { key: "escalade", name: "Escalade urgente", description: "Assigne les tickets Urgents à l'équipe Escalade." },
  { key: "relance", name: "Relance client à 48 h", description: "Relance les tickets En attente sans réponse depuis 2 jours." },
  { key: "cloture", name: "Clôture automatique à J+4", description: "Passe les tickets Résolus en Clos après 4 jours." },
];

/**
 * ST-05 — Automatisations (1000 px) : liste ordonnée (poignée ⠿ + numéro mono),
 * résumé lisible, exécutions 7 j réelles, toggle, journal en drawer
 * (automationRuns réels), dupliquer/supprimer. État vide avec 4 modèles.
 */
export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { saved } = await searchParams;

  const rules = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.tenantId, tenant.id))
    .orderBy(asc(automationRules.position), asc(automationRules.createdAt));

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const runCounts = await db
    .select({ ruleId: automationRuns.ruleId, n: count() })
    .from(automationRuns)
    .where(and(eq(automationRuns.tenantId, tenant.id), gt(automationRuns.createdAt, since)))
    .groupBy(automationRuns.ruleId);
  const runs7d = new Map(runCounts.map((r) => [r.ruleId, r.n]));

  // Journal par règle (drawer) — 20 dernières exécutions avec le n° de ticket.
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
    { label: "Déclencheurs", href: "/app/settings/automations", active: true },
    { label: "Éditeur", href: "/app/settings/automations/new", active: false },
  ];

  return (
    <PageShell maxWidth={1000}>
      <PageHeader
        code="ST-05"
        title="Automatisations"
        subtitle="Règles « quand X alors Y ». L'ordre d'exécution compte."
        tabs={tabs}
        actions={
          <Link
            href="/app/settings/automations/new"
            className="inline-flex items-center rounded-md px-3.5 font-semibold text-white"
            style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
          >
            Nouvelle règle
          </Link>
        }
      />

      {saved === "1" && <p style={{ fontSize: 12.5, color: "var(--ok)" }}>✓ Enregistré</p>}

      {rules.length === 0 ? (
        <EmptyState
          title="Aucune automatisation"
          text="Partez d'un modèle éprouvé, puis adaptez-le à votre organisation."
        >
          <div
            className="mx-auto mt-4 grid max-w-xl gap-2 text-left"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            {TEMPLATES.map((t) => (
              <Link
                key={t.key}
                href={`/app/settings/automations/new?template=${t.key}`}
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              >
                <span className="block font-semibold" style={{ fontSize: 13, color: "var(--ink)" }}>
                  {t.name}
                </span>
                <span className="block" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  {t.description}
                </span>
              </Link>
            ))}
          </div>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule, index) => (
            <li
              key={rule.id}
              className="flex items-center gap-3 rounded-[10px] border"
              style={{
                background: "var(--panel)",
                borderColor: "var(--line)",
                padding: "10px 14px",
                opacity: rule.active ? 1 : 0.7,
              }}
            >
              {/* Poignée + numéro d'ordre */}
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  title="Réordonner"
                  style={{ color: "var(--ink-3)", fontSize: 13, cursor: "grab" }}
                >
                  ⠿
                </span>
                <span
                  className="font-mono tabular-nums"
                  style={{ fontSize: 11, color: "var(--ink-3)" }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex flex-col">
                  <form action={moveRule}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      disabled={index === 0}
                      className="block leading-none disabled:opacity-30"
                      style={{ color: "var(--ink-3)", fontSize: 9 }}
                      title="Monter"
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
                      title="Descendre"
                    >
                      ▼
                    </button>
                  </form>
                </span>
              </span>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/app/settings/automations/${rule.id}`}
                  className="block truncate font-semibold"
                  style={{ fontSize: 13.5, color: "var(--ink)" }}
                >
                  {rule.name}
                </Link>
                <p className="truncate" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  {ruleSummary(
                    (rule.conditionsAll as never[]) ?? [],
                    (rule.conditionsAny as never[]) ?? [],
                    (rule.actions as never[]) ?? [],
                  )}
                </p>
              </div>

              <span
                className="whitespace-nowrap font-mono tabular-nums"
                style={{ fontSize: 11.5, color: "var(--ink-3)" }}
              >
                {runs7d.get(rule.id) ?? 0} exéc. / 7 j
              </span>

              <form action={toggleRule}>
                <input type="hidden" name="ruleId" value={rule.id} />
                <button
                  type="submit"
                  role="switch"
                  aria-checked={rule.active}
                  className="relative rounded-full"
                  style={{
                    width: 34,
                    height: 20,
                    background: rule.active ? "var(--acc)" : "var(--line)",
                  }}
                  title={rule.active ? "Désactiver" : "Activer"}
                >
                  <span
                    className="absolute rounded-full bg-white transition-all"
                    style={{ top: 2, width: 16, height: 16, left: rule.active ? 16 : 2 }}
                  />
                </button>
              </form>

              <Drawer
                title={`Journal — ${rule.name}`}
                trigger={<>Journal</>}
                triggerClassName="rounded-md border px-2 py-1 font-medium"
                triggerStyle={{
                  fontSize: 12,
                  borderColor: "var(--line)",
                  color: "var(--ink)",
                  background: "var(--panel)",
                }}
              >
                <RuleJournal rows={journals.get(rule.id) ?? []} />
              </Drawer>

              <form action={duplicateRule}>
                <input type="hidden" name="ruleId" value={rule.id} />
                <button
                  className="rounded-md border px-2 py-1 font-medium"
                  style={{ fontSize: 12, borderColor: "var(--line)", color: "var(--ink)" }}
                >
                  Dupliquer
                </button>
              </form>
              <form action={deleteRule}>
                <input type="hidden" name="ruleId" value={rule.id} />
                <button
                  className="rounded-md border px-2 py-1 font-medium"
                  style={{ fontSize: 12, borderColor: "var(--dang)", color: "var(--dang)" }}
                >
                  Supprimer
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function RuleJournal({
  rows,
}: {
  rows: { createdAt: Date; ticketNumber: number | null; actionsApplied: unknown }[];
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
        Aucune exécution enregistrée pour cette règle.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <li
          key={i}
          className="rounded-md border px-3 py-2"
          style={{ borderColor: "var(--line-2)", background: "var(--sunk)" }}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold" style={{ fontSize: 12, color: "var(--ink)" }}>
              {r.ticketNumber != null ? `#${r.ticketNumber}` : "—"}
            </span>
            <span className="flex-1" />
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{relativeFr(r.createdAt)}</span>
          </div>
          <p className="mt-0.5 truncate font-mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
            {Array.isArray(r.actionsApplied)
              ? (r.actionsApplied as { type?: string }[])
                  .map((a) => a?.type ?? "")
                  .filter(Boolean)
                  .join(" · ") || "aucune action"
              : "aucune action"}
          </p>
        </li>
      ))}
    </ul>
  );
}
