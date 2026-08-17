import { requireAgent } from "@/lib/session";
import { attachments, db, tickets, users } from "@openhelpdesk/db";
import { and, count, eq, gte, isNull, ne, sum } from "drizzle-orm";
import { nFr } from "@/lib/format";
import {
  PLAN_LABELS,
  STORAGE_QUOTA_BYTES,
  entitlementsFor,
  planIdOf,
  seatQuota,
} from "@/lib/entitlements";
import { PageHeader, PageShell } from "@/components/settings-page";

const INVOICE_GRID = "150px minmax(180px,1fr) 130px 130px 110px";

/** Prix mensuel par siège et par plan (ST-11). */
const SEAT_PRICE: Record<string, number> = { free: 0, standard: 12, pro: 39 };

/** Volume mensuel de référence de la jauge « illimité » (indicatif, aucun plafond). */
const TICKETS_SCALE = 10_000;

function gbFr(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
}

/** Ligne de consommation : libellé + valeur + jauge 7 px (orange au-delà de 85 %). */
function QuotaRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  const warn = pct > 85;
  return (
    <div className="flex flex-col" style={{ gap: 5 }}>
      <div className="flex justify-between" style={{ fontSize: 12.5 }}>
        <span style={{ color: "var(--ink-2)" }}>{label}</span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: warn ? "var(--wait)" : "var(--ink)" }}
        >
          {value}
        </span>
      </div>
      <div
        className="overflow-hidden"
        style={{ height: 7, borderRadius: 4, background: "var(--sunk)" }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, pct))}%`,
            borderRadius: 4,
            background: warn ? "var(--wait)" : "var(--acc)",
          }}
        />
      </div>
    </div>
  );
}

/**
 * ST-11 — Abonnement & facturation (1040 px) : carte plan accentuée (prix mensuel,
 * sièges), carte « Consommation du mois » (3 jauges réelles) et historique des
 * factures (état vide — la facturation vit sur l'offre cloud).
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
  const seatPrice = SEAT_PRICE[planId] ?? 0;
  const monthly = seatPrice * quota;
  const seatLine =
    seatPrice > 0
      ? `par mois · ${quota} sièges à ${seatPrice} €`
      : `par mois · ${quota} sièges inclus`;

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        title="Abonnement & facturation"
        subtitle="Plan, sièges, quotas, moyen de paiement et historique des factures."
      />

      <div className="st-rise flex flex-col" style={{ gap: 20 }}>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}
        >
          {/* Carte plan */}
          <div
            className="flex flex-col border"
            style={{
              borderRadius: 11,
              padding: 18,
              gap: 13,
              borderColor: "var(--acc-b)",
              background: "var(--acc-t)",
            }}
          >
            <div className="flex items-baseline" style={{ gap: 9 }}>
              <span
                className="font-bold"
                style={{ fontSize: 18, letterSpacing: "-0.02em", color: "var(--ink)" }}
              >
                {plan.name}
              </span>
              <span
                className="rounded-full font-bold"
                style={{
                  padding: "2px 9px",
                  fontSize: 11.5,
                  background: "var(--panel)",
                  color: "var(--acc)",
                }}
              >
                AUTO-HÉBERGÉ
              </span>
            </div>
            <div className="flex flex-wrap items-baseline" style={{ gap: 6 }}>
              <span
                className="whitespace-nowrap font-bold tabular-nums"
                style={{ fontSize: 30, letterSpacing: "-0.03em", color: "var(--ink)" }}
              >
                {nFr(monthly)} €
              </span>
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{seatLine}</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              Aucune échéance sur cette instance — la facturation est gérée sur l'offre cloud.
            </p>
            <div className="flex" style={{ gap: 8, marginTop: 2 }}>
              <button
                disabled
                title="Disponible sur l'offre cloud"
                className="grid place-items-center font-semibold text-white disabled:opacity-50"
                style={{
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  background: "var(--acc)",
                  whiteSpace: "nowrap",
                }}
              >
                Changer de plan
              </button>
              <button
                disabled
                title="Disponible sur l'offre cloud"
                className="grid place-items-center border font-semibold disabled:opacity-50"
                style={{
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  borderColor: "var(--acc-b)",
                  background: "var(--panel)",
                  color: "var(--ink-2)",
                  whiteSpace: "nowrap",
                }}
              >
                Gérer les sièges
              </button>
            </div>
          </div>

          {/* Consommation du mois */}
          <div
            className="flex flex-col border"
            style={{
              borderRadius: 11,
              padding: 18,
              gap: 14,
              borderColor: "var(--line)",
              background: "var(--panel)",
            }}
          >
            <p className="font-semibold" style={{ fontSize: 14, color: "var(--ink)" }}>
              Consommation du mois
            </p>
            <QuotaRow
              label="Sièges"
              value={`${seats} / ${quota}`}
              pct={quota > 0 ? (seats / quota) * 100 : 0}
            />
            <QuotaRow
              label="Tickets ce mois"
              value={`${nFr(monthTickets)} / illimité`}
              pct={(monthTickets / TICKETS_SCALE) * 100}
            />
            <QuotaRow
              label="Stockage"
              value={`${gbFr(storageBytes)} / ${gbFr(STORAGE_QUOTA_BYTES)}`}
              pct={(storageBytes / STORAGE_QUOTA_BYTES) * 100}
            />
          </div>
        </div>

        {/* Historique des factures */}
        <div className="flex flex-col" style={{ gap: 11 }}>
          <p className="font-semibold" style={{ fontSize: 14.5, color: "var(--ink)" }}>
            Historique des factures
          </p>
          <div
            className="overflow-x-auto border"
            style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <div style={{ minWidth: 720 }}>
              <div
                className="grid items-center border-b font-bold"
                style={{
                  gridTemplateColumns: INVOICE_GRID,
                  height: 34,
                  padding: "0 14px",
                  background: "var(--sunk)",
                  borderColor: "var(--line)",
                  fontSize: 11,
                  color: "var(--ink-3)",
                }}
              >
                <span>Numéro</span>
                <span>Période</span>
                <span className="text-right">Montant</span>
                <span className="text-right">Statut</span>
                <span className="text-right" />
              </div>
              <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                Aucune facture — les factures apparaîtront ici sur l'offre cloud.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
