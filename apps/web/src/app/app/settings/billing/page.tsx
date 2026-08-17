import { requireAgent } from "@/lib/session";
import { attachments, db, tickets, users } from "@openhelpdesk/db";
import { and, count, eq, gte, isNull, ne, sum } from "drizzle-orm";
import {
  PLAN_LABELS,
  STORAGE_QUOTA_BYTES,
  entitlementsFor,
  planIdOf,
  seatQuota,
} from "@/lib/entitlements";
import {
  Card,
  Gauge,
  GridHead,
  PageHeader,
  PageShell,
  StatusPill,
} from "@/components/settings-page";

const INVOICE_GRID = "150px minmax(180px,1fr) 130px 130px 110px";

function gbFr(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
}

/**
 * ST-11 — Abonnement & facturation (1040 px) : carte plan réelle (tenant.plan),
 * consommation réelle (sièges, tickets du mois, stockage), historique des
 * factures (état vide — offre cloud).
 */
export default async function BillingPage() {
  const { tenant } = await requireAgent();
  const planId = planIdOf(tenant.plan);
  const ent = entitlementsFor(tenant.plan);
  const quota = seatQuota(ent);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [[seatRow], [ticketRow], [storageRow]] = await Promise.all([
    db
      .select({ n: count() })
      .from(users)
      .where(
        and(eq(users.tenantId, tenant.id), eq(users.status, "active"), ne(users.role, "viewer")),
      ),
    db
      .select({ n: count() })
      .from(tickets)
      .where(
        and(
          eq(tickets.tenantId, tenant.id),
          isNull(tickets.deletedAt),
          gte(tickets.createdAt, monthStart),
        ),
      ),
    db
      .select({ total: sum(attachments.sizeBytes) })
      .from(attachments)
      .where(eq(attachments.tenantId, tenant.id)),
  ]);

  const seats = seatRow?.n ?? 0;
  const monthTickets = ticketRow?.n ?? 0;
  const storageBytes = Number(storageRow?.total ?? 0);

  const plan = PLAN_LABELS[planId];

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        code="ST-11"
        title="Abonnement & facturation"
        subtitle="Plan, sièges, quotas, moyen de paiement et historique des factures."
      />

      {/* Carte plan */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold" style={{ fontSize: 16, color: "var(--ink)" }}>
                {plan.name}
              </p>
              <StatusPill tone="acc">AUTO-HÉBERGÉ</StatusPill>
            </div>
            <p className="mt-0.5" style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {plan.priceLine}
            </p>
            <p className="mt-0.5" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              Free · Standard 12 €/siège · Pro 39 €/siège — facturation gérée sur l'offre cloud.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled
              title="Disponible sur l'offre cloud"
              className="rounded-md border px-3 font-medium disabled:opacity-50"
              style={{
                height: 32,
                fontSize: 13,
                borderColor: "var(--line)",
                background: "var(--panel)",
                color: "var(--ink)",
              }}
            >
              Changer de plan
            </button>
            <button
              disabled
              title="Disponible sur l'offre cloud"
              className="rounded-md border px-3 font-medium disabled:opacity-50"
              style={{
                height: 32,
                fontSize: 13,
                borderColor: "var(--line)",
                background: "var(--panel)",
                color: "var(--ink)",
              }}
            >
              Gérer les sièges
            </button>
          </div>
        </div>
      </Card>

      {/* Consommation */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Card title="Sièges">
          <p className="font-semibold" style={{ fontSize: 18, color: "var(--ink)" }}>
            {seats} <span style={{ fontSize: 13, color: "var(--ink-3)" }}>/ {quota}</span>
          </p>
          <p className="mb-2" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Les rôles Viewer sont gratuits et illimités.
          </p>
          <Gauge value={seats} max={quota} width="100%" />
        </Card>
        <Card title="Tickets ce mois-ci">
          <p className="font-semibold" style={{ fontSize: 18, color: "var(--ink)" }}>
            {monthTickets.toLocaleString("fr-FR")}{" "}
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>/ illimité</span>
          </p>
          <p className="mb-2" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Aucune limite de volume sur tous les plans.
          </p>
          <Gauge value={Math.min(monthTickets, 100)} max={Math.max(monthTickets * 2, 100)} width="100%" />
        </Card>
        <Card title="Stockage">
          <p className="font-semibold" style={{ fontSize: 18, color: "var(--ink)" }}>
            {gbFr(storageBytes)}{" "}
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>/ {gbFr(STORAGE_QUOTA_BYTES)}</span>
          </p>
          <p className="mb-2" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Pièces jointes des tickets.
          </p>
          <Gauge value={storageBytes} max={STORAGE_QUOTA_BYTES} width="100%" />
        </Card>
      </div>

      {/* Historique des factures */}
      <Card title="Historique des factures">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 700 }}>
            <GridHead
              template={INVOICE_GRID}
              columns={["N°", "Période", "Montant", "Statut", ""]}
            />
            <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
              Les factures apparaîtront ici sur l'offre cloud.
            </p>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
