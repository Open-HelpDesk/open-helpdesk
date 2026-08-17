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
import { entitlementsFor } from "@/lib/entitlements";
import { relativeFr } from "@/lib/format";
import {
  Card,
  GridHead,
  LockedScreen,
  PageHeader,
  PageShell,
  PlanProBadge,
  StatusPill,
} from "@/components/settings-page";
import { Drawer } from "@/components/settings-overlays";
import { disableOrgConnection, toggleSsoDelegation } from "./actions";

const PARK_GRID = "26px minmax(160px,1.2fr) minmax(150px,1fr) 130px 130px 100px 150px";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending: "En attente",
  error: "En erreur",
  disabled: "Désactivée",
};
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
  disabled: "var(--closed)",
};
const PROVIDER_LABELS: Record<string, string> = {
  entra: "Entra",
  google: "Google",
  okta: "Okta",
  generic: "Générique",
};

/**
 * ST-14 — SSO des organisations clientes (1180 px, EE). Interrupteur de délégation
 * réel, 4 compteurs réels, filtres, table du parc, bloc « Attention requise »
 * (certificats / domaines en échec), drawer lecture seule avec action Désactiver.
 */
export default async function CustomerSsoPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { tenant } = await requireAgent();
  const ent = entitlementsFor(tenant.plan);
  const { filter } = await searchParams;

  const header = (
    <PageHeader
      code="ST-14"
      title="SSO des organisations clientes"
      subtitle="Chaque organisation cliente connecte son propre fournisseur d'identité depuis le portail. Vous supervisez ici l'ensemble du parc."
    />
  );

  if (!ent.customerSso) {
    return (
      <PageShell maxWidth={1180}>
        {header}
        <LockedScreen
          title="Le SSO des organisations clientes est réservé au plan Pro"
          text="Laissez chaque organisation cliente brancher son propre fournisseur d'identité (SAML ou OIDC) et supervisez l'ensemble du parc depuis cet écran."
          ghost={<GhostPark />}
        />
      </PageShell>
    );
  }

  const in24h = new Date(Date.now() - 24 * 3600 * 1000);
  const in30d = new Date(Date.now() + 30 * 24 * 3600 * 1000);

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

  const stats = {
    active: connections.filter((c) => c.status === "active").length,
    pending: connections.filter((c) => c.status === "pending").length,
    error: connections.filter((c) => c.status === "error").length,
    expiring: connections.filter(
      (c) => c.secretExpiresAt && c.secretExpiresAt <= in30d && c.secretExpiresAt >= new Date(),
    ).length,
  };

  // Parc : organisations ayant une connexion OU des domaines vérifiés.
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

  // Attention requise : connexions en erreur + domaines en échec.
  const attention: { org: string; orgId: string; issue: string; adminEmail?: string }[] = [];
  for (const c of connections) {
    if (c.status !== "error") continue;
    const org = orgs.find((o) => o.id === c.organizationId);
    if (!org) continue;
    attention.push({
      org: org.name,
      orgId: org.id,
      issue: c.lastError ?? "Échecs de connexion répétés",
      adminEmail: adminByOrg.get(org.id)?.contactEmail,
    });
  }
  for (const d of domains) {
    if (d.status !== "failed") continue;
    const org = orgs.find((o) => o.id === d.organizationId);
    if (!org) continue;
    attention.push({
      org: org.name,
      orgId: org.id,
      issue: `Vérification du domaine ${d.domain} en échec`,
      adminEmail: adminByOrg.get(org.id)?.contactEmail,
    });
  }

  const filters = [
    { key: "", label: "Toutes" },
    { key: "error", label: "En erreur" },
    { key: "pending", label: "À vérifier" },
    { key: "none", label: "Sans SSO" },
  ];

  return (
    <PageShell maxWidth={1180}>
      {header}

      {/* Délégation */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold" style={{ fontSize: 14, color: "var(--ink)" }}>
                Délégation SSO aux organisations clientes
              </p>
              <PlanProBadge />
            </div>
            <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              Les administrateurs d'organisation configurent leur connexion depuis le portail.
              Le lien magique par email reste le repli en cas de panne.
            </p>
          </div>
          <form action={toggleSsoDelegation}>
            <button
              type="submit"
              role="switch"
              aria-checked={tenant.ssoDelegationEnabled}
              className="relative rounded-full"
              style={{
                width: 34,
                height: 20,
                background: tenant.ssoDelegationEnabled ? "var(--acc)" : "var(--line)",
              }}
              title={tenant.ssoDelegationEnabled ? "Désactiver" : "Activer"}
            >
              <span
                className="absolute rounded-full bg-white transition-all"
                style={{ top: 2, width: 16, height: 16, left: tenant.ssoDelegationEnabled ? 16 : 2 }}
              />
            </button>
          </form>
        </div>
      </Card>

      {/* 4 compteurs */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <StatCard label="Actives" value={stats.active} sub={`sur ${orgs.length} organisations`} tone="ok" />
        <StatCard
          label="En attente"
          value={stats.pending}
          sub="domaine non validé depuis plus de 7 jours"
          tone="wait"
        />
        <StatCard
          label="En erreur"
          value={stats.error}
          sub="échecs de connexion sur les dernières 24 h"
          tone="dang"
        />
        <StatCard
          label="Secrets expirant"
          value={stats.expiring}
          sub="dans les 30 prochains jours"
          tone="wait"
        />
      </div>

      {/* Attention requise — masqué si aucune anomalie */}
      {attention.length > 0 && (
        <Card danger title="Attention requise">
          <div className="flex flex-col gap-2">
            {attention.map((a, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                style={{ borderColor: "var(--dang-t)", background: "var(--dang-t)" }}
              >
                <span className="font-semibold" style={{ fontSize: 13, color: "var(--ink)" }}>
                  {a.org}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12.5, color: "var(--dang)" }}>
                  {a.issue}
                </span>
                {a.adminEmail ? (
                  <a
                    href={`mailto:${a.adminEmail}`}
                    className="rounded-md border px-2 py-1 font-medium"
                    style={{
                      fontSize: 12,
                      borderColor: "var(--dang)",
                      color: "var(--dang)",
                      background: "var(--bg)",
                    }}
                  >
                    Prévenir l'admin
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Aucun admin désigné</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const active = (filter ?? "") === f.key;
          return (
            <Link
              key={f.key}
              href={`/app/settings/customer-sso${f.key ? `?filter=${f.key}` : ""}`}
              className="rounded-full border font-medium"
              style={{
                fontSize: 12.5,
                padding: "4px 12px",
                borderColor: active ? "var(--acc)" : "var(--line)",
                background: active ? "var(--acc-t)" : "var(--panel)",
                color: active ? "var(--acc)" : "var(--ink)",
              }}
            >
              {f.label}
            </Link>
          );
        })}
        <span className="flex-1" />
        <button
          disabled
          title="Disponible prochainement"
          className="rounded-md border px-3 font-medium disabled:opacity-50"
          style={{
            height: 30,
            fontSize: 12.5,
            borderColor: "var(--line)",
            background: "var(--panel)",
            color: "var(--ink)",
          }}
        >
          Export CSV
        </button>
      </div>

      {/* Table du parc */}
      <div
        className="overflow-x-auto rounded-[10px] border"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div style={{ minWidth: 1000 }}>
          <GridHead
            template={PARK_GRID}
            columns={["", "Organisation", "Domaines", "Protocole", "Statut", "Membres", "Administrateur"]}
          />
          {parkOrgs.length === 0 && (
            <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
              Aucune organisation n'a encore configuré de connexion
            </p>
          )}
          {parkOrgs.map((org) => {
            const c = connectionByOrg.get(org.id);
            const orgDomains = domainsByOrg.get(org.id) ?? [];
            const admin = adminByOrg.get(org.id);
            const status = c?.status ?? "pending";
            const failures = failuresByOrg.get(org.id) ?? 0;
            return (
              <div
                key={org.id}
                className="grid items-center gap-3 border-t"
                style={{
                  gridTemplateColumns: PARK_GRID,
                  padding: "10px 14px",
                  borderColor: "var(--line-2)",
                  background: status === "error" ? "var(--dang-t)" : "transparent",
                }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 8, height: 8, background: c ? STATUS_DOTS[status] : "var(--line)" }}
                />
                <span className="min-w-0">
                  <Drawer
                    title={org.name}
                    trigger={<>{org.name}</>}
                    triggerClassName="truncate text-left font-semibold"
                    triggerStyle={{ fontSize: 13, color: "var(--ink)" }}
                  >
                    <OrgDetail
                      org={org.name}
                      connection={c}
                      domains={orgDomains}
                      adminName={admin?.contactName ?? null}
                      failures24h={failures}
                    />
                  </Drawer>
                </span>
                <span className="truncate font-mono" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
                  {orgDomains.length > 0 ? orgDomains.map((d) => d.domain).join(", ") : "—"}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink)" }}>
                  {c
                    ? `${c.protocol.toUpperCase()} · ${PROVIDER_LABELS[c.provider] ?? c.provider}`
                    : "—"}
                </span>
                <span>
                  {c ? (
                    <StatusPill tone={STATUS_TONES[status] ?? "closed"}>
                      {STATUS_LABELS[status] ?? status}
                    </StatusPill>
                  ) : (
                    <StatusPill tone="closed">Sans SSO</StatusPill>
                  )}
                </span>
                <span className="font-mono tabular-nums" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                  {membersByOrg.get(org.id) ?? 0}
                </span>
                <span className="truncate" style={{ fontSize: 12.5, color: admin ? "var(--ink)" : "var(--ink-3)" }}>
                  {admin?.contactName ?? admin?.contactEmail ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "ok" | "wait" | "dang";
}) {
  return (
    <Card>
      <p
        className="font-mono font-bold uppercase"
        style={{ fontSize: 10.5, letterSpacing: "0.07em", color: "var(--ink-3)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 font-semibold tabular-nums"
        style={{ fontSize: 22, color: value > 0 ? `var(--${tone})` : "var(--ink)" }}
      >
        {value}
      </p>
      <p style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</p>
    </Card>
  );
}

/** Drawer de détail — lecture seule, seule action : Désactiver la connexion. */
function OrgDetail({
  org,
  connection,
  domains,
  adminName,
  failures24h,
}: {
  org: string;
  connection?: typeof orgSsoConnections.$inferSelect;
  domains: (typeof verifiedDomains.$inferSelect)[];
  adminName: string | null;
  failures24h: number;
}) {
  const rows: [string, React.ReactNode][] = [
    [
      "Domaines",
      domains.length > 0
        ? domains.map((d) => `${d.domain} (${d.status === "verified" ? "vérifié" : d.status === "failed" ? "échec" : "en attente"})`).join(", ")
        : "—",
    ],
    [
      "Protocole",
      connection
        ? `${connection.protocol.toUpperCase()} · ${PROVIDER_LABELS[connection.provider] ?? connection.provider}`
        : "—",
    ],
    ["Statut", connection ? (STATUS_LABELS[connection.status] ?? connection.status) : "Sans SSO"],
    ["Dernier succès", connection?.lastSuccessAt ? relativeFr(connection.lastSuccessAt) : "—"],
    ["Secret", connection?.secretHint ?? "—"],
    [
      "Expiration du secret",
      connection?.secretExpiresAt
        ? connection.secretExpiresAt.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "—",
    ],
    ["Administrateur", adminName ?? "—"],
    ["Échecs sur 24 h", `${failures24h} tentative${failures24h > 1 ? "s" : ""}`],
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
        Configuration gérée par l'organisation depuis son portail — lecture seule ici.
      </p>
      <div className="flex flex-col gap-1.5">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start gap-2 rounded-md border px-3 py-2"
            style={{ borderColor: "var(--line-2)", background: "var(--sunk)" }}
          >
            <span className="w-36 shrink-0 font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {label}
            </span>
            <span className="min-w-0" style={{ fontSize: 12.5, color: "var(--ink)" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
      {connection?.status === "error" && (
        <div
          className="rounded-md border px-3 py-2"
          style={{ borderColor: "var(--dang)", background: "var(--dang-t)" }}
        >
          <p style={{ fontSize: 12.5, color: "var(--dang)" }}>
            {connection.lastError ?? "Échecs de connexion répétés."}
          </p>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Repli : lien par email réactivé automatiquement pour les contacts de {org}.
          </p>
        </div>
      )}
      {connection && connection.status !== "disabled" && (
        <form action={disableOrgConnection} className="mt-auto border-t pt-3" style={{ borderColor: "var(--line)" }}>
          <input type="hidden" name="connectionId" value={connection.id} />
          <button
            type="submit"
            className="w-full rounded-md border px-3 font-medium"
            style={{
              height: 32,
              fontSize: 13,
              borderColor: "var(--dang)",
              color: "var(--dang)",
              background: "var(--panel)",
            }}
          >
            Désactiver la connexion
          </button>
        </form>
      )}
    </div>
  );
}

/** Table factice floutée derrière le voile de l'état verrouillé. */
function GhostPark() {
  return (
    <div
      className="rounded-[10px] border"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <GridHead
        template={PARK_GRID}
        columns={["", "Organisation", "Domaines", "Protocole", "Statut", "Membres", "Administrateur"]}
      />
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-3 border-t"
          style={{ gridTemplateColumns: PARK_GRID, padding: "11px 14px", borderColor: "var(--line-2)" }}
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
