"use client";

/**
 * SD-A5 client islands: "Assign an application" (a direct grant, journalled),
 * "Start offboarding" (the joiners-and-leavers screen), and the per-row
 * "Revoke" of the applications table.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { directGrantAction } from "@/app/app/desk/people/actions";
import { RevokeDialog } from "./request-actions";
import { btnStyle, Field, inputStyle, Overlay, useToast } from "./ui";

type GrantableApp = { id: string; name: string; maxDurationDays: number | null; tiers: Array<{ id: string; name: string; monthlyCostCents: number }> };

export function PersonActions({ personId, personName, apps, heldAppIds }: { personId: string; personName: string; apps: GrantableApp[]; heldAppIds: string[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap" style={{ gap: 8 }}>
      <button type="button" className="ohd-hover-edge-fill" style={btnStyle("ghost")} onClick={() => setOpen(true)}>
        {t("desk.it.people.assign")}
      </button>
      <Link href={`/app/desk/lifecycle?person=${personId}`} className="ohd-hover" style={btnStyle("danger")}>
        {t("desk.it.people.offboard")}
      </Link>
      <AssignDialog open={open} onClose={() => setOpen(false)} personId={personId} personName={personName} apps={apps.filter((a) => !heldAppIds.includes(a.id) && a.tiers.length > 0)} />
    </div>
  );
}

function AssignDialog({ open, onClose, personId, personName, apps }: { open: boolean; onClose: () => void; personId: string; personName: string; apps: GrantableApp[] }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [appId, setAppId] = useState("");
  const [tierId, setTierId] = useState("");
  const [duration, setDuration] = useState("none");
  const app = apps.find((a) => a.id === appId) ?? null;
  const durations: Array<number | null> = app?.maxDurationDays == null ? [null, 90, 30] : [90, 30].filter((d) => d <= app.maxDurationDays!);
  const durationValue = durations.map((d) => (d == null ? "none" : String(d))).includes(duration) ? duration : durations[0] == null ? "none" : String(durations[0]);

  const money = (cents: number) => t("desk.it.money", { amount: t.fmt.amount(cents / 100) });

  return (
    <Overlay open={open} onClose={onClose} title={t("desk.it.people.assignTitle", { name: personName })}>
      <form
        className="flex flex-col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!app) return;
          const tier = app.tiers.find((x) => x.id === tierId) ?? app.tiers[0]!;
          start(async () => {
            const res = await directGrantAction(personId, app.id, tier.id, durationValue === "none" ? null : Number(durationValue));
            if (res.ok) {
              toast(t("desk.it.people.assigned", { app: app.name }));
              setAppId("");
              onClose();
              router.refresh();
            } else toast(t("desk.it.common.error", { message: res.error }), "error");
          });
        }}
      >
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5, padding: "10px 12px", borderRadius: 10, background: "var(--wait-t)" }}>{t("desk.it.people.assignNote")}</p>
        {apps.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("desk.it.people.assignNoApps")}</p>
        ) : (
          <>
            <Field label={t("desk.it.people.assignApp")}>
              <select
                required
                value={appId}
                onChange={(e) => {
                  setAppId(e.target.value);
                  setTierId("");
                }}
                style={inputStyle}
              >
                <option value="" disabled>
                  {t("desk.it.common.none")}
                </option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {app && (
              <>
                <Field label={t("desk.it.people.assignTier")}>
                  <select value={tierId || app.tiers[0]!.id} onChange={(e) => setTierId(e.target.value)} style={inputStyle}>
                    {app.tiers.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.monthlyCostCents ? t("desk.it.facts.tierCost", { tier: x.name, cost: money(x.monthlyCostCents) }) : t("desk.it.facts.tierFree", { tier: x.name })}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("desk.it.people.assignDuration")}>
                  <select value={durationValue} onChange={(e) => setDuration(e.target.value)} style={inputStyle}>
                    {durations.map((d) => (
                      <option key={String(d)} value={d == null ? "none" : String(d)}>
                        {d == null ? t("desk.it.duration.permanent") : t("desk.it.duration.days", { count: d })}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </>
        )}
        <div className="flex justify-end" style={{ gap: 8 }}>
          <button type="button" className="ohd-hover" style={btnStyle("ghost")} onClick={onClose}>
            {t("desk.it.common.cancel")}
          </button>
          <button type="submit" disabled={pending || !app} style={btnStyle("primary")}>
            {t("desk.it.people.assignSubmit")}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

export function GrantRevokeButton({ grantId, appName, personName, connector }: { grantId: string; appName: string; personName: string; connector: string | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="sd-revoke" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
        {t("desk.it.people.revoke")}
      </button>
      <RevokeDialog open={open} onClose={() => setOpen(false)} grantId={grantId} appName={appName} personName={personName} connector={connector} />
    </>
  );
}
