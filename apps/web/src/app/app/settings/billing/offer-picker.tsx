"use client";

/**
 * ST-11 — offer comparator: the public plans exactly as the control plane
 * sells them (names, prices, allowances all come from the gateway; the product
 * only lays them out). Monthly/yearly toggle, seat stepper on paid plans,
 * total recomputed on the client — checkout itself stays a server action.
 */
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import type { Offer } from "@/lib/control-plane";

const GB = 1024 * 1024 * 1024;

type Props = {
  offers: Offer[];
  /** Plan id of the workspace today, as denormalised by the control plane. */
  currentPlanId: string;
  /** An active subscription changes plans in the Portal, not through Checkout. */
  subscribed: boolean;
  occupiedSeats: number;
  gatewayOk: boolean;
  checkout: (formData: FormData) => Promise<void>;
  portal: () => Promise<void>;
};

/** Rounded to the cent, in euros — fmt.number puts the locale's separator. */
function euros(cents: number): number {
  return Math.round(cents) / 100;
}

function FeatureLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-baseline" style={{ gap: 7, fontSize: 12.5 }}>
      <span
        aria-hidden
        className="font-bold"
        style={{ color: ok ? "var(--acc)" : "var(--ink-3)", width: 12 }}
      >
        {ok ? "✓" : "—"}
      </span>
      <span style={{ color: ok ? "var(--ink-2)" : "var(--ink-3)" }}>{label}</span>
    </li>
  );
}

