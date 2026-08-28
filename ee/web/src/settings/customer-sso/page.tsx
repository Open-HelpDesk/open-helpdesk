import Link from "next/link";
import { requireAgent } from "@/lib/session";
import {
  contactOrganizations,
  contacts,
  db,
  orgAdminGrants,
  organizations,
  orgSsoConnections,
  ssoAuthEvents,
  verifiedDomains,
} from "@openhelpdesk/db";
import { and, asc, count, eq, gte } from "drizzle-orm";
import { getEdition } from "@openhelpdesk/config";
import { entitlementsFor } from "@/lib/entitlements";
import {
  LockedScreen,
  PageHeader,
  PageShell,
  EnterpriseBadge,
  StatusPill,
} from "@/components/settings-page";
import { Drawer } from "@/components/settings-overlays";
import { disableOrgConnection, toggleSsoDelegation } from "./actions";
import { getT, type Translate } from "@/i18n/server";

const PARK_GRID = "26px minmax(160px,1.2fr) minmax(150px,1fr) 130px 130px 100px 150px";
const PARK_MIN_WIDTH = 980;
const DAY = 24 * 3600 * 1000;

/** Label for a connection status — unknown: the raw value, as before. */
function statusLabel(t: Translate, status: string): string {
  if (status === "active") return t("app.settings.sso.statusActive");
  if (status === "pending") return t("app.settings.sso.statusPending");
  if (status === "error") return t("app.settings.sso.statusError");
  if (status === "disabled") return t("app.settings.sso.statusDisabled");
  return status;
}

const STATUS_TONES: Record<string, "ok" | "wait" | "dang" | "closed"> = {
  active: "ok",
  pending: "wait",
  error: "dang",
  disabled: "closed",
};
const STATUS_DOTS: Record<string, string> = {
  active: "var(--ok)",
  pending: "var(--wait)",
  error: "var(--dang)",
  disabled: "var(--ink-3)",
};
/** Brands as-is; only "Generic" is translated. */
const PROVIDER_LABELS: Record<string, string> = {
  entra: "Entra ID",
  google: "Google",
  okta: "Okta",
};

function providerLabel(t: Translate, provider: string): string {
  if (provider === "generic") return t("app.settings.sso.providerGeneric");
  return PROVIDER_LABELS[provider] ?? provider;
}

/** Filter chip / bar button: min-h 30, padding 5/11, radius 6, 12.5 px. */
const CHIP: React.CSSProperties = {
  minHeight: 30,
  padding: "5px 11px",
  borderRadius: 6,
  fontSize: 12.5,
  whiteSpace: "nowrap",
};

/** "for 4 h", "for 12 d" — the units come from the dictionary. */
function since(t: Translate, date: Date, now: Date = new Date()): string {
  const { unit, n } = t.fmt.elapsed(date, now);
  if (unit === "minute") return t("app.settings.sso.sinceMinutes", { count: n });
  if (unit === "hour") return t("app.settings.sso.sinceHours", { count: n });
  return t("app.settings.sso.sinceDays", { count: n });
}

/** "in 11 d". */
function until(t: Translate, date: Date, now: Date = new Date()): string {
  const days = Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY));
  return days <= 1
    ? t("app.settings.sso.withinDay")
    : t("app.settings.sso.inDays", { count: days });
}

/**
 * ST-14 — Customer organizations SSO (1180 px, EE). Real delegation, 4 counters
 * (border and value colored when non-zero), search + filters, fleet table
 * (clickable row → read-only drawer) then "Needs attention".
 */
