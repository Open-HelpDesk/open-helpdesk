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
  seatLimitFor,
  subscriptionLabel,
} from "@/lib/entitlements";
import { PageHeader, PageShell } from "@/components/settings-page";
import { fetchInvoices, fetchOffers, gatewayConfigured } from "@/lib/control-plane";
import { goCheckout, goPortal, goRecheck } from "./actions";
import { OfferPicker } from "./offer-picker";

const INVOICE_GRID = "150px minmax(180px,1fr) 130px 130px 110px";

/** Volume in gigabytes, rounded to the nearest tenth. */
function gbLabel(t: Translate, bytes: number): string {
  const gb = Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10;
  return t("app.settings.workspace.gigabytes", { value: gb });
}

/** Usage row: label + value + 7 px gauge (orange above 85%). */
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
 * ST-11 — Subscription & billing (1040 px): accented plan card (monthly price,
 * seats), "Usage this month" card (3 real gauges) and invoice history
 * (empty state — billing lives on the cloud plan).
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkout?: string;
    error?: string;
    recheck?: string;
    seats?: string;
    maxSeats?: string;
    mailboxes?: string;
    maxMailboxes?: string;
  }>;
}) {
  // ST-11 needs a control plane: invisible when self-hosted.
  if (isSelfHosted()) notFound();

  const t = await getT();
  const { tenant } = await requireAgent();
  const params = await searchParams;
  const { checkout, error, recheck } = params;
  const ent = entitlementsFor(tenant);
  const billing = billingOf(tenant);
  const seatLimit = seatLimitFor(tenant);

  const suspendedUnpaid = tenant.status === "suspended" && Boolean(billing.dunningDeadline);
  // A suspension that is not about money is about size: the owner can shrink
  // the workspace (team, mailboxes stay unlocked) and ask for a re-check.
  const suspendedOverLimits = tenant.status === "suspended" && !suspendedUnpaid;

  // The screen is where the owner lands to act: it must SAY what just
  // happened (checkout return, gateway failure) and what state the workspace
  // is in (trial deadline, suspension and its cause) — silence here left the
  // owner in front of a zen screen while their workspace was locked.
  const notice: { tone: "ok" | "dang" | "muted"; text: string } | null =
    checkout === "success"
      ? { tone: "ok", text: t("app.settings.workspace.checkoutSuccess") }
      : checkout === "cancelled"
        ? { tone: "muted", text: t("app.settings.workspace.checkoutCancelled") }
        : recheck === "ok"
          ? { tone: "ok", text: t("app.settings.workspace.recheckReactivated") }
          : recheck === "over"
            ? {
                tone: "dang",
                text: t("app.settings.workspace.recheckStillOver", {
                  seats: Number(params.seats) || 0,
                  maxSeats: Number(params.maxSeats) || 0,
                  mailboxes: Number(params.mailboxes) || 0,
                  maxMailboxes: Number(params.maxMailboxes) || 0,
                }),
              }
            : error === "gateway"
              ? { tone: "dang", text: t("app.settings.workspace.billingGatewayError") }
              : error === "owner"
                ? { tone: "dang", text: t("app.settings.workspace.billingOwnerOnly") }
                : tenant.status === "suspended"
                  ? {
                      tone: "dang",
                      text: suspendedUnpaid
                        ? t("app.settings.workspace.billingSuspendedUnpaid")
                        : t("app.settings.workspace.billingSuspendedTrial"),
                    }
                  : null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [seats, offers, invoices, [ticketRow], [storageRow]] = await Promise.all([
    occupiedSeats(tenant.id),
    fetchOffers(),
    fetchInvoices(tenant.slug),
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

  // Everything comes from the control plane: the product has no price grid and no
  // calculation rule. Included seats are subtracted from the amount due — without
  // that information nothing is billable, and the screen shows it as such.
  const label = subscriptionLabel(tenant);
  const seatPrice = (billing.seatPriceCents ?? 0) / 100;
  const billedSeats = Math.max(0, (billing.seats ?? 0) - (billing.includedSeats ?? 0));
  const monthly = seatPrice * billedSeats;
  // Without a subscription, the honest seat line is the PLAN's allowance, not
  // the occupied count ("1 seat included" on a Free plan that includes 3 read
  // as a limit the tenant did not have).
  const seatLine =
    monthly > 0
      ? t("app.settings.workspace.seatPricing", {
          count: billedSeats,
          // An amount keeps its two decimals: "9 €" is fine, "7,2 €" is not.
          price: t.fmt.amount(seatPrice),
        })
      : billing.seats != null
        ? // Paid subscription still inside the included tier (e.g. 1 seat on
          // graduated pricing): the included allowance, not a trial wording.
          t("app.settings.workspace.seatsIncluded", {
            count: billing.includedSeats ?? billing.seats,
          })
        : ent.maxAgents != null
          ? t("app.settings.workspace.seatsIncluded", { count: ent.maxAgents })
          : t("app.settings.workspace.billingTrialSeats");

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        title={t("app.settings.workspace.billingTitle")}
        subtitle={t("app.settings.workspace.billingSubtitle")}
      />

      {notice && (
        <p
          className="rounded-md border px-3.5 py-2.5"
          style={{
            fontSize: 13,
            background:
              notice.tone === "ok"
                ? "var(--ok-t)"
                : notice.tone === "dang"
                  ? "var(--dang-t)"
                  : "var(--sunk)",
            borderColor:
              notice.tone === "ok"
                ? "var(--acc-b)"
                : notice.tone === "dang"
                  ? "var(--dang)"
                  : "var(--line)",
            color:
              notice.tone === "ok"
                ? "var(--ok)"
                : notice.tone === "dang"
                  ? "var(--dang)"
                  : "var(--ink-2)",
          }}
        >
          {notice.text}
        </p>
      )}

      {suspendedOverLimits && (
        /* The other exit from suspension: shrink instead of paying. Team and
           email settings stay reachable while suspended precisely for this —
           the owner reduces there, then asks for the re-check here. */
        <div
          className="flex flex-col border"
          style={{
            borderRadius: 11,
            padding: 16,
            gap: 10,
            borderColor: "var(--line)",
            background: "var(--panel)",
          }}
        >
          <p className="font-semibold" style={{ fontSize: 13.5, color: "var(--ink)" }}>
            {t("app.settings.workspace.recheckPanelTitle")}
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {t("app.settings.workspace.recheckPanelText", {
              seats: ent.maxAgents ?? 3,
              mailboxes: ent.maxMailboxes ?? 1,
            })}
          </p>
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <a
              href="/app/settings/team"
              className="ohd-hover-edge-ink grid place-items-center border font-semibold"
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 6,
                fontSize: 12.5,
                borderColor: "var(--line)",
                background: "var(--panel)",
                color: "var(--ink-2)",
              }}
            >
              {t("app.settingsNav.itemTeam")}
            </a>
            <a
              href="/app/settings/email"
              className="ohd-hover-edge-ink grid place-items-center border font-semibold"
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 6,
                fontSize: 12.5,
                borderColor: "var(--line)",
                background: "var(--panel)",
                color: "var(--ink-2)",
              }}
            >
              {t("app.settingsNav.itemEmail")}
            </a>
            <form action={goRecheck}>
              <button
                disabled={!gatewayConfigured()}
                title={
                  gatewayConfigured()
                    ? undefined
                    : t("app.settings.workspace.requiresControlPlane")
                }
                className="grid place-items-center font-semibold text-white disabled:opacity-50"
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 6,
                  fontSize: 12.5,
                  background: "var(--acc)",
                }}
              >
                {t("app.settings.workspace.recheckCta")}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="st-rise flex flex-col" style={{ gap: 20 }}>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}
        >
          {/* Plan card */}
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
                {label ?? t("app.settings.workspace.subscriptionNone")}
              </span>
              {tenant.status === "trial" && (
                <span
                  className="rounded-full font-bold"
                  style={{
                    padding: "2px 9px",
                    fontSize: 11.5,
                    background: "var(--panel)",
                    color: "var(--acc)",
                  }}
                >
                  {t("app.settings.workspace.trialBadge")}
                </span>
              )}
              {billing.cancelAtPeriodEnd && (
                /* The Portal cancellation is scheduled, not immediate: the
                   subscription runs to the period end — say so here, or the
                   screen looks identical to a healthy one until it flips. */
                <span
                  className="rounded-full font-bold"
                  style={{
                    padding: "2px 9px",
                    fontSize: 11.5,
                    background: "var(--panel)",
                    color: "var(--wait)",
                  }}
                >
                  {t("app.settings.workspace.cancelScheduledBadge")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline" style={{ gap: 6 }}>
              <span
                className="whitespace-nowrap font-bold tabular-nums"
                style={{ fontSize: 30, letterSpacing: "-0.03em", color: "var(--ink)" }}
              >
                {t("app.settings.workspace.priceMonthly", { amount: t.fmt.amount(monthly) })}
              </span>
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{seatLine}</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {tenant.status === "trial" && tenant.trialEndsAt
                ? t("app.settings.workspace.billingTrialUntil", {
                    date: t.fmt.dateLong(tenant.trialEndsAt),
                  })
                : billing.currentPeriodEnd
                  ? t(
                      billing.cancelAtPeriodEnd
                        ? "app.settings.workspace.billingEndsOn"
                        : "app.settings.workspace.billingNextDue",
                      { date: t.fmt.dateLong(new Date(billing.currentPeriodEnd)) },
                    )
                  : t("app.settings.workspace.billingNoDue")}
            </p>
            {/* Stripe sessions come from the private gateway: without it
                (dev, control plane off), the buttons stay inert. */}
            <div className="flex" style={{ gap: 8, marginTop: 2 }}>
              <form action={goCheckout}>
                <button
                  disabled={!gatewayConfigured()}
                  title={gatewayConfigured() ? undefined : t("app.settings.workspace.requiresControlPlane")}
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
                  {t("app.settings.workspace.changeSubscription")}
                </button>
              </form>
              <form action={goPortal}>
                <button
                  disabled={!gatewayConfigured()}
                  title={gatewayConfigured() ? undefined : t("app.settings.workspace.requiresControlPlane")}
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

          {/* Usage this month */}
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

        {/* Offer comparator — everything on it (names, prices, allowances)
            comes from the control plane; nothing to show without one. */}
        <OfferPicker
          offers={offers}
          currentPlanId={tenant.plan ?? "free"}
          subscribed={billing.seats != null}
          occupiedSeats={seats}
          gatewayOk={gatewayConfigured()}
          checkout={goCheckout}
          portal={goPortal}
        />

        {/* Invoice history */}
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
              {invoices.length === 0 ? (
                <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                  {t("app.settings.workspace.invoicesEmpty")}
                </p>
              ) : (
                invoices.map((inv, i) => {
                  // The status wording is ours; the state itself is the
                  // provider's, and an unknown one is shown verbatim rather
                  // than mapped onto a reassuring label.
                  const statusLabel =
                    inv.status === "paid"
                      ? t("app.settings.workspace.invoicePaid")
                      : inv.status === "open"
                        ? t("app.settings.workspace.invoiceOpen")
                        : inv.status === "void" || inv.status === "uncollectible"
                          ? t("app.settings.workspace.invoiceVoid")
                          : inv.status;
                  const paid = inv.status === "paid";
                  const issued = inv.issuedAt ? new Date(inv.issuedAt) : null;
                  return (
                    <div
                      key={inv.number ?? String(i)}
                      className="grid items-center"
                      style={{
                        gridTemplateColumns: INVOICE_GRID,
                        minHeight: 42,
                        padding: "0 14px",
                        fontSize: 12.5,
                        borderTop: i === 0 ? undefined : "1px solid var(--line)",
                      }}
                    >
                      <span className="truncate font-mono" style={{ color: "var(--ink-2)" }}>
                        {inv.number ?? "—"}
                      </span>
                      <span style={{ color: "var(--ink-2)" }}>
                        {issued ? t.fmt.dateLong(issued) : "—"}
                      </span>
                      <span
                        className="text-right font-semibold tabular-nums"
                        style={{ color: "var(--ink)" }}
                      >
                        {t("app.settings.workspace.priceAmount", {
                          amount: t.fmt.amount(inv.amountCents / 100),
                        })}
                      </span>
                      <span
                        className="text-right font-semibold"
                        style={{ color: paid ? "var(--ok)" : "var(--wait)" }}
                      >
                        {statusLabel}
                      </span>
                      <span className="text-right">
                        {inv.pdfUrl ? (
                          <a
                            href={inv.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold underline"
                            style={{ color: "var(--acc-2)" }}
                          >
                            {t("app.settings.workspace.invoicePdf")}
                          </a>
                        ) : null}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
