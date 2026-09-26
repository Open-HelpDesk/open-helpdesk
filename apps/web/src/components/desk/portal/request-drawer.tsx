"use client";

/**
 * SD-E1 request drawer: licence tier, duration, justification, and the circuit
 * preview with real names — all read from `previewCircuit`, recomputed on
 * every tier change and once more, server-side, at submission. Nothing here is
 * decided by the browser: a claim such as "created in under a minute" appears
 * only when the preview says a healthy connector covers the app (doctrine 5).
 * Also serves "Extend" on My access, pre-filled with the current tier.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/client";
import { AppIcon } from "@/components/desk/app-icon";
import { previewAccessAction, submitAccessAction, type DrawerPreview } from "@/app/desk/actions";
import { useToast } from "./shell";
import { CONNECTOR_BRAND, durationLabel, money, monthly, type PortalT } from "./format";
import type { CircuitStep } from "@openhelpdesk/desk";

export type DrawerApp = {
  id: string;
  name: string;
  category: string;
  ownerName: string | null;
  iconKey: string | null;
  logoUrl: string | null;
  color: string | null;
  tiers: Array<{ id: string; name: string; monthlyCostCents: number }>;
};

export type ExpiryPolicy = {
  reminderDays: number;
  revokeOnExpiry: boolean;
  /** A9 → Access → default temporary duration: pre-selected when the tier offers it. */
  defaultDays: number;
};

