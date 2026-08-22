import { notFound } from "next/navigation";
import { isSelfHosted } from "@openhelpdesk/config";
import { requireAgent } from "@/lib/session";
import { attachments, db, tickets } from "@openhelpdesk/db";
import { and, count, eq, gte, isNull, sum } from "drizzle-orm";
import { getT, type Translate } from "@/i18n/server";
import {
  billingOf,
  entitlementsFor,
  occupiedSeats,
  planDisplayName,
  planIdOf,
  seatLimitFor,
} from "@/lib/entitlements";
import { PageHeader, PageShell } from "@/components/settings-page";
import { gatewayConfigured } from "@/lib/cloud-gateway";
import { goCheckout, goPortal } from "./actions";

const INVOICE_GRID = "150px minmax(180px,1fr) 130px 130px 110px";

/**
 * Prix mensuel de repli par siège quand l'abonnement n'est pas encore
 * dénormalisé (essai) — Team se facture à partir du 4ᵉ agent (paliers Stripe).
 */
const SEAT_PRICE: Record<string, number> = { free: 0, team: 9, enterprise: 19 };

/** Volume en gigaoctets, arrondi au dixieme. */
function gbLabel(t: Translate, bytes: number): string {
  const gb = Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10;
  return t("app.settings.workspace.gigabytes", { value: gb });
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
  // ST-11 est cloud uniquement : invisible en auto-hébergé (specs/11 § ST-11).
  if (isSelfHosted()) notFound();

  const t = await getT();
  const { tenant } = await requireAgent();
  const planId = planIdOf(tenant.plan);
  const ent = entitlementsFor(tenant);
  const billing = billingOf(tenant);
  const seatLimit = seatLimitFor(tenant);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [seats, [ticketRow], [storageRow]] = await Promise.all([
    occupiedSeats(tenant.id),
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

  const monthTickets = ticketRow?.n ?? 0;
  const storageBytes = Number(storageRow?.total ?? 0);

  const planName = planDisplayName(tenant, t);
  // Abonnement dénormalisé par le control plane ; repli sur la grille publique
  // (essai ou tenant pas encore facturé). Team : 3 premiers sièges inclus.
  const seatPrice = billing.seatPriceCents != null ? billing.seatPriceCents / 100 : (SEAT_PRICE[planId] ?? 0);
  const billedSeats = billing.seats ?? Math.max(0, seats - (planId === "team" ? 3 : 0));
  const monthly = planId === "free" ? 0 : seatPrice * billedSeats;
  const seatLine =
    monthly > 0
      ? t("app.settings.workspace.seatPricing", { count: billedSeats, price: seatPrice })
      : t("app.settings.workspace.seatsIncluded", { count: Math.max(seats, 1) });

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        title={t("app.settings.workspace.billingTitle")}
        subtitle={t("app.settings.workspace.billingSubtitle")}
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
                {planName}
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
                {tenant.status === "trial"
                  ? t("app.settings.workspace.trialBadge")
                  : planName}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline" style={{ gap: 6 }}>
              <span
                className="whitespace-nowrap font-bold tabular-nums"
                style={{ fontSize: 30, letterSpacing: "-0.03em", color: "var(--ink)" }}
              >
                {t("app.settings.workspace.priceMonthly", { amount: monthly })}
              </span>
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{seatLine}</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {t("app.settings.workspace.billingNoDue")}
            </p>
            {/* Les sessions Stripe viennent de la gateway privée : sans elle
                (dev, control plane éteint), les boutons restent inertes. */}
            <div className="flex" style={{ gap: 8, marginTop: 2 }}>
              <form action={goCheckout}>
                <button
                  disabled={!gatewayConfigured()}
                  title={gatewayConfigured() ? undefined : t("app.settings.workspace.cloudOnly")}
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
                  {t("app.settings.workspace.changePlan")}
                </button>
              </form>
              <form action={goPortal}>
                <button
                  disabled={!gatewayConfigured()}
                  title={gatewayConfigured() ? undefined : t("app.settings.workspace.cloudOnly")}
                  className="ohd-hover-edge-ink grid place-items-center border font-semibold disabled:opacity-50"
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
                  {t("app.settings.workspace.manageSeats")}
                </button>
              </form>
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
              {t("app.settings.workspace.usageTitle")}
            </p>
            <QuotaRow
              label={t("app.settings.workspace.quotaSeats")}
              value={seatLimit != null ? `${seats} / ${seatLimit}` : `${seats}`}
              pct={seatLimit != null && seatLimit > 0 ? (seats / seatLimit) * 100 : 0}
            />
            <QuotaRow
              label={t("app.settings.workspace.quotaTickets")}
              value={t("app.settings.workspace.quotaTicketsValue", { tickets: monthTickets })}
              pct={0}
            />
            <QuotaRow
              label={t("app.settings.workspace.quotaStorage")}
              value={
                ent.maxStorageBytes != null
                  ? `${gbLabel(t, storageBytes)} / ${gbLabel(t, ent.maxStorageBytes)}`
                  : gbLabel(t, storageBytes)
              }
              pct={ent.maxStorageBytes != null ? (storageBytes / ent.maxStorageBytes) * 100 : 0}
            />
          </div>
        </div>

        {/* Historique des factures */}
        <div className="flex flex-col" style={{ gap: 11 }}>
          <p className="font-semibold" style={{ fontSize: 14.5, color: "var(--ink)" }}>
            {t("app.settings.workspace.invoicesTitle")}
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
                <span>{t("app.settings.workspace.colNumber")}</span>
                <span>{t("app.settings.workspace.colPeriod")}</span>
                <span className="text-right">{t("app.settings.workspace.colAmount")}</span>
                <span className="text-right">{t("app.settings.workspace.colStatus")}</span>
                <span className="text-right" />
              </div>
              <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                {t("app.settings.workspace.invoicesEmpty")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
