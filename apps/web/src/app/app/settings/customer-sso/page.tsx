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
  LockedScreen,
  PageHeader,
  PageShell,
  PlanProBadge,
  StatusPill,
} from "@/components/settings-page";
import { Drawer } from "@/components/settings-overlays";
import { disableOrgConnection, toggleSsoDelegation } from "./actions";

const PARK_GRID = "26px minmax(160px,1.2fr) minmax(150px,1fr) 130px 130px 100px 150px";
const PARK_MIN_WIDTH = 980;
const DAY = 24 * 3600 * 1000;

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending: "À vérifier",
  error: "Erreur",
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
  disabled: "var(--ink-3)",
};
const PROVIDER_LABELS: Record<string, string> = {
  entra: "Entra ID",
  google: "Google",
  okta: "Okta",
  generic: "Générique",
};

/** Chip de filtre / bouton de la barre : min-h 30, padding 5/11, radius 6, 12,5 px. */
const CHIP: React.CSSProperties = {
  minHeight: 30,
  padding: "5px 11px",
  borderRadius: 6,
  fontSize: 12.5,
  whiteSpace: "nowrap",
};

/** « depuis 4 h », « depuis 12 j ». */
function sinceFr(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  if (diff < 3600_000) return `depuis ${Math.max(1, Math.floor(diff / 60_000))} min`;
  if (diff < DAY) return `depuis ${Math.floor(diff / 3600_000)} h`;
  return `depuis ${Math.floor(diff / DAY)} j`;
}

/** « dans 11 j ». */
function inFr(date: Date, now: Date = new Date()): string {
  const days = Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY));
  return days <= 1 ? "dans moins de 24 h" : `dans ${days} j`;
}

/**
 * ST-14 — SSO des organisations clientes (1180 px, EE). Délégation réelle, 4
 * compteurs (bordure et valeur colorées quand non nuls), recherche + filtres,
 * table du parc (ligne cliquable → drawer lecture seule) puis « Attention requise ».
 */
