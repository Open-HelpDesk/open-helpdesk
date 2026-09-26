"use client";

/**
 * SD-E2 — My access: requests in flight with their step timeline, the apps
 * held (return, extend a temporary grant), and the hardware assigned (report
 * a problem → a ticket for IT).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { AppIcon } from "@/components/desk/app-icon";
import type { CatalogueApp, MyAccess, MyGrant, MyHardware, MyRequest, TimelineStep } from "@/lib/desk/portal-data";
import { cancelRequestAction, reportHardwareAction, returnAccessAction } from "@/app/desk/actions";
import { RequestDrawer, errorMessage, type ExpiryPolicy } from "./request-drawer";
import { useToast } from "./shell";
import { Modal } from "./modal";
import {
  CONNECTOR_BRAND,
  day,
  durationLabel,
  monthYear,
  stateLabel,
  stateTone,
  stepLabel,
  type PortalT,
} from "./format";

export function MyAccessView({
  data,
  apps,
  expiry,
}: {
  data: MyAccess;
  /** Catalogue entries, for the "extend" drawer. */
  apps: CatalogueApp[];
  expiry: ExpiryPolicy;
}) {
  const t = useT();
  const [extending, setExtending] = useState<{ grant: MyGrant; app: CatalogueApp } | null>(null);
  const [returning, setReturning] = useState<MyGrant | null>(null);
  const [reporting, setReporting] = useState<MyHardware | null>(null);

  return (
    <div className="sd-rise flex flex-col gap-[30px]">
      <div>
        <h1 className="sd-title text-[28px] max-sm:text-[23px]">{t("desk.portal.mine.title")}</h1>
        <p className="mt-1 text-[14.5px]" style={{ color: "var(--ink-2)" }}>
          {t("desk.portal.mine.intro")}
        </p>
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="sd-eyebrow">{t("desk.portal.mine.pending")}</h2>
        {data.requests.length === 0 ? (
          <div className="rounded-[14px] p-[18px] text-[13.5px]" style={{ background: "var(--panel)", border: "1px dashed var(--line)", color: "var(--ink-3)" }}>
            {t("desk.portal.mine.pendingEmpty")}
          </div>
        ) : (
          data.requests.map((r) => <RequestCard key={r.id} r={r} />)
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="sd-eyebrow">{t("desk.portal.mine.apps")}</h2>
        {data.grants.length === 0 ? (
          <div className="rounded-[14px] p-[18px] text-[13.5px]" style={{ background: "var(--panel)", border: "1px dashed var(--line)", color: "var(--ink-3)" }}>
            {t("desk.portal.mine.appsEmpty")}
          </div>
        ) : (
          <div className="sd-card overflow-hidden">
            {data.grants.map((g, i) => {
              const app = apps.find((a) => a.id === g.appId);
              return (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                  style={{ borderTop: i ? "1px solid var(--line-2)" : undefined }}
                >
                  <AppIcon name={g.appName} iconKey={g.iconKey} logoUrl={g.logoUrl} color={g.color} size={34} />
                  <div className="min-w-[160px] flex-1">
                    <div className="text-[14px] font-semibold">{g.appName}</div>
                    <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      {t("desk.portal.mine.since", { tier: g.tierName, date: monthYear(t, new Date(g.grantedAt)) })}
                    </div>
                  </div>
                  {g.expiresOn && (
                    <span className="whitespace-nowrap rounded-full px-[9px] py-[2.5px] text-[11.5px] font-semibold" style={{ background: "var(--wait-t)", color: "var(--wait)" }}>
                      {t("desk.portal.mine.expires", { date: t.fmt.dateShort(day(g.expiresOn)) })}
                    </span>
                  )}
                  {g.canExtend && app && (
                    <button type="button" className="sd-link px-1 py-1.5 text-[12.5px]" onClick={() => setExtending({ grant: g, app })}>
                      {t("desk.portal.mine.extend")}
                    </button>
                  )}
                  <button type="button" className="sd-quiet px-1 py-1.5 text-[12.5px]" onClick={() => setReturning(g)}>
                    {t("desk.portal.mine.return")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="sd-eyebrow">{t("desk.portal.mine.hardware")}</h2>
        {data.hardware.length === 0 ? (
          <div className="rounded-[14px] p-[18px] text-[13.5px]" style={{ background: "var(--panel)", border: "1px dashed var(--line)", color: "var(--ink-3)" }}>
            {t("desk.portal.mine.hardwareEmpty")}
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {data.hardware.map((h) => (
              <div key={h.id} className="sd-card flex flex-col gap-1 p-4">
                <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {h.type}
                </div>
                <div className="text-[15px] font-semibold">{h.model}</div>
                <div className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                  <span className="sd-mono">{h.tag}</span>
                  {h.warrantyEndsOn && (
                    <>
                      {" · "}
                      {day(h.warrantyEndsOn).getTime() < Date.now()
                        ? t("desk.portal.mine.warrantyExpired")
                        : t("desk.portal.mine.warranty", { date: monthYear(t, day(h.warrantyEndsOn)) })}
                    </>
                  )}
                </div>
                <button type="button" className="sd-link mt-2 self-start text-[12.5px]" onClick={() => setReporting(h)}>
                  {t("desk.portal.mine.report")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {extending && (
        <RequestDrawer
          app={extending.app}
          expiry={expiry}
          onClose={() => setExtending(null)}
          extend={{
            grantId: extending.grant.id,
            tierId: extending.grant.tierId,
            justification: t("desk.portal.mine.extendWhy", {
              date: t.fmt.dateShort(day(extending.grant.expiresOn ?? new Date().toISOString())),
            }),
          }}
        />
      )}
      {returning && <ReturnModal grant={returning} onClose={() => setReturning(null)} />}
      {reporting && <ReportModal hw={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
}

function RequestCard({ r }: { r: MyRequest }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const tone = stateTone(r.state);
  const created = new Date(r.createdAt);
  const when =
    created.toDateString() === new Date().toDateString()
      ? t("desk.portal.mine.requestedToday", { time: created.toLocaleTimeString(t.locale.tag, { hour: "2-digit", minute: "2-digit" }) })
      : t("desk.portal.mine.requestedOn", { date: t.fmt.dateShort(created) });

  const cancel = () =>
    start(async () => {
      const res = await cancelRequestAction(r.id);
      setConfirm(false);
      if (!res.ok) return toast(errorMessage(t, res.error ?? "generic"));
      toast(t("desk.portal.toast.cancelled", { number: String(r.ticketNumber) }));
      router.refresh();
    });

  return (
    <div className="sd-card flex flex-col gap-[18px] px-5 py-[18px] max-sm:px-4">
      <div className="flex flex-wrap items-center gap-3">
        <AppIcon name={r.appName} iconKey={r.iconKey} logoUrl={r.logoUrl} color={r.color} size={36} />
        <div className="min-w-[200px] flex-1">
          <div className="text-[15px] font-semibold">{t("desk.portal.appTier", { app: r.appName, tier: r.tierName })}</div>
          <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            <span className="sd-mono">#{r.ticketNumber}</span> · {when} · {durationLabel(t, r.durationDays)}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold"
          style={{ background: tone.bg, color: tone.c }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.c }} />
          {stateLabel(t, r.state)}
        </span>
        {r.canCancel && (
          <button type="button" className="sd-quiet px-0.5 py-1 text-[12.5px] font-semibold" onClick={() => setConfirm(true)}>
            {t("desk.portal.mine.cancel")}
          </button>
        )}
      </div>
      <Timeline t={t} r={r} />
      {confirm && (
        <Modal title={t("desk.portal.mine.cancelTitle")} onClose={() => setConfirm(false)}>
          <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
            {t("desk.portal.mine.cancelBody", { app: r.appName })}
          </p>
          <div className="flex justify-end gap-2.5">
            <button type="button" className="sd-btn sd-btn-ghost" onClick={() => setConfirm(false)}>
              {t("desk.portal.mine.keep")}
            </button>
            <button type="button" className="sd-btn sd-btn-danger" disabled={pending} onClick={cancel}>
              {t("desk.portal.mine.cancelConfirm")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const DOT: Record<TimelineStep["state"], { bg: string; ink: string; bd: string }> = {
  done: { bg: "var(--brand)", ink: "var(--on-brand)", bd: "var(--brand)" },
  current: { bg: "var(--wait-t)", ink: "var(--wait)", bd: "var(--wait)" },
  todo: { bg: "var(--panel)", ink: "var(--ink-3)", bd: "var(--line)" },
  refused: { bg: "var(--dang-t)", ink: "var(--dang)", bd: "var(--dang)" },
  cancelled: { bg: "var(--sunk)", ink: "var(--ink-3)", bd: "var(--line)" },
};

function Timeline({ t, r }: { t: PortalT; r: MyRequest }) {
  const steps = r.steps;
  return (
    <ol className="flex max-sm:flex-col max-sm:gap-0">
      {steps.map((s, i) => {
        const d = DOT[s.state];
        const mark = s.state === "done" ? "✓" : s.state === "current" ? "•" : s.state === "todo" ? String(i + 1) : "✕";
        const next = steps[i + 1];
        const lineOn = s.state === "done" && next != null && next.state !== "todo";
        const label =
          s.kind === "created"
            ? t("desk.portal.timeline.created")
            : s.kind === "provisioning"
              ? t("desk.portal.timeline.provisioning")
              : s.kind === "active"
                ? t("desk.portal.timeline.active")
                : stepLabel(t, s.kind, s.merged);
        let sub = "";
        if (s.kind === "created" && s.at) sub = t.fmt.messageTime(new Date(s.at));
        else if (s.kind === "provisioning")
          sub = r.provisioning === "manual" ? t("desk.portal.timeline.itTeam") : t("desk.portal.timeline.via", { connector: CONNECTOR_BRAND[r.provisioning] });
        else if (s.kind !== "active") sub = s.who ?? "—";
        if (s.state === "refused" && s.who) sub = t("desk.portal.timeline.refusedBy", { name: s.who });
        return (
          <li key={i} className="flex min-w-0 flex-1 flex-col gap-[7px] max-sm:flex-row max-sm:gap-3">
            <div className="flex items-center max-sm:flex-col">
              <span
                className="grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-bold"
                style={{ background: d.bg, color: d.ink, border: `1.5px solid ${d.bd}` }}
                aria-hidden
              >
                {mark}
              </span>
              {i < steps.length - 1 && (
                <span
                  className="mx-1.5 h-0.5 flex-1 max-sm:mx-0 max-sm:my-1 max-sm:h-auto max-sm:min-h-[18px] max-sm:w-0.5"
                  style={{ background: lineOn ? "var(--brand)" : "var(--line)" }}
                />
              )}
            </div>
            <div className="max-sm:pb-3">
              <div className="pr-2 text-[12.5px] font-semibold" style={{ color: s.state === "todo" || s.state === "cancelled" ? "var(--ink-3)" : s.state === "refused" ? "var(--dang)" : "var(--ink)" }}>
                {label}
              </div>
              {sub && (
                <div className="pr-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  {sub}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ReturnModal({ grant, onClose }: { grant: MyGrant; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      const res = await returnAccessAction(grant.id);
      onClose();
      if (!res.ok) return toast(errorMessage(t, res.error ?? "generic"));
      toast(t("desk.portal.toast.returned", { app: grant.appName }));
      router.refresh();
    });
  return (
    <Modal title={t("desk.portal.mine.returnTitle", { app: grant.appName })} onClose={onClose}>
      <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
        {t("desk.portal.mine.returnBody")}
      </p>
      <div className="flex justify-end gap-2.5">
        <button type="button" className="sd-btn sd-btn-ghost" onClick={onClose}>
          {t("desk.portal.mine.keep")}
        </button>
        <button type="button" className="sd-btn sd-btn-danger" disabled={pending} onClick={confirm}>
          {t("desk.portal.mine.returnConfirm")}
        </button>
      </div>
    </Modal>
  );
}

function ReportModal({ hw, onClose }: { hw: MyHardware; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await reportHardwareAction(hw.id, message);
      if (!res.ok) return setError(errorMessage(t, res.error));
      toast(t("desk.portal.toast.reported", { number: String(res.ticketNumber) }));
      onClose();
    });
  };
  return (
    <Modal title={t("desk.portal.mine.reportTitle", { model: hw.model })} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
            {t("desk.portal.mine.reportLabel")}
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            placeholder={t("desk.portal.mine.reportPlaceholder")}
            className="sd-input min-h-[110px] resize-none px-[13px] py-[11px] text-[14px]"
          />
        </label>
        {error && (
          <p className="text-[13px] font-medium" style={{ color: "var(--dang)" }} role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2.5">
          <button type="button" className="sd-btn sd-btn-ghost" onClick={onClose}>
            {t("desk.portal.drawer.cancel")}
          </button>
          <button type="submit" className="sd-btn sd-btn-primary" disabled={pending}>
            {t("desk.portal.mine.reportSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