export function RequestDrawer({
  app,
  expiry,
  onClose,
  extend,
}: {
  app: DrawerApp;
  expiry: ExpiryPolicy;
  onClose: () => void;
  /** Extending a temporary grant: its id, tier and a pre-filled justification. */
  extend?: { grantId: string; tierId: string; justification: string };
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [tierId, setTierId] = useState(extend?.tierId ?? app.tiers[0]?.id ?? "");
  const [duration, setDuration] = useState<number | null | undefined>(undefined);
  const [why, setWhy] = useState(extend?.justification ?? "");
  const [data, setData] = useState<DrawerPreview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!tierId) return;
    let live = true;
    setData(null);
    setLoadError(false);
    previewAccessAction(app.id, tierId).then((res) => {
      if (!live) return;
      if (res.ok) setData(res.data);
      else setLoadError(true);
    });
    return () => {
      live = false;
    };
  }, [app.id, tierId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // The page behind a drawer must not scroll with it (phones especially).
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const preview = data?.preview ?? null;
  const durations = preview?.durations ?? [];
  // A new request on an app that offers permanent access starts on permanent.
  // Otherwise the access is temporary by nature (a capped app, an extension):
  // the workspace's default temporary duration when offered, else the first
  // bounded one.
  const temporary = extend || !durations.includes(null);
  const fallback = !temporary
    ? null
    : durations.includes(expiry.defaultDays)
      ? expiry.defaultDays
      : (durations.find((d) => d != null) ?? durations[0]);
  const dur = duration !== undefined && durations.includes(duration) ? duration : (fallback ?? null);
  const auto = preview ? preview.effectiveLevels === 0 : false;
  const firstStep = preview?.steps[0]?.step;

  const submit = () => {
    if (!preview) return;
    if (preview.justificationRequired && !why.trim()) {
      setFormError(t("desk.portal.drawer.whyMissing"));
      return;
    }
    setFormError(null);
    start(async () => {
      const res = await submitAccessAction({
        appId: app.id,
        tierId,
        durationDays: dur,
        justification: why,
        extendsGrantId: extend?.grantId ?? null,
      });
      if (!res.ok) {
        setFormError(errorMessage(t, res.error));
        return;
      }
      if (res.state === "awaiting_manager" || res.state === "awaiting_owner" || res.state === "awaiting_extra") {
        toast(
          res.firstApprover
            ? t("desk.portal.toast.sentTo", { name: res.firstApprover, number: String(res.ticketNumber) })
            : t("desk.portal.toast.sent", { number: String(res.ticketNumber) }),
        );
      } else {
        toast(res.automatic ? t("desk.portal.toast.autoCreating", { app: app.name }) : t("desk.portal.toast.autoManual", { app: app.name }));
      }
      onClose();
      router.push("/desk/mine");
      router.refresh();
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={app.name}>
      <div className="absolute inset-0" style={{ background: "var(--scrim-drawer)" }} onClick={onClose} />
      <div
        className="sd-slide relative flex h-full w-[460px] max-w-full flex-col"
        style={{ background: "var(--panel)", boxShadow: "-24px 0 48px -24px rgb(13 28 23 / 35%)" }}
      >
        <div className="flex items-center gap-3 border-b px-5 pb-4 pt-5" style={{ borderColor: "var(--line)" }}>
          <AppIcon name={app.name} iconKey={app.iconKey} logoUrl={app.logoUrl} color={app.color} size={44} />
          <div className="min-w-0 flex-1">
            <div className="sd-title text-[19px] leading-tight">{app.name}</div>
            <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {app.ownerName
                ? t("desk.portal.drawer.categoryOwner", { category: app.category, name: app.ownerName })
                : app.category}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("desk.portal.drawer.close")}
            className="grid h-[34px] w-[34px] place-items-center rounded-[9px] text-[18px] hover:bg-[var(--sunk)]"
            style={{ color: "var(--ink-3)" }}
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-[22px] overflow-auto p-5">
          {extend && (
            <div className="rounded-[10px] px-3.5 py-2.5 text-[13px]" style={{ background: "var(--open-t)", color: "var(--open)" }}>
              {t("desk.portal.drawer.extendNote")}
            </div>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
              {t("desk.portal.drawer.tier")}
            </legend>
            {app.tiers.map((tier) => {
              const on = tier.id === tierId;
              return (
                <label
                  key={tier.id}
                  className="flex cursor-pointer items-center gap-[11px] rounded-[11px] px-3.5 py-3"
                  style={{ border: `1.5px solid ${on ? "var(--brand)" : "var(--line)"}`, background: on ? "var(--brand-t)" : "var(--panel)" }}
                >
                  <input type="radio" name="tier" className="sr-only" checked={on} onChange={() => setTierId(tier.id)} />
                  <span
                    className="grid h-4 w-4 flex-none place-items-center rounded-full"
                    style={{ border: `1.5px solid ${on ? "var(--brand)" : "var(--line)"}` }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: on ? "var(--brand)" : "transparent" }} />
                  </span>
                  <span className="flex-1 text-[14px] font-semibold">{tier.name}</span>
                  <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                    {monthly(t, tier.monthlyCostCents)}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
              {t("desk.portal.drawer.duration")}
            </div>
            <div className="flex rounded-[10px] p-[3px]" style={{ background: "var(--sunk)", minHeight: 40 }} role="radiogroup">
              {durations.map((d) => {
                const on = d === dur;
                return (
                  <button
                    key={String(d)}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setDuration(d)}
                    className="flex-1 rounded-lg py-2 text-center text-[13px] font-semibold"
                    style={{
                      background: on ? "var(--panel)" : "transparent",
                      color: on ? "var(--ink)" : "var(--ink-2)",
                      boxShadow: on ? "0 1px 2px rgba(13,28,23,.1)" : "none",
                    }}
                  >
                    {durationLabel(t, d)}
                  </button>
                );
              })}
            </div>
            {dur != null && (
              <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                {t(expiry.revokeOnExpiry ? "desk.portal.drawer.revokeNote" : "desk.portal.drawer.expiryNote", {
                  date: t.fmt.dateShort(new Date(Date.now() + dur * 86_400_000)),
                  count: expiry.reminderDays,
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="sd-why" className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
              {!preview || preview.justificationRequired
                ? firstStep === "manager" || !preview
                  ? t("desk.portal.drawer.whyManager")
                  : t("desk.portal.drawer.whyApprovers")
                : t("desk.portal.drawer.comment")}
            </label>
            <textarea
              id="sd-why"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder={t("desk.portal.drawer.whyPlaceholder")}
              className="sd-input min-h-[96px] resize-none px-[13px] py-[11px] text-[14px] leading-[1.45]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
              {t("desk.portal.drawer.circuit")}
            </div>
            {loadError && <Notice tone="dang">{t("desk.portal.drawer.previewFailed")}</Notice>}
            {!preview && !loadError && (
              <div className="h-[104px] animate-pulse rounded-xl" style={{ background: "var(--sunk)" }} />
            )}
            {preview && data && <Circuit t={t} data={data} />}
            {preview && (
              <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                {t("desk.portal.drawer.notified")}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t px-5 py-3.5" style={{ borderColor: "var(--line)" }}>
          {formError && (
            <div className="text-[13px] font-medium" style={{ color: "var(--dang)" }} role="alert">
              {formError}
            </div>
          )}
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="sd-btn sd-btn-ghost h-[42px] text-[14px]">
              {t("desk.portal.drawer.cancel")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!preview || !!preview.blocked || pending}
              className="sd-btn sd-btn-primary h-[42px] px-5 text-[14px]"
            >
              {auto ? t("desk.portal.drawer.activate") : t("desk.portal.drawer.send")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Notice({ tone, children }: { tone: "ok" | "wait" | "dang"; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] px-3.5 py-[11px] text-[13px] font-medium"
      style={{ background: `var(--${tone}-t)`, color: `var(--${tone})` }}
    >
      {children}
    </div>
  );
}

function roleOf(t: PortalT, s: CircuitStep, names: Record<string, string>): string {
  const merged = s.mergedSteps.includes("manager") && s.mergedSteps.includes("owner");
  let role: string;
  if (merged) role = t("desk.portal.drawer.roleManagerOwner");
  else if (s.step === "manager") role = t("desk.portal.drawer.roleManager");
  else if (s.step === "owner") role = t("desk.portal.drawer.roleOwner");
  else if (s.step === "privileged") role = t("desk.portal.drawer.rolePrivileged");
  else role = t("desk.portal.drawer.roleFinance");
  const behalf = s.onBehalfOfPersonId ? names[s.onBehalfOfPersonId] : null;
  return behalf ? t("desk.portal.drawer.onBehalf", { role, name: behalf }) : role;
}

function Circuit({ t, data }: { t: PortalT; data: DrawerPreview }) {
  const { preview, names } = data;
  const rows: Array<{ n: string; name: string; role: string }> = preview.steps.map((s, i) => ({
    n: String(i + 1),
    name: s.approverPersonId ? (names[s.approverPersonId] ?? "—") : t("desk.portal.drawer.nobody"),
    role: roleOf(t, s, names),
  }));
  const kind = preview.provisioning.kind;
  rows.push(
    preview.provisioning.automatic && kind !== "manual"
      ? {
          n: "→",
          name: t("desk.portal.drawer.provAuto"),
          role: t("desk.portal.drawer.provAutoWhen", { connector: CONNECTOR_BRAND[kind] }),
        }
      : { n: "→", name: t("desk.portal.drawer.provManual"), role: t("desk.portal.drawer.provManualWhen") },
  );
  const budget = preview.budget;
  return (
    <>
      {preview.effectiveLevels === 0 && (
        <Notice tone="ok">
          {preview.autoRule?.startsWith("group:") && data.autoGroupName
            ? t("desk.portal.drawer.autoGroup", { group: data.autoGroupName })
            : t("desk.portal.drawer.autoLevel0")}
        </Notice>
      )}
      {preview.sodConflict && (
        <Notice tone="dang">{t("desk.portal.drawer.sod", { reason: preview.sodConflict.reason })}</Notice>
      )}
      {budget && budget.overCents > 0 && (
        <Notice tone={budget.mode === "block" ? "dang" : "wait"}>
          {t(
            budget.mode === "block"
              ? "desk.portal.drawer.budgetBlock"
              : budget.mode === "finance"
                ? "desk.portal.drawer.budgetFinance"
                : "desk.portal.drawer.budgetAlert",
            { department: budget.department, amount: money(t, budget.overCents) },
          )}
        </Notice>
      )}
      {preview.blocked && !preview.sodConflict && !(budget && budget.mode === "block" && budget.overCents > 0) && (
        <Notice tone="dang">
          {preview.steps.some((s) => !s.approverPersonId)
            ? t("desk.portal.drawer.blockedNoApprover")
            : t("desk.portal.drawer.blocked")}
        </Notice>
      )}
      <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)" }}>
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3.5 py-[11px]"
            style={{ borderTop: i ? "1px solid var(--line-2)" : undefined }}
          >
            <span
              className="grid h-6 w-6 flex-none place-items-center rounded-full text-[11.5px] font-bold"
              style={{ background: "var(--sunk)", color: "var(--ink-2)" }}
            >
              {r.n}
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold">{r.name}</div>
              <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                {r.role}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function errorMessage(t: PortalT, error: string): string {
  switch (error) {
    case "justification":
      return t("desk.portal.drawer.whyMissing");
    case "blocked":
      return t("desk.portal.drawer.blocked");
    case "withdrawn":
      return t("desk.portal.approvals.withdrawn");
    case "decided":
      return t("desk.portal.approvals.alreadyDecided");
    case "empty":
      return t("desk.portal.error.empty");
    case "not_yours":
      return t("desk.portal.error.notYours");
    case "invalid_date":
      return t("desk.portal.absence.errorDate");
    case "delegate":
      return t("desk.portal.absence.errorDelegate");
    default:
      return t("desk.portal.error.generic");
  }
}