export default async function CustomerSsoPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const ent = entitlementsFor(tenant);
  const { filter, q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  const header = (
    <PageHeader
      title={t("app.settings.sso.customerTitle")}
      subtitle={t("app.settings.sso.customerSubtitle")}
    />
  );

  if (!ent.customerSso) {
    const edition = getEdition();
    return (
      <PageShell>
        {header}
        <LockedScreen
          variant={edition}
          title={t(
            edition === "cloud"
              ? "app.settings.sso.customerLockedTitle"
              : "app.settings.shell.eeSelfHostedTitle",
          )}
          text={t(
            edition === "cloud"
              ? "app.settings.sso.customerLockedText"
              : "app.settings.shell.eeSelfHostedText",
          )}
          ghost={<GhostPark t={t} />}
        />
      </PageShell>
    );
  }

  const now = new Date();
  const in24h = new Date(now.getTime() - DAY);
  const in30d = new Date(now.getTime() + 30 * DAY);

  const [orgs, connections, domains, grants, memberCounts, failures24h] = await Promise.all([
    db
      .select()
      .from(organizations)
      .where(eq(organizations.tenantId, tenant.id))
      .orderBy(asc(organizations.name)),
    db.select().from(orgSsoConnections).where(eq(orgSsoConnections.tenantId, tenant.id)),
    db.select().from(verifiedDomains).where(eq(verifiedDomains.tenantId, tenant.id)),
    db
      .select({
        organizationId: orgAdminGrants.organizationId,
        contactName: contacts.name,
        contactEmail: contacts.email,
      })
      .from(orgAdminGrants)
      .innerJoin(contacts, eq(orgAdminGrants.contactId, contacts.id))
      .where(eq(orgAdminGrants.tenantId, tenant.id)),
    db
      .select({ organizationId: contactOrganizations.organizationId, n: count() })
      .from(contactOrganizations)
      .where(eq(contactOrganizations.tenantId, tenant.id))
      .groupBy(contactOrganizations.organizationId),
    db
      .select({ organizationId: ssoAuthEvents.organizationId, n: count() })
      .from(ssoAuthEvents)
      .where(
        and(
          eq(ssoAuthEvents.tenantId, tenant.id),
          eq(ssoAuthEvents.result, "failure"),
          gte(ssoAuthEvents.createdAt, in24h),
        ),
      )
      .groupBy(ssoAuthEvents.organizationId),
  ]);

  const connectionByOrg = new Map(connections.map((c) => [c.organizationId, c]));
  const domainsByOrg = new Map<string, typeof domains>();
  for (const d of domains) {
    domainsByOrg.set(d.organizationId, [...(domainsByOrg.get(d.organizationId) ?? []), d]);
  }
  const adminByOrg = new Map(grants.map((g) => [g.organizationId, g]));
  const membersByOrg = new Map(memberCounts.map((m) => [m.organizationId, m.n]));
  const failuresByOrg = new Map(failures24h.map((f) => [f.organizationId, f.n]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const expiring = connections.filter(
    (c) => c.secretExpiresAt && c.secretExpiresAt <= in30d && c.secretExpiresAt >= now,
  );
  const stats: { label: string; value: number; meta: string; tone: "ok" | "wait" | "dang" }[] = [
    {
      label: t("app.settings.sso.statActiveLabel"),
      value: connections.filter((c) => c.status === "active").length,
      meta: t("app.settings.sso.statActiveMeta", { count: orgs.length }),
      tone: "ok",
    },
    {
      label: t("app.settings.sso.statPendingLabel"),
      value: connections.filter((c) => c.status === "pending").length,
      meta: t("app.settings.sso.statPendingMeta"),
      tone: "wait",
    },
    {
      label: t("app.settings.sso.statErrorLabel"),
      value: connections.filter((c) => c.status === "error").length,
      meta: t("app.settings.sso.statErrorMeta"),
      tone: "dang",
    },
    {
      label: t("app.settings.sso.statExpiringLabel"),
      value: expiring.length,
      meta: t("app.settings.sso.statExpiringMeta"),
      tone: "wait",
    },
  ];

  // Fleet: organizations that have a connection OR verified domains.
  let parkOrgs = orgs.filter((o) => connectionByOrg.has(o.id) || domainsByOrg.has(o.id));
  if (filter === "error") {
    parkOrgs = parkOrgs.filter((o) => connectionByOrg.get(o.id)?.status === "error");
  } else if (filter === "pending") {
    parkOrgs = parkOrgs.filter(
      (o) =>
        connectionByOrg.get(o.id)?.status === "pending" ||
        (domainsByOrg.get(o.id) ?? []).some((d) => d.status === "pending"),
    );
  } else if (filter === "none") {
    parkOrgs = orgs.filter((o) => !connectionByOrg.has(o.id));
  }
  if (query) {
    parkOrgs = parkOrgs.filter(
      (o) =>
        o.name.toLowerCase().includes(query) ||
        (domainsByOrg.get(o.id) ?? []).some((d) => d.domain.toLowerCase().includes(query)),
    );
  }

  // Needs attention: connections in error, unverified domains, expiring secrets.
  const attention: {
    org: string;
    issue: string;
    when: string;
    tone: "dang" | "wait";
    adminEmail?: string;
  }[] = [];
  for (const c of connections) {
    if (c.status !== "error") continue;
    const org = orgById.get(c.organizationId);
    if (!org) continue;
    const blocked = failuresByOrg.get(org.id) ?? 0;
    // `lastError` comes from the tenant: never translated, only the fallback is.
    const reason = c.lastError ?? t("app.settings.sso.attentionRepeatedFailures");
    attention.push({
      org: org.name,
      issue:
        blocked > 0
          ? t("app.settings.sso.attentionAttempts", { reason, count: blocked })
          : reason,
      when: since(t, c.updatedAt, now),
      tone: "dang",
      adminEmail: adminByOrg.get(org.id)?.contactEmail,
    });
  }
  for (const d of domains) {
    const stale = d.status === "failed" || (d.status === "pending" && d.createdAt < new Date(now.getTime() - 7 * DAY));
    if (!stale) continue;
    const org = orgById.get(d.organizationId);
    if (!org) continue;
    attention.push({
      org: org.name,
      issue: t("app.settings.sso.attentionDomainUnverified", { domain: d.domain }),
      when: since(t, d.createdAt, now),
      tone: "wait",
      adminEmail: adminByOrg.get(org.id)?.contactEmail,
    });
  }
  for (const c of expiring) {
    const org = orgById.get(c.organizationId);
    if (!org || !c.secretExpiresAt) continue;
    attention.push({
      org: org.name,
      issue: t("app.settings.sso.attentionSecretExpiring"),
      when: until(t, c.secretExpiresAt, now),
      tone: "wait",
      adminEmail: adminByOrg.get(org.id)?.contactEmail,
    });
  }

  const filters = [
    { key: "", label: t("app.settings.sso.filterAll") },
    { key: "error", label: t("app.settings.sso.statErrorLabel") },
    { key: "pending", label: t("app.settings.sso.statusPending") },
    { key: "none", label: t("app.settings.sso.noSso") },
  ];

  return (
    <PageShell>
      {header}

      <div className="st-rise flex flex-col" style={{ gap: 20 }}>
        {/* Delegation */}
        <div
          className="flex items-start border"
          style={{
            gap: 12,
            padding: "14px 15px",
            borderRadius: 10,
            borderColor: tenant.ssoDelegationEnabled ? "var(--acc-b)" : "var(--line)",
            background: tenant.ssoDelegationEnabled ? "var(--acc-t)" : "var(--panel)",
          }}
        >
          <form action={toggleSsoDelegation} className="flex-none" style={{ marginTop: 1 }}>
            <button
              type="submit"
              role="switch"
              aria-checked={tenant.ssoDelegationEnabled}
              className="ohd-switch block"
              title={
                tenant.ssoDelegationEnabled
                  ? t("app.settings.sso.disable")
                  : t("app.settings.sso.enable")
              }
            />
          </form>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center" style={{ gap: 9 }}>
              <span className="font-semibold" style={{ fontSize: 13.5, color: "var(--ink)" }}>
                {t("app.settings.sso.delegationTitle")}
              </span>
              <EnterpriseBadge />
            </div>
            <p style={{ fontSize: 12.5, color: "var(--ink-2)", textWrap: "pretty" }}>
              {t("app.settings.sso.delegationText")}
            </p>
          </div>
        </div>

        {/* 4 counters */}
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 11 }}
        >
          {stats.map((s) => {
            const hot = s.value > 0 && s.tone !== "ok";
            return (
              <div
                key={s.label}
                className="flex flex-col border"
                style={{
                  borderRadius: 10,
                  padding: 14,
                  gap: 5,
                  background: "var(--panel)",
                  borderColor: hot ? `var(--${s.tone})` : "var(--line)",
                }}
              >
                <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{s.label}</span>
                <span
                  className="font-semibold tabular-nums"
                  style={{
                    fontSize: 23,
                    letterSpacing: "-0.02em",
                    color: hot ? `var(--${s.tone})` : "var(--ink)",
                  }}
                >
                  {s.value}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--ink-3)", textWrap: "pretty" }}>
                  {s.meta}
                </span>
              </div>
            );
          })}
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center" style={{ gap: 7 }}>
          <form
            className="flex min-w-0 flex-1"
            style={{ minWidth: 200, maxWidth: 300 }}
          >
            {filter && <input type="hidden" name="filter" value={filter} />}
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("app.settings.sso.searchPlaceholder")}
              className="w-full border"
              style={{
                ...CHIP,
                borderColor: "var(--line)",
                background: "var(--bg)",
                color: "var(--ink)",
              }}
            />
          </form>
          {filters.map((f) => {
            const active = (filter ?? "") === f.key;
            const params = new URLSearchParams();
            if (f.key) params.set("filter", f.key);
            if (query) params.set("q", q ?? "");
            const qs = params.toString();
            return (
              <Link
                key={f.key}
                href={`/app/settings/customer-sso${qs ? `?${qs}` : ""}`}
                className="ohd-hover-edge flex items-center border"
                style={{
                  ...CHIP,
                  borderColor: active ? "var(--acc)" : "var(--line)",
                  background: active ? "var(--acc-t)" : "var(--panel)",
                  color: active ? "var(--acc)" : "var(--ink-2)",
                  fontWeight: active ? 600 : 450,
                }}
              >
                {f.label}
              </Link>
            );
          })}
          <span className="flex-1" />
          <button
            disabled
            title={t("app.settings.sso.comingSoon")}
            className="grid place-items-center border disabled:opacity-50"
            style={{
              ...CHIP,
              borderColor: "var(--line)",
              background: "var(--panel)",
              color: "var(--ink-2)",
            }}
          >
            {t("app.settings.sso.exportCsv")}
          </button>
        </div>

        {/* Fleet table */}
        <div
          className="overflow-x-auto border"
          style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div style={{ minWidth: PARK_MIN_WIDTH }}>
            <ParkHead t={t} />
            {parkOrgs.length === 0 && (
              <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                {t("app.settings.sso.parkEmpty")}
              </p>
            )}
            {parkOrgs.map((org) => {
              const c = connectionByOrg.get(org.id);
              const orgDomains = domainsByOrg.get(org.id) ?? [];
              const admin = adminByOrg.get(org.id);
              const status = c?.status ?? "pending";
              const failures = failuresByOrg.get(org.id) ?? 0;
              return (
                <Drawer
                  key={org.id}
                  title={t("app.settings.sso.drawerTitle", { name: org.name })}
                  triggerClassName="ohd-hover"
                  triggerStyle={{
                    display: "grid",
                    gridTemplateColumns: PARK_GRID,
                    minWidth: PARK_MIN_WIDTH,
                    width: "100%",
                    minHeight: 46,
                    padding: "0 14px",
                    alignItems: "center",
                    textAlign: "left",
                    borderBottom: "1px solid var(--line-2)",
                    fontSize: 12.5,
                    ...(c && status === "error" ? { background: "var(--dang-t)" } : {}),
                  }}
                  trigger={
                    <>
                      <span>
                        <span
                          className="inline-block rounded-full"
                          style={{
                            width: 8,
                            height: 8,
                            background: c ? STATUS_DOTS[status] : "var(--line)",
                          }}
                        />
                      </span>
                      <span
                        className="truncate font-medium"
                        style={{ paddingRight: 10, color: "var(--ink)" }}
                      >
                        {org.name}
                      </span>
                      <span
                        className="truncate font-mono"
                        style={{ paddingRight: 10, fontSize: 11.5, color: "var(--ink-2)" }}
                      >
                        {orgDomains.length > 0 ? orgDomains.map((d) => d.domain).join(", ") : "—"}
                      </span>
                      <span style={{ color: "var(--ink-2)" }}>
                        {c
                          ? `${c.protocol.toUpperCase()} · ${providerLabel(t, c.provider)}`
                          : "—"}
                      </span>
                      <span>
                        {c ? (
                          <StatusPill tone={STATUS_TONES[status] ?? "closed"}>
                            {statusLabel(t, status)}
                          </StatusPill>
                        ) : (
                          <StatusPill tone="closed">{t("app.settings.sso.noSso")}</StatusPill>
                        )}
                      </span>
                      <span
                        className="text-right tabular-nums"
                        style={{ paddingRight: 12, color: "var(--ink)" }}
                      >
                        {membersByOrg.get(org.id) ?? 0}
                      </span>
                      <span className="truncate text-right" style={{ color: "var(--ink-3)" }}>
                        {admin?.contactEmail ?? "—"}
                      </span>
                    </>
                  }
                >
                  <OrgDetail
                    t={t}
                    org={org.name}
                    connection={c}
                    domains={orgDomains}
                    admin={admin ?? null}
                    failures24h={failures}
                  />
                </Drawer>
              );
            })}
          </div>
        </div>

        {/* Needs attention — hidden when there is no anomaly */}
        {attention.length > 0 && (
          <section className="flex flex-col" style={{ gap: 11 }}>
            <h2 className="font-semibold" style={{ fontSize: 14.5, color: "var(--ink)" }}>
              {t("app.settings.sso.attentionSection")}
            </h2>
            <div
              className="overflow-hidden border"
              style={{ borderRadius: 10, borderColor: "var(--wait)", background: "var(--panel)" }}
            >
              {attention.map((a, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center border-b"
                  style={{
                    gap: 12,
                    padding: "12px 15px",
                    borderColor: "var(--line-2)",
                    fontSize: 12.5,
                  }}
                >
                  <span
                    className="inline-block flex-none rounded-full"
                    style={{ width: 8, height: 8, background: `var(--${a.tone})` }}
                  />
                  <span className="font-semibold" style={{ minWidth: 130, color: "var(--ink)" }}>
                    {a.org}
                  </span>
                  <span
                    className="flex-1"
                    style={{ minWidth: 200, color: "var(--ink-2)", textWrap: "pretty" }}
                  >
                    {a.issue}
                  </span>
                  <span
                    className="whitespace-nowrap font-semibold"
                    style={{ color: `var(--${a.tone})` }}
                  >
                    {a.when}
                  </span>
                  {a.adminEmail ? (
                    <a
                      href={`mailto:${a.adminEmail}`}
                      className="whitespace-nowrap font-semibold"
                      style={{ color: "var(--acc-2)" }}
                    >
                      {t("app.settings.sso.notifyAdmin")}
                    </a>
                  ) : (
                    <span className="whitespace-nowrap" style={{ color: "var(--ink-3)" }}>
                      {t("app.settings.sso.noAdmin")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

/** Fleet table header — 10.5 px/700, height 34, sticky. */
function ParkHead({ t }: { t: Translate }) {
  return (
    <div
      className="sticky top-0 z-[2] grid items-center border-b font-bold"
      style={{
        gridTemplateColumns: PARK_GRID,
        minWidth: PARK_MIN_WIDTH,
        height: 40,
        padding: "0 14px",
        background: "var(--canvas)",
        borderColor: "var(--line)",
        fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: ".09em",
                textTransform: "uppercase",
        color: "var(--ink-3)",
      }}
    >
      <span>●</span>
      <span style={{ paddingRight: 10 }}>{t("app.settings.sso.colOrganization")}</span>
      <span style={{ paddingRight: 10 }}>{t("app.settings.sso.colDomains")}</span>
      <span>{t("app.settings.sso.fieldProtocol")}</span>
      <span>{t("app.settings.sso.fieldStatus")}</span>
      <span className="text-right" style={{ paddingRight: 12 }}>
        {t("app.settings.sso.colMembers")}
      </span>
      <span className="text-right">{t("app.settings.sso.colAdmin")}</span>
    </div>
  );
}

/** Drawer field — label 12.5/600 + frame bg --bg, hint 12 ink-3. */
function DrawerField({
  label,
  value,
  hint,
  tone,
  mono,
  tall,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "dang";
  mono?: boolean;
  tall?: boolean;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
        {label}
      </span>
      <div
        className={`flex border ${mono ? "font-mono" : ""}`}
        style={{
          minHeight: tall ? 52 : 36,
          padding: tall ? "10px 11px" : "7px 11px",
          alignItems: tall ? "flex-start" : "center",
          borderRadius: 6,
          borderColor: "var(--line)",
          background: "var(--bg)",
          fontSize: 13.5,
          lineHeight: 1.55,
          color: tone === "dang" ? "var(--dang)" : "var(--ink)",
        }}
      >
        {value}
      </div>
      {hint && (
        <span style={{ fontSize: 12, color: "var(--ink-3)", textWrap: "pretty" }}>{hint}</span>
      )}
    </div>
  );
}

/** Detail drawer — read-only, only action: disable the connection. */
function OrgDetail({
  t,
  org,
  connection,
  domains,
  admin,
  failures24h,
}: {
  t: Translate;
  org: string;
  connection?: typeof orgSsoConnections.$inferSelect;
  domains: (typeof verifiedDomains.$inferSelect)[];
  admin: { contactName: string | null; contactEmail: string } | null;
  failures24h: number;
}) {
  const status = connection
    ? connection.status === "error"
      ? t("app.settings.sso.statusErrorDetail", {
          reason: connection.lastError ?? t("app.settings.sso.statusErrorReason"),
        })
      : statusLabel(t, connection.status)
    : t("app.settings.sso.noSso");

  return (
    <div className="flex h-full flex-col" style={{ gap: 14 }}>
      <DrawerField
        label={t("app.settings.sso.fieldStatus")}
        value={status}
        tall={connection?.status === "error"}
        tone={connection?.status === "error" ? "dang" : undefined}
      />
      <DrawerField
        label={t("app.settings.sso.fieldProtocol")}
        value={
          connection
            ? `${connection.protocol.toUpperCase()} · ${providerLabel(t, connection.provider)}`
            : "—"
        }
      />
      <DrawerField
        label={t("app.settings.sso.coveredDomains")}
        mono
        value={
          domains.length > 0
            ? domains
                .map((d) =>
                  t("app.settings.sso.domainWithStatus", {
                    domain: d.domain,
                    status:
                      d.status === "verified"
                        ? t("app.settings.sso.domainVerified")
                        : d.status === "failed"
                          ? t("app.settings.sso.domainFailed")
                          : t("app.settings.sso.domainPending"),
                  }),
                )
                .join(", ")
            : "—"
        }
      />
      <DrawerField
        label={t("app.settings.sso.customerAdmin")}
        mono
        value={admin?.contactEmail ?? "—"}
        hint={
          admin
            ? t("app.settings.sso.adminHint", { name: admin.contactName ?? admin.contactEmail })
            : t("app.settings.sso.noAdminHint")
        }
      />
      <DrawerField
        label={t("app.settings.sso.failures24h")}
        value={t("app.settings.sso.attemptCount", { count: failures24h })}
        tone={failures24h > 0 ? "dang" : undefined}
      />
      <DrawerField
        label={t("app.settings.sso.secret")}
        mono
        value={connection?.secretHint ?? "—"}
        hint={
          connection?.secretExpiresAt
            ? t("app.settings.sso.secretExpires", {
                date: t.fmt.dateLong(connection.secretExpiresAt),
              })
            : undefined
        }
      />
      <DrawerField
        label={t("app.settings.sso.lastSuccess")}
        value={connection?.lastSuccessAt ? t.fmt.relative(connection.lastSuccessAt) : "—"}
      />
      {connection?.status === "error" && (
        <DrawerField
          label={t("app.settings.sso.fallbackLabel")}
          value={t("app.settings.sso.fallbackValue")}
          hint={t("app.settings.sso.fallbackHint", { org: t.fmt.of(org) })}
        />
      )}
      {connection && connection.status !== "disabled" && (
        <form
          action={disableOrgConnection}
          className="mt-auto border-t pt-3"
          style={{ borderColor: "var(--line)" }}
        >
          <input type="hidden" name="connectionId" value={connection.id} />
          <button
            type="submit"
            className="ohd-hover-edge-ink w-full rounded-[9px] border font-medium"
            style={{
              height: 38,
              fontSize: 13,
              borderColor: "var(--dang)",
              color: "var(--dang)",
              background: "var(--panel)",
            }}
          >
            {t("app.settings.sso.disableConnection")}
          </button>
        </form>
      )}
    </div>
  );
}

/** Dummy table blurred behind the locked-state veil. */
function GhostPark({ t }: { t: Translate }) {
  return (
    <div
      className="border"
      style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <ParkHead t={t} />
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="grid items-center border-b"
          style={{
            gridTemplateColumns: PARK_GRID,
            minWidth: PARK_MIN_WIDTH,
            minHeight: 46,
            padding: "0 14px",
            borderColor: "var(--line-2)",
          }}
        >
          <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: "var(--sunk)" }} />
          {[130, 120, 90, 80, 40, 100].map((w, j) => (
            <span key={j} className="inline-block rounded" style={{ width: w, height: 10, background: "var(--sunk)" }} />
          ))}
        </div>
      ))}
    </div>
  );
}