export default async function CustomerSsoPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { tenant } = await requireAgent();
  const ent = entitlementsFor(tenant.plan);
  const { filter, q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

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
      label: "Connexions actives",
      value: connections.filter((c) => c.status === "active").length,
      meta: `sur ${orgs.length} organisation${orgs.length > 1 ? "s" : ""}`,
      tone: "ok",
    },
    {
      label: "En attente de vérification",
      value: connections.filter((c) => c.status === "pending").length,
      meta: "domaine non validé depuis plus de 7 jours",
      tone: "wait",
    },
    {
      label: "En erreur",
      value: connections.filter((c) => c.status === "error").length,
      meta: "échecs de connexion sur les dernières 24 h",
      tone: "dang",
    },
    {
      label: "Secrets expirant",
      value: expiring.length,
      meta: "dans les 30 prochains jours",
      tone: "wait",
    },
  ];

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
  if (query) {
    parkOrgs = parkOrgs.filter(
      (o) =>
        o.name.toLowerCase().includes(query) ||
        (domainsByOrg.get(o.id) ?? []).some((d) => d.domain.toLowerCase().includes(query)),
    );
  }

  // Attention requise : connexions en erreur, domaines non vérifiés, secrets expirant.
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
    attention.push({
      org: org.name,
      issue:
        (c.lastError ?? "Échecs de connexion répétés") +
        (blocked > 0 ? ` — ${blocked} tentative${blocked > 1 ? "s" : ""} sur 24 h` : ""),
      when: sinceFr(c.updatedAt, now),
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
      issue: `Domaine ${d.domain} non vérifié — enregistrement TXT absent`,
      when: sinceFr(d.createdAt, now),
      tone: "wait",
      adminEmail: adminByOrg.get(org.id)?.contactEmail,
    });
  }
  for (const c of expiring) {
    const org = orgById.get(c.organizationId);
    if (!org || !c.secretExpiresAt) continue;
    attention.push({
      org: org.name,
      issue: "Secret client expirant",
      when: inFr(c.secretExpiresAt, now),
      tone: "wait",
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

      <div className="st-rise flex flex-col" style={{ gap: 20 }}>
        {/* Délégation */}
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
              className="relative block rounded-full"
              style={{
                width: 34,
                height: 20,
                background: tenant.ssoDelegationEnabled ? "var(--acc)" : "var(--line)",
              }}
              title={tenant.ssoDelegationEnabled ? "Désactiver" : "Activer"}
            >
              <span
                className="absolute rounded-full bg-white"
                style={{
                  top: 2,
                  width: 16,
                  height: 16,
                  left: tenant.ssoDelegationEnabled ? 16 : 2,
                  boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                  transition: "left .15s ease",
                }}
              />
            </button>
          </form>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center" style={{ gap: 9 }}>
              <span className="font-semibold" style={{ fontSize: 13.5, color: "var(--ink)" }}>
                Autoriser les organisations à configurer leur propre SSO
              </span>
              <PlanProBadge />
            </div>
            <p style={{ fontSize: 12.5, color: "var(--ink-2)", textWrap: "pretty" }}>
              Un contact désigné administrateur configure la connexion depuis le portail. Vous
              gardez la supervision et pouvez désactiver n'importe quelle connexion.
            </p>
          </div>
        </div>

        {/* 4 compteurs */}
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

        {/* Recherche + filtres */}
        <div className="flex flex-wrap items-center" style={{ gap: 7 }}>
          <form
            className="flex min-w-0 flex-1"
            style={{ minWidth: 200, maxWidth: 300 }}
          >
            {filter && <input type="hidden" name="filter" value={filter} />}
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Rechercher une organisation ou un domaine…"
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
                className="flex items-center border"
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
            title="Disponible prochainement"
            className="grid place-items-center border disabled:opacity-50"
            style={{
              ...CHIP,
              borderColor: "var(--line)",
              background: "var(--panel)",
              color: "var(--ink-2)",
            }}
          >
            Export CSV
          </button>
        </div>

        {/* Table du parc */}
        <div
          className="overflow-x-auto border"
          style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div style={{ minWidth: PARK_MIN_WIDTH }}>
            <ParkHead />
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
                <Drawer
                  key={org.id}
                  title={`${org.name} — connexion SSO`}
                  triggerClassName="st-row"
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

        {/* Attention requise — masqué si aucune anomalie */}
        {attention.length > 0 && (
          <section className="flex flex-col" style={{ gap: 11 }}>
            <h2 className="font-semibold" style={{ fontSize: 14.5, color: "var(--ink)" }}>
              Attention requise
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
                      Prévenir l'admin
                    </a>
                  ) : (
                    <span className="whitespace-nowrap" style={{ color: "var(--ink-3)" }}>
                      Aucun admin désigné
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

/** En-tête de la table du parc — 10,5 px/700, hauteur 34, collant. */
function ParkHead() {
  return (
    <div
      className="sticky top-0 z-[2] grid items-center border-b font-bold"
      style={{
        gridTemplateColumns: PARK_GRID,
        minWidth: PARK_MIN_WIDTH,
        height: 34,
        padding: "0 14px",
        background: "var(--sunk)",
        borderColor: "var(--line)",
        fontSize: 10.5,
        color: "var(--ink-3)",
      }}
    >
      <span>●</span>
      <span style={{ paddingRight: 10 }}>Organisation</span>
      <span style={{ paddingRight: 10 }}>Domaines</span>
      <span>Protocole</span>
      <span>Statut</span>
      <span className="text-right" style={{ paddingRight: 12 }}>
        Membres
      </span>
      <span className="text-right">Administrateur</span>
    </div>
  );
}

/** Champ du drawer — libellé 12,5/600 + cadre bg --bg, hint 12 ink-3. */
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

/** Drawer de détail — lecture seule, seule action : Désactiver la connexion. */
function OrgDetail({
  org,
  connection,
  domains,
  admin,
  failures24h,
}: {
  org: string;
  connection?: typeof orgSsoConnections.$inferSelect;
  domains: (typeof verifiedDomains.$inferSelect)[];
  admin: { contactName: string | null; contactEmail: string } | null;
  failures24h: number;
}) {
  const statusLabel = connection
    ? connection.status === "error"
      ? `Erreur — ${connection.lastError ?? "échecs de connexion répétés"}`
      : (STATUS_LABELS[connection.status] ?? connection.status)
    : "Sans SSO";

  return (
    <div className="flex h-full flex-col" style={{ gap: 14 }}>
      <DrawerField
        label="Statut"
        value={statusLabel}
        tall={connection?.status === "error"}
        tone={connection?.status === "error" ? "dang" : undefined}
      />
      <DrawerField
        label="Protocole"
        value={
          connection
            ? `${connection.protocol.toUpperCase()} · ${PROVIDER_LABELS[connection.provider] ?? connection.provider}`
            : "—"
        }
      />
      <DrawerField
        label="Domaines couverts"
        mono
        value={
          domains.length > 0
            ? domains
                .map(
                  (d) =>
                    `${d.domain} (${d.status === "verified" ? "vérifié" : d.status === "failed" ? "échec" : "en attente"})`,
                )
                .join(", ")
            : "—"
        }
      />
      <DrawerField
        label="Administrateur côté client"
        mono
        value={admin?.contactEmail ?? "—"}
        hint={
          admin
            ? `${admin.contactName ?? admin.contactEmail} — configuré depuis le portail. Seul cet administrateur peut corriger la connexion.`
            : "Aucun contact n'est administrateur de cette organisation."
        }
      />
      <DrawerField
        label="Échecs sur 24 h"
        value={`${failures24h} tentative${failures24h > 1 ? "s" : ""}`}
        tone={failures24h > 0 ? "dang" : undefined}
      />
      <DrawerField
        label="Secret"
        mono
        value={connection?.secretHint ?? "—"}
        hint={
          connection?.secretExpiresAt
            ? `Expire le ${connection.secretExpiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`
            : undefined
        }
      />
      <DrawerField
        label="Dernière connexion réussie"
        value={connection?.lastSuccessAt ? relativeFr(connection.lastSuccessAt) : "—"}
      />
      {connection?.status === "error" && (
        <DrawerField
          label="Repli pendant la panne"
          value="Lien par email réactivé automatiquement"
          hint={`Les contacts de ${org} peuvent continuer à accéder à leurs demandes le temps de la correction.`}
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
            className="w-full rounded-md border font-medium"
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
      className="border"
      style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <ParkHead />
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
