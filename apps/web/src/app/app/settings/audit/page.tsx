import { requireAgent } from "@/lib/session";
import { auditEvents, db, users } from "@openhelpdesk/db";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { entitlementsFor } from "@/lib/entitlements";
import {
  GridHead,
  LockedScreen,
  PageHeader,
  PageShell,
  Select,
} from "@/components/settings-page";
import { AutoSubmitSelect } from "@/components/settings-overlays";

const AUDIT_GRID = "160px 170px minmax(220px,1fr) 200px 120px";
const DESTRUCTIVE = /delete|remove|revoke|disable|purge/i;

/**
 * ST-12 — Audit log (1040 px). Verrouillé hors plan Pro (voile blur + carte PLAN
 * PRO, textes verbatim). Déverrouillé : filtres + table auditEvents réels, actions
 * destructives en rouge, état vide.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string; days?: string }>;
}) {
  const { tenant } = await requireAgent();
  const ent = entitlementsFor(tenant.plan);
  const { actor, action, days } = await searchParams;

  const header = (
    <PageHeader
      code="ST-12"
      title="Audit log"
      subtitle="Journal complet des actions d'administration. Rétention 2 ans."
    />
  );

  if (!ent.auditLog) {
    return (
      <PageShell maxWidth={1040}>
        {header}
        <LockedScreen
          title="L'audit log est réservé au plan Pro"
          text="Conservez la trace de chaque action d'administration pendant 2 ans, avec diff avant/après et export CSV."
          ghost={<GhostTable />}
        />
      </PageShell>
    );
  }

  const daysN = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const since = new Date(Date.now() - daysN * 24 * 3600 * 1000);

  const filters = [eq(auditEvents.tenantId, tenant.id), gte(auditEvents.createdAt, since)];
  if (actor) filters.push(eq(auditEvents.actorId, actor));
  if (action) filters.push(eq(auditEvents.action, action));

  const [rows, agents, actionRows] = await Promise.all([
    db
      .select()
      .from(auditEvents)
      .where(and(...filters))
      .orderBy(desc(auditEvents.createdAt))
      .limit(200),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.tenantId, tenant.id))
      .orderBy(asc(users.name)),
    db
      .selectDistinct({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenant.id)),
  ]);

  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <PageShell maxWidth={1040}>
      {header}

      {/* Filtres */}
      <form className="flex flex-wrap items-center gap-2">
        <AutoSubmitSelect
          name="actor"
          defaultValue={actor ?? ""}
          options={[
            { value: "", label: "Tous les acteurs" },
            ...agents.map((a) => ({ value: a.id, label: a.name })),
          ]}
          style={{ minWidth: 160, padding: "6px 8px" }}
        />
        <AutoSubmitSelect
          name="action"
          defaultValue={action ?? ""}
          options={[
            { value: "", label: "Toutes les actions" },
            ...actionRows.map((a) => ({ value: a.action, label: a.action })),
          ]}
          style={{ minWidth: 160, padding: "6px 8px" }}
        />
        <AutoSubmitSelect
          name="days"
          defaultValue={String(daysN)}
          options={[
            { value: "7", label: "7 derniers jours" },
            { value: "30", label: "30 derniers jours" },
            { value: "90", label: "90 derniers jours" },
          ]}
          style={{ padding: "6px 8px" }}
        />
        <span className="flex-1" />
        <a
          href={`/app/settings/audit/export?days=${daysN}${actor ? `&actor=${actor}` : ""}${action ? `&action=${encodeURIComponent(action)}` : ""}`}
          className="rounded-md border px-3 font-medium"
          style={{
            height: 30,
            lineHeight: "28px",
            fontSize: 12.5,
            borderColor: "var(--line)",
            background: "var(--panel)",
            color: "var(--ink)",
          }}
        >
          Export CSV
        </a>
      </form>

      <div
        className="overflow-x-auto rounded-[10px] border"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div style={{ minWidth: 880 }}>
          <GridHead template={AUDIT_GRID} columns={["Date", "Acteur", "Action", "Cible", "IP"]} />
          {rows.length === 0 && (
            <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
              Aucun événement sur la période — les actions d'administration apparaîtront ici.
            </p>
          )}
          {rows.map((e) => {
            const destructive = DESTRUCTIVE.test(e.action);
            return (
              <div
                key={e.id}
                className="grid items-center gap-3 border-t"
                style={{
                  gridTemplateColumns: AUDIT_GRID,
                  padding: "9px 14px",
                  borderColor: "var(--line-2)",
                }}
              >
                <span className="font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  {e.createdAt.toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}{" "}
                  {e.createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="truncate" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                  {e.actorId ? (agentNameById.get(e.actorId) ?? e.actorType) : e.actorType}
                </span>
                <span
                  className="truncate font-mono font-medium"
                  style={{ fontSize: 12, color: destructive ? "var(--dang)" : "var(--ink)" }}
                >
                  {e.action}
                </span>
                <span className="truncate" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  {e.targetType ? `${e.targetType}${e.targetId ? ` · ${e.targetId.slice(0, 8)}` : ""}` : "—"}
                </span>
                <span className="font-mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {e.ip ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}

/** Table factice floutée derrière le voile de l'état verrouillé. */
function GhostTable() {
  return (
    <div
      className="rounded-[10px] border"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <GridHead template={AUDIT_GRID} columns={["Date", "Acteur", "Action", "Cible", "IP"]} />
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-3 border-t"
          style={{ gridTemplateColumns: AUDIT_GRID, padding: "11px 14px", borderColor: "var(--line-2)" }}
        >
          {[110, 90, 180, 130, 80].map((w, j) => (
            <span
              key={j}
              className="inline-block rounded"
              style={{ width: w, height: 10, background: "var(--sunk)" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
