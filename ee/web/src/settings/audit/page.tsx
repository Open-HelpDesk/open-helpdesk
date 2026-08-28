import { requireAgent } from "@/lib/session";
import { auditEvents, db, users } from "@openhelpdesk/db";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { getEdition } from "@openhelpdesk/config";
import { entitlementsFor } from "@/lib/entitlements";
import { LockedScreen, PageHeader, PageShell } from "@/components/settings-page";
import { AutoSubmitSelect } from "@/components/settings-overlays";
import { getT, type Translate } from "@/i18n/server";

const AUDIT_GRID = "160px 170px minmax(220px,1fr) 200px 120px";

/** Destructive actions — rendered in --dang (the action is stored in French). */
const DESTRUCTIVE =
  /supprim|révoqu|revoqu|désactiv|desactiv|purg|delete|remove|revoke|disable/i;

function actorTypeLabel(t: Translate, actorType: string): string {
  const labels: Record<string, string> = {
    system: t("app.settings.dev.actorSystem"),
    api: t("app.settings.dev.actorApi"),
    user: t("app.settings.dev.actorUser"),
    contact: t("app.settings.dev.actorContact"),
  };
  return labels[actorType] ?? actorType;
}

/** Filter chip / banner button: h30, --line border, radius 6, 12.5 px. */
const CHIP: React.CSSProperties = {
  height: 30,
  padding: "0 11px",
  borderRadius: 6,
  fontSize: 12.5,
  borderColor: "var(--line)",
  background: "var(--panel)",
  color: "var(--ink-2)",
};

/** "Today 14:02", "Yesterday 17:48", "14 Aug 10:24". */
function dayTime(t: Translate, date: Date, now: Date = new Date()): string {
  const time = date.toLocaleTimeString(t.locale.tag, { hour: "2-digit", minute: "2-digit" });
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (day === today) return t("app.settings.dev.dayToday", { time });
  if (day === today - 24 * 3600 * 1000) return t("app.settings.dev.dayYesterday", { time });
  return `${t.fmt.dateShort(date)} ${time}`;
}

/** Table header 11 px/700 on a --sunk background, height 34. */
function TableHead({ t }: { t: Translate }) {
  const columns = [
    t("app.settings.dev.colDate"),
    t("app.settings.dev.colActor"),
    t("app.settings.dev.colAction"),
    t("app.settings.dev.colTarget"),
    t("app.settings.dev.colIp"),
  ];
  return (
    <div
      className="grid items-center border-b"
      style={{
        gridTemplateColumns: AUDIT_GRID,
        height: 40,
        padding: "0 14px",
        background: "var(--canvas)",
        borderColor: "var(--line)",
        fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".09em",
        color: "var(--ink-3)",
      }}
    >
      {columns.map((c) => (
        <span key={c}>{c}</span>
      ))}
    </div>
  );
}

/**
 * ST-12 — Audit log (1040 px). Locked without the entitlement (blur veil + locked
 * card, verbatim copy). Unlocked: filters + real auditEvents table, destructive
 * actions in red, empty state.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string; days?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const ent = entitlementsFor(tenant);
  const { actor, action, days } = await searchParams;

  const header = (
    <PageHeader
      title={t("app.settings.dev.auditTitle")}
      subtitle={t("app.settings.dev.auditSubtitle")}
    />
  );

  if (!ent.auditLog) {
    const edition = getEdition();
    return (
      <PageShell>
        {header}
        <LockedScreen
          variant={edition}
          title={t(
            edition === "cloud"
              ? "app.settings.dev.auditLockedTitle"
              : "app.settings.shell.eeSelfHostedTitle",
          )}
          text={t(
            edition === "cloud"
              ? "app.settings.dev.auditLockedText"
              : "app.settings.shell.eeSelfHostedText",
          )}
          ghost={<GhostTable t={t} />}
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
    <PageShell>
      {header}

      <div className="st-rise flex flex-col" style={{ gap: 14 }}>
        {/* Filters */}
        <form className="flex flex-wrap items-center" style={{ gap: 7 }}>
          <AutoSubmitSelect
            name="actor"
            defaultValue={actor ?? ""}
            options={[
              { value: "", label: t("app.settings.dev.filterActorAll") },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
            style={CHIP}
          />
          <AutoSubmitSelect
            name="action"
            defaultValue={action ?? ""}
            options={[
              { value: "", label: t("app.settings.dev.filterActionAll") },
              ...actionRows.map((a) => ({ value: a.action, label: a.action })),
            ]}
            style={{ ...CHIP, maxWidth: 260 }}
          />
          <AutoSubmitSelect
            name="days"
            defaultValue={String(daysN)}
            options={[
              { value: "7", label: t("app.settings.dev.filterLastDays", { count: 7 }) },
              { value: "30", label: t("app.settings.dev.filterLastDays", { count: 30 }) },
              { value: "90", label: t("app.settings.dev.filterLastDays", { count: 90 }) },
            ]}
            style={CHIP}
          />
          <span className="flex-1" />
          <a
            href={`/app/settings/audit/export?days=${daysN}${actor ? `&actor=${actor}` : ""}${action ? `&action=${encodeURIComponent(action)}` : ""}`}
            className="grid place-items-center border"
            style={CHIP}
          >
            {t("app.settings.dev.exportCsv")}
          </a>
        </form>

        <div
          className="overflow-x-auto border"
          style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div style={{ minWidth: 880 }}>
            <TableHead t={t} />
            {rows.length === 0 && (
              <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                {t("app.settings.dev.auditEmpty")}
              </p>
            )}
            {rows.map((e) => {
              const destructive = DESTRUCTIVE.test(e.action);
              return (
                <div
                  key={e.id}
                  className="ohd-hover grid items-center border-b"
                  style={{
                    gridTemplateColumns: AUDIT_GRID,
                    height: 42,
                    padding: "0 14px",
                    borderColor: "var(--line-2)",
                    fontSize: 12.5,
                  }}
                >
                  <span className="tabular-nums" style={{ color: "var(--ink-3)" }}>
                    {dayTime(t, e.createdAt)}
                  </span>
                  <span className="truncate" style={{ paddingRight: 10, color: "var(--ink)" }}>
                    {(e.actorId ? agentNameById.get(e.actorId) : undefined) ??
                      actorTypeLabel(t, e.actorType)}
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

/** Dummy filters + table blurred behind the locked-state veil. */
function GhostTable({ t }: { t: Translate }) {
  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      <div className="flex items-center" style={{ gap: 7 }}>
        {[
          t("app.settings.dev.filterActorAll"),
          t("app.settings.dev.filterActionAll"),
          t("app.settings.dev.filterLastDays", { count: 30 }),
        ].map((f) => (
          <span key={f} className="flex items-center border" style={{ ...CHIP, gap: 6 }}>
            {f}
            <span style={{ opacity: 0.45, fontSize: 9 }}>▾</span>
          </span>
        ))}
        <span className="flex-1" />
        <span className="grid place-items-center border" style={CHIP}>
          {t("app.settings.dev.exportCsv")}
        </span>
      </div>
      <div
        className="border"
        style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <TableHead t={t} />
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
