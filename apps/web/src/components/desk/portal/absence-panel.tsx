"use client";

/**
 * SD-M1 — "Absence and delegation": the approver hands their approvals to a
 * colleague while away, and takes them back. Everything said here is what the
 * circuit really does (doctrine 5): a delegation applies to NEW requests while
 * its author is marked absent; requests already waiting are not moved; the
 * delegate's own requests never land on the delegate (rule 3).
 *
 * The absence starts today — the directory stores an end date only, so an
 * absence declared for later would already route requests away now.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { AbsencePanel as PanelData } from "@/lib/desk/portal-data";
import { endAbsenceAction, startAbsenceAction } from "@/app/desk/actions";
import { errorMessage } from "./request-drawer";
import { useToast } from "./shell";
import { day, type PortalT } from "./format";

/** Default length of a new absence, in days — a working week. */
const DEFAULT_ABSENCE_DAYS = 7;
const MAX_ABSENCE_DAYS = 365;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AbsencePanel({
  data,
  escalateAfterHours,
  whenAbsent,
}: {
  data: PanelData;
  escalateAfterHours: number;
  whenAbsent: "manager_of_manager" | "app_owner";
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [until, setUntil] = useState(addDays(data.today, DEFAULT_ABSENCE_DAYS));
  const [delegateId, setDelegateId] = useState(data.candidates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const { active, absentUntil } = data;
  const on = !!absentUntil || !!active;
  const date = (iso: string) => t.fmt.dateShort(day(iso));

  let text: string;
  if (active && absentUntil) {
    text = t("desk.portal.absence.on", { name: active.toName, date: date(active.endsOn) });
  } else if (active) {
    text = t("desk.portal.absence.onHold", { name: active.toName, date: date(active.endsOn) });
  } else if (absentUntil) {
    text =
      whenAbsent === "app_owner"
        ? t("desk.portal.absence.absentOwner", { date: date(absentUntil) })
        : data.managerName
          ? t("desk.portal.absence.absentManager", { date: date(absentUntil), name: data.managerName })
          : t("desk.portal.absence.absentNobody", { date: date(absentUntil) });
  } else {
    text = data.managerName
      ? t("desk.portal.absence.offEscalate", { count: escalateAfterHours, name: data.managerName })
      : t("desk.portal.absence.off");
  }

  const end = () =>
    start(async () => {
      const res = await endAbsenceAction(active?.id ?? null);
      if (!res.ok) {
        toast(errorMessage(t, res.error ?? "generic"));
        router.refresh();
        return;
      }
      toast(t("desk.portal.absence.toastEnded"));
      router.refresh();
    });

  const save = () => {
    setError(null);
    const who = data.candidates.find((c) => c.id === delegateId);
    if (!who) {
      setError(errorMessage(t, "delegate"));
      return;
    }
    start(async () => {
      const res = await startAbsenceAction({ until, delegateId });
      if (!res.ok) {
        setError(errorMessage(t, res.error));
        return;
      }
      toast(t("desk.portal.absence.toastOn", { name: who.name, date: date(until) }));
      setEditing(false);
      router.refresh();
    });
  };

  const toggle = () => {
    if (on) end();
    else setEditing((v) => !v);
  };

  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] px-[18px] py-3.5" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div className="flex flex-wrap items-center gap-3.5">
        <button
          type="button"
          role="switch"
          aria-checked={on || editing}
          aria-label={t("desk.portal.absence.title")}
          disabled={pending}
          onClick={toggle}
          className="relative h-5 w-9 flex-none rounded-full transition-[background] duration-150 disabled:opacity-60"
          style={{ background: on || editing ? "var(--brand)" : "var(--line)" }}
        >
          <span
            className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] duration-150"
            style={{ left: on || editing ? 18 : 2, boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}
          />
        </button>
        <div className="min-w-[240px] flex-1 max-sm:min-w-0 max-sm:basis-[calc(100%-50px)]">
          <div className="text-[13.5px] font-semibold">{t("desk.portal.absence.title")}</div>
          <div className="text-[12.5px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
            {text}
          </div>
        </div>
        {on && (
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
            {active && (
              <span
                className="flex h-8 items-center whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold"
                style={{ border: "1px solid var(--line)" }}
              >
                {t("desk.portal.absence.delegatedTo", { name: active.toName })}
              </span>
            )}
            {!active && absentUntil && !editing && (
              <button type="button" className="sd-btn sd-btn-ghost h-8 px-3 text-[12.5px]" disabled={pending} onClick={() => setEditing(true)}>
                {t("desk.portal.absence.choose")}
              </button>
            )}
            <button type="button" className="sd-btn sd-btn-danger h-8 px-3 text-[12.5px]" disabled={pending} onClick={end}>
              {active ? t("desk.portal.absence.end") : t("desk.portal.absence.back")}
            </button>
          </div>
        )}
      </div>

      {data.incoming.map((d) => (
        <div
          key={`${d.fromName}-${d.endsOn}`}
          className="rounded-[10px] px-3.5 py-2.5 text-[13px]"
          style={{ background: "var(--open-t)", color: "var(--open)" }}
        >
          {t("desk.portal.absence.incoming", { name: d.fromName, date: date(d.endsOn) })}
        </div>
      ))}

      {editing && (
        <AbsenceForm
          t={t}
          data={data}
          until={until}
          setUntil={setUntil}
          delegateId={delegateId}
          setDelegateId={setDelegateId}
          error={error}
          pending={pending}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
          onSave={save}
        />
      )}
    </div>
  );
}

function AbsenceForm({
  t,
  data,
  until,
  setUntil,
  delegateId,
  setDelegateId,
  error,
  pending,
  onCancel,
  onSave,
}: {
  t: PortalT;
  data: PanelData;
  until: string;
  setUntil: (v: string) => void;
  delegateId: string;
  setDelegateId: (v: string) => void;
  error: string | null;
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (data.candidates.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3.5 text-[13px]" style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}>
        {t("desk.portal.absence.noCandidate")}
        <button type="button" className="sd-btn sd-btn-ghost h-9 text-[13px]" onClick={onCancel}>
          {t("desk.portal.absence.cancel")}
        </button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 border-t pt-3.5"
      style={{ borderColor: "var(--line-2)" }}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[180px] flex-[1_1_180px] flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
            {t("desk.portal.absence.untilLabel")}
          </span>
          <input
            type="date"
            required
            value={until}
            min={data.today}
            max={addDays(data.today, MAX_ABSENCE_DAYS)}
            onChange={(e) => setUntil(e.target.value)}
            className="sd-input h-[40px] px-3 text-[13.5px]"
          />
        </label>
        <label className="flex min-w-[220px] flex-[2_1_260px] flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
            {t("desk.portal.absence.delegateLabel")}
          </span>
          <select
            required
            value={delegateId}
            onChange={(e) => setDelegateId(e.target.value)}
            className="sd-input h-[40px] px-3 text-[13.5px]"
          >
            {data.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === data.managerId
                  ? t("desk.portal.absence.optionManager", { name: c.name })
                  : c.title
                    ? t("desk.portal.absence.optionTitle", { name: c.name, title: c.title })
                    : c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        {t("desk.portal.absence.startsToday")}
      </div>
      {error && (
        <div className="text-[13px] font-medium" style={{ color: "var(--dang)" }} role="alert">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2.5">
        <button type="button" className="sd-btn sd-btn-ghost" onClick={onCancel}>
          {t("desk.portal.absence.cancel")}
        </button>
        <button type="submit" className="sd-btn sd-btn-primary" disabled={pending}>
          {t("desk.portal.absence.save")}
        </button>
      </div>
    </form>
  );
}