export function OfferPicker({
  offers,
  currentPlanId,
  subscribed,
  occupiedSeats,
  gatewayOk,
  checkout,
  portal,
}: Props) {
  const t = useT();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [seats, setSeats] = useState(() => Math.max(1, occupiedSeats));

  // The yearly discount is derived from the prices, never hard-coded: the
  // control plane may change its mind and this label must follow.
  const savePct = useMemo(() => {
    const paid = offers.find((o) => o.monthlyPriceCents > 0);
    if (!paid) return 0;
    return Math.round((1 - paid.yearlyPriceCents / (paid.monthlyPriceCents * 12)) * 100);
  }, [offers]);

  if (offers.length === 0) return null;

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 10 }}>
        <p className="font-semibold" style={{ fontSize: 14.5, color: "var(--ink)" }}>
          {t("app.settings.workspace.offersTitle")}
        </p>
        {/* Month/year pill toggle */}
        <div
          className="flex items-center border"
          style={{
            borderRadius: 8,
            padding: 3,
            gap: 2,
            background: "var(--sunk)",
            borderColor: "var(--line)",
          }}
        >
          {(["month", "year"] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className="font-semibold"
              style={{
                height: 26,
                padding: "0 12px",
                borderRadius: 6,
                fontSize: 12.5,
                background: interval === iv ? "var(--panel)" : "transparent",
                color: interval === iv ? "var(--ink)" : "var(--ink-2)",
                boxShadow: interval === iv ? "0 1px 2px rgba(0,0,0,0.08)" : undefined,
              }}
            >
              {iv === "month"
                ? t("app.settings.workspace.offersMonthly")
                : t("app.settings.workspace.offersYearly")}
              {iv === "year" && savePct > 0 && (
                <span style={{ marginLeft: 5, color: "var(--acc)" }}>
                  {t("app.settings.workspace.offersYearlySave", { percent: savePct })}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}
      >
        {offers.map((offer) => {
          const ent = offer.entitlements as {
            maxAgents?: number | null;
            maxMailboxes?: number | null;
            maxStorageBytes?: number | null;
            automations?: boolean;
            sla?: boolean;
            csat?: boolean;
            reports?: boolean;
          };
          const paid = offer.monthlyPriceCents > 0;
          const current = offer.id === currentPlanId;
          /*
           * Volume pricing, not graduated: the free allowance is a threshold,
           * not a discount kept forever. Up to `includedSeats` the workspace
           * pays nothing; the seat that crosses the line makes EVERY seat
           * billable — four agents are four seats at full price, not one.
           * Stripe computes the same way (tiers_mode: "volume"), and this
           * estimate has to agree with the invoice to the cent.
           */
          const billable = paid && seats > offer.includedSeats ? seats : 0;
          const perSeatCents =
            interval === "year" ? offer.yearlyPriceCents / 12 : offer.monthlyPriceCents;
          const totalMonthlyCents = billable * perSeatCents;

          return (
            <div
              key={offer.id}
              className="flex flex-col border"
              style={{
                borderRadius: 11,
                padding: 18,
                gap: 12,
                borderColor: current ? "var(--acc-b)" : "var(--line)",
                background: current ? "var(--acc-t)" : "var(--panel)",
              }}
            >
              <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
                <span className="font-bold" style={{ fontSize: 16, color: "var(--ink)" }}>
                  {offer.name}
                </span>
                {current && (
                  <span
                    className="rounded-full font-bold"
                    style={{
                      padding: "2px 9px",
                      fontSize: 11,
                      background: "var(--panel)",
                      color: "var(--acc)",
                    }}
                  >
                    {t("app.settings.workspace.offersCurrentPlan")}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-baseline" style={{ gap: 6 }}>
                <span
                  className="whitespace-nowrap font-bold tabular-nums"
                  style={{ fontSize: 26, letterSpacing: "-0.03em", color: "var(--ink)" }}
                >
                  {t("app.settings.workspace.priceMonthly", {
                    // An amount goes through fmt.amount, not the plain number
                    // formatter: "7,2 €" reads as an unfinished price.
                    amount: t.fmt.amount(euros(totalMonthlyCents)),
                  })}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {paid && interval === "year"
                    ? t("app.settings.workspace.offersPerMonthYearly")
                    : t("app.settings.workspace.offersPerMonth")}
                </span>
              </div>

              <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                {paid
                  ? t("app.settings.workspace.offersSeatsRule", {
                      count: offer.includedSeats,
                      price: t.fmt.amount(euros(perSeatCents)),
                    })
                  : t("app.settings.workspace.offersFreeNote")}
              </p>

              {paid && (
                <div className="flex items-center" style={{ gap: 9 }}>
                  <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    {t("app.settings.workspace.offersSeats")}
                  </span>
                  <div
                    className="flex items-center border"
                    style={{
                      borderRadius: 7,
                      borderColor: "var(--line)",
                      background: "var(--panel)",
                    }}
                  >
                    <button
                      type="button"
                      aria-label={t("app.settings.workspace.offersSeatsFewer")}
                      onClick={() => setSeats((s) => Math.max(Math.max(1, occupiedSeats), s - 1))}
                      className="grid place-items-center font-bold"
                      style={{ width: 28, height: 28, fontSize: 15, color: "var(--ink-2)" }}
                    >
                      −
                    </button>
                    <span
                      className="text-center font-bold tabular-nums"
                      style={{ minWidth: 34, fontSize: 13.5, color: "var(--ink)" }}
                    >
                      {t.fmt.number(seats)}
                    </span>
                    <button
                      type="button"
                      aria-label={t("app.settings.workspace.offersSeatsMore")}
                      onClick={() => setSeats((s) => Math.min(500, s + 1))}
                      className="grid place-items-center font-bold"
                      style={{ width: 28, height: 28, fontSize: 15, color: "var(--ink-2)" }}
                    >
                      +
                    </button>
                  </div>
                  {occupiedSeats > 0 && (
                    <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                      {t("app.settings.workspace.offersSeatsOccupied", { count: occupiedSeats })}
                    </span>
                  )}
                </div>
              )}

              <ul className="flex flex-col" style={{ gap: 6, marginTop: 2 }}>
                <FeatureLine
                  ok
                  label={
                    ent.maxAgents != null
                      ? t("app.settings.workspace.offersFeatAgents", { count: ent.maxAgents })
                      : t("app.settings.workspace.offersFeatAgentsUnlimited")
                  }
                />
                <FeatureLine
                  ok
                  label={
                    ent.maxMailboxes != null
                      ? t("app.settings.workspace.offersFeatMailboxes", {
                          count: ent.maxMailboxes,
                        })
                      : t("app.settings.workspace.offersFeatMailboxesUnlimited")
                  }
                />
                <FeatureLine
                  ok
                  label={t("app.settings.workspace.offersFeatStorage", {
                    value: Math.round(((ent.maxStorageBytes ?? 0) / GB) * 10) / 10,
                  })}
                />
                <FeatureLine
                  ok={Boolean(ent.automations)}
                  label={t("app.settings.workspace.offersFeatAutomations")}
                />
                <FeatureLine
                  ok={Boolean(ent.sla)}
                  label={t("app.settings.workspace.offersFeatSla")}
                />
                <FeatureLine
                  ok={Boolean(ent.csat)}
                  label={t("app.settings.workspace.offersFeatCsat")}
                />
                <FeatureLine
                  ok={Boolean(ent.reports)}
                  label={t("app.settings.workspace.offersFeatReports")}
                />
              </ul>

              {paid &&
                (subscribed ? (
                  /* An active subscription is edited in the Customer Portal —
                     a second Checkout would stack a second subscription. */
                  <form action={portal} style={{ marginTop: "auto" }}>
                    <button
                      disabled={!gatewayOk}
                      className="ohd-hover-edge-ink grid w-full place-items-center border font-semibold disabled:opacity-50"
                      style={{
                        height: 34,
                        borderRadius: 6,
                        fontSize: 13,
                        borderColor: "var(--acc-b)",
                        background: "var(--panel)",
                        color: "var(--ink-2)",
                      }}
                    >
                      {t("app.settings.workspace.offersManageInPortal")}
                    </button>
                  </form>
                ) : (
                  <form action={checkout} style={{ marginTop: "auto" }}>
                    <input type="hidden" name="planId" value={offer.id} />
                    <input type="hidden" name="interval" value={interval} />
                    <input type="hidden" name="seats" value={seats} />
                    <button
                      disabled={!gatewayOk}
                      className="grid w-full place-items-center font-semibold disabled:opacity-50"
                      style={{
                        color: "var(--on-brand)",
                        height: 34,
                        borderRadius: 6,
                        fontSize: 13,
                        background: "var(--acc)",
                      }}
                    >
                      {t("app.settings.workspace.offersChoose", { plan: offer.name })}
                    </button>
                  </form>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
