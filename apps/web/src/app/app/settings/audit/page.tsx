import { requireAgent } from "@/lib/session";
import { auditEvents, db, users } from "@openhelpdesk/db";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { entitlementsFor } from "@/lib/entitlements";
import { LockedScreen, PageHeader, PageShell } from "@/components/settings-page";
import { AutoSubmitSelect } from "@/components/settings-overlays";

const AUDIT_GRID = "160px 170px minmax(220px,1fr) 200px 120px";
const COLUMNS = ["Date", "Acteur", "Action", "Cible", "IP"];

/** Actions destructives — affichées en --dang (l'action est stockée en français). */
const DESTRUCTIVE =
  /supprim|révoqu|revoqu|désactiv|desactiv|purg|delete|remove|revoke|disable/i;

const ACTOR_TYPES: Record<string, string> = {
  system: "Système",
  api: "API",
  user: "Utilisateur",
  contact: "Contact",
};

/** Chip de filtre / bouton du bandeau : h30, bordure --line, radius 6, 12.5 px. */
const CHIP: React.CSSProperties = {
  height: 30,
  padding: "0 11px",
  borderRadius: 6,
  fontSize: 12.5,
  borderColor: "var(--line)",
  background: "var(--panel)",
  color: "var(--ink-2)",
};

/** « Aujourd'hui 14:02 », « Hier 17:48 », « 14 août 10:24 ». */
function dayTimeFr(date: Date, now: Date = new Date()): string {
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (day === today) return `Aujourd'hui ${time}`;
  if (day === today - 24 * 3600 * 1000) return `Hier ${time}`;
  return `${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} ${time}`;
}

/** En-tête de table 11 px/700 sur fond --sunk, hauteur 34. */
function TableHead() {
  return (
    <div
      className="grid items-center border-b font-bold"
      style={{
        gridTemplateColumns: AUDIT_GRID,
        height: 34,
        padding: "0 14px",
        background: "var(--sunk)",
        borderColor: "var(--line)",
        fontSize: 11,
        color: "var(--ink-3)",
      }}
    >
      {COLUMNS.map((c) => (
        <span key={c}>{c}</span>
      ))}
    </div>
  );
}

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

      <div className="st-rise flex flex-col" style={{ gap: 14 }}>
        {/* Filtres */}
        <form className="flex flex-wrap items-center" style={{ gap: 7 }}>
          <AutoSubmitSelect
            name="actor"
            defaultValue={actor ?? ""}
            options={[
              { value: "", label: "Acteur : tous" },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
            style={CHIP}
          />
          <AutoSubmitSelect
            name="action"
            defaultValue={action ?? ""}
            options={[
              { value: "", label: "Action : toutes" },
              ...actionRows.map((a) => ({ value: a.action, label: a.action })),
            ]}
            style={{ ...CHIP, maxWidth: 260 }}
          />
          <AutoSubmitSelect
            name="days"
            defaultValue={String(daysN)}
            options={[
              { value: "7", label: "7 derniers jours" },
              { value: "30", label: "30 derniers jours" },
              { value: "90", label: "90 derniers jours" },
            ]}
            style={CHIP}
          />
          <span className="flex-1" />
          <a
            href={`/app/settings/audit/export?days=${daysN}${actor ? `&actor=${actor}` : ""}${action ? `&action=${encodeURIComponent(action)}` : ""}`}
            className="grid place-items-center border"
            style={CHIP}
          >
            Export CSV
          </a>
        </form>

        <div
          className="overflow-x-auto border"
          style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div style={{ minWidth: 880 }}>
            <TableHead />
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
                  className="st-row grid items-center border-b"
                  style={{
                    gridTemplateColumns: AUDIT_GRID,
                    height: 42,
                    padding: "0 14px",
                    borderColor: "var(--line-2)",
                    fontSize: 12.5,
                  }}
                >
                  <span className="tabular-nums" style={{ color: "var(--ink-3)" }}>
                    {dayTimeFr(e.createdAt)}
                  </span>
                  <span className="truncate" style={{ paddingRight: 10, color: "var(--ink)" }}>
                    {(e.actorId ? agentNameById.get(e.actorId) : undefined) ??
                      ACTOR_TYPES[e.actorType] ??
                      e.actorType}
                  </span>
                  <span
                    className="truncate font-medium"
                    style={{
                      paddingRight: 10,
                      color: destructive ? "var(--dang)" : "var(--ink)",
                    }}
                  >
                    {e.action}
                  </span>
                  <span className="truncate" style={{ paddingRight: 10, color: "var(--ink-2)" }}>
                    {e.targetType
                      ? `${e.targetType}${e.targetId ? ` · ${e.targetId.slice(0, 8)}` : ""}`
                      : "—"}
                  </span>
                  <span className="font-mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                    {e.ip ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/** Filtres + table factices floutés derrière le voile de l'état verrouillé. */
function GhostTable() {
  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      <div className="flex items-center" style={{ gap: 7 }}>
        {["Acteur : tous", "Action : toutes", "30 derniers jours"].map((f) => (
          <span key={f} className="flex items-center border" style={{ ...CHIP, gap: 6 }}>
            {f}
            <span style={{ opacity: 0.45, fontSize: 9 }}>▾</span>
          </span>
        ))}
        <span className="flex-1" />
        <span className="grid place-items-center border" style={CHIP}>
          Export CSV
        </span>
      </div>
      <div
        className="border"
        style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <TableHead />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid items-center border-b"
            style={{
              gridTemplateColumns: AUDIT_GRID,
              height: 42,
              padding: "0 14px",
              borderColor: "var(--line-2)",
            }}
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
    </div>
  );
}
