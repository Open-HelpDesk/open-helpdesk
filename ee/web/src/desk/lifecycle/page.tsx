/**
 * SD-A6 — Joiners and leavers (`/app/desk/lifecycle`, ee/ deskLifecycle).
 *
 * Two tabs. Départs: one person's offboarding — when it runs, the checklist
 * (accesses to revoke, transfers, hardware to recover), its impact, and
 * "Programmer l'offboarding". Arrivées: a new person, their department's pack
 * adjusted by hand, hardware reserved from stock, "Programmer l'arrivée".
 *
 * V1 honesty (spec SD-A6): transfers are checkable tasks, not executed
 * actions — no connector can hand Drive ownership over yet.
 */
import { AppIcon } from "@/components/desk/app-icon";
import { getDeskConfig, type DeskConfig } from "@/lib/desk";
import type { Translate } from "@/i18n/server";
import { deskScreen } from "../shared/server";
import { DeskColumn, DeskLocked } from "../shared/screen";
import { Avatar, Bar, DeskToaster } from "../shared/ui";
import { CARD, GROUP_HEAD } from "../shared/styles";
import { CONNECTOR_NAMES, euros, parseDay, type Tr } from "../shared/format";
import { loadLifecycle, type OffTask, type Offboarding } from "./data";
import { LifecycleTabs, OffboardingHeader, Onboarding, PersonPicker, TaskRow } from "./client";

export default async function LifecyclePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; person?: string }>;
}) {
  const ctx = await deskScreen("deskLifecycle");
  const { t } = ctx;
  const title = t("desk.ee.life.title");
  if (!ctx.allowed) {
    return <DeskLocked t={t} title={title} lockedTitle="desk.ee.life.lockedTitle" lockedText="desk.ee.life.lockedText" />;
  }
  const { tab, person } = await searchParams;
  const onTab = tab === "on";
  const [data, config] = await Promise.all([
    loadLifecycle(ctx.tenant.id, person),
    getDeskConfig(ctx.tenant.id).catch(() => null),
  ]);

  return (
    <DeskToaster>
      <DeskColumn width={1140}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <h1 style={{ flex: 1, minWidth: 240, fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 600, letterSpacing: "-.015em" }}>
            {title}
          </h1>
          <LifecycleTabs value={onTab ? "on" : "off"} />
        </div>

        {onTab ? (
          <Onboarding
            joiners={data.joiners}
            scheduled={data.scheduledOnboardings}
            managers={data.managers}
            departments={data.departments}
            packs={data.packs}
            apps={data.apps}
            stock={data.stock}
            canSavePack={ctx.manager}
            icons={Object.fromEntries(
              data.apps.map((a) => [a.id, <AppIcon key={a.id} name={a.name} iconKey={a.iconKey} color={a.color} size={28} />]),
            )}
          />
        ) : (
          <Departure t={t} data={data} config={config} />
        )}
      </DeskColumn>
    </DeskToaster>
  );
}

/** Default execution time: the configuration's hour on the last day. */
function defaultExecuteAt(leavesOn: string | null, config: DeskConfig | null): string | null {
  if (!leavesOn) return null;
  const mode = config?.lifecycle.offboardingAt ?? "end_of_last_day";
  if (mode === "immediately") return null;
  const d = parseDay(leavesOn);
  if (mode === "midnight") d.setHours(23, 59, 0, 0);
  else d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

function Departure({ t, data, config }: { t: Translate; data: Awaited<ReturnType<typeof loadLifecycle>>; config: DeskConfig | null }) {
  const off = data.offboarding;
  const picker = (
    <PersonPicker
      leavers={data.leavers.map((p) => ({ id: p.id, label: p.name, sub: p.leavesOn ? t.fmt.dateShort(parseDay(p.leavesOn)) : "" }))}
      others={data.others.map((p) => ({ id: p.id, label: p.name, sub: p.department ?? "" }))}
      value={off?.person.id ?? null}
    />
  );
  if (!off) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {picker}
        <div style={{ ...CARD, padding: "36px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>{t("desk.ee.life.noLeaverTitle")}</p>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", maxWidth: 460 }}>{t("desk.ee.life.noLeaverText")}</p>
        </div>
      </div>
    );
  }

  const p = off.person;
  const executeAt = off.plan?.executeAt ?? defaultExecuteAt(p.leavesOn, config);
  const done = off.tasks.filter((x) => x.done).length;
  const total = off.tasks.length;
  const acc = off.tasks.filter((x) => x.kind === "revoke");
  const tr = off.tasks.filter((x) => x.kind === "transfer");
  const hw = off.tasks.filter((x) => x.kind === "hardware");
  const role = [p.title, p.department].filter(Boolean).join(" · ");
  const when = p.leavesOn
    ? executeAt
      ? t("desk.ee.life.whenAt", {
          date: t.fmt.dateLong(parseDay(p.leavesOn)),
          time: new Date(executeAt).toLocaleTimeString(t.locale.tag, { hour: "2-digit", minute: "2-digit" }),
        })
      : t("desk.ee.life.whenImmediate", { date: t.fmt.dateLong(parseDay(p.leavesOn)) })
    : t("desk.ee.life.whenUnknown");
  const impact = [
    { l: t("desk.ee.life.impactLicences"), v: t("desk.ee.life.perMonth", { amount: euros(t, off.monthlyFreedCents) }) },
    { l: t("desk.ee.life.impactAuto"), v: t("desk.ee.life.nOfM", { n: t.fmt.number(off.autoRevocations), total: t.fmt.number(off.totalRevocations) }) },
    { l: t("desk.ee.life.impactDevices"), v: t.fmt.number(off.devices) },
  ];
  const locked = off.plan == null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {picker}
      <div style={{ ...CARD, borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Avatar name={p.name} size={46} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: "var(--font-title)", fontSize: 19, fontWeight: 600, letterSpacing: "-.01em" }}>
              {t("desk.ee.life.offTitle", { name: p.name })}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{[role, when].filter(Boolean).join(" · ")}</div>
          </div>
          <OffboardingHeader
            personId={p.id}
            name={p.name}
            scheduledAt={off.plan?.executeAt ?? null}
            defaultAt={executeAt}
            counts={{ access: acc.length, devices: hw.length, transfers: tr.length }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Bar pct={(done / Math.max(total, 1)) * 100} />
          <span style={{ fontSize: 12.5, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
            {t("desk.ee.life.progress", { done: t.fmt.number(done), count: total })}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
          {impact.map((k) => (
            <div key={k.l} style={{ background: "var(--sunk)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{k.l}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{k.v}</div>
            </div>
          ))}
        </div>
        {locked && <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.ee.life.previewNote")}</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ ...CARD, overflow: "hidden" }}>
          <div style={GROUP_HEAD}>{t("desk.ee.life.groupAccess", { count: acc.length })}</div>
          {acc.length === 0 && <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.ee.life.noAccess")}</div>}
          {acc.map((x) => (
            <TaskRow
              key={x.key}
              id={x.id}
              done={x.done}
              label={x.app?.name ?? x.key}
              detail={x.app?.tier ?? ""}
              icon={x.app ? <AppIcon name={x.app.name} iconKey={x.app.iconKey} color={x.app.color} size={26} /> : null}
              tag={accessTag(t, x)}
            />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...CARD, overflow: "hidden" }}>
            <div style={GROUP_HEAD}>{t("desk.ee.life.groupTransfers")}</div>
            {tr.map((x) => {
              const [label, detail] = transferText(t, x, off, config);
              return <TaskRow key={x.key} id={x.id} done={x.done} label={label} detail={detail} top />;
            })}
          </div>
          <div style={{ ...CARD, overflow: "hidden" }}>
            <div style={GROUP_HEAD}>{t("desk.ee.life.groupHardware")}</div>
            {hw.length === 0 && <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.ee.life.noHardware")}</div>}
            {hw.map((x) => (
              <TaskRow
                key={x.key}
                id={x.id}
                done={x.done}
                label={x.hardware?.model ?? x.key}
                detail={x.hardware?.tag ? t("desk.ee.life.hardwareDetail", { tag: x.hardware.tag }) : ""}
                top
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function accessTag(t: Tr, x: OffTask): { label: string; tone: "ok" | "wait" } {
  if (x.automatic && x.app && x.app.provisioning !== "manual") {
    return { label: t("desk.ee.life.tagAuto", { connector: CONNECTOR_NAMES[x.app.provisioning] }), tone: "ok" };
  }
  if (x.app?.degraded) return { label: t("desk.ee.life.tagDegraded"), tone: "wait" };
  return { label: t("desk.ee.life.tagManual"), tone: "wait" };
}

function transferText(t: Tr, x: OffTask, off: Offboarding, config: DeskConfig | null): [string, string] {
  const to = typeof x.detail.toName === "string" ? x.detail.toName : off.person.managerName;
  const recipient = to ?? t("desk.ee.life.theManager");
  switch (x.key) {
    case "transfer:drive":
      return [t("desk.ee.life.trDrive"), t("desk.ee.life.trDriveDetail", { name: recipient })];
    case "transfer:crm":
      return [t("desk.ee.life.trCrm"), t("desk.ee.life.trCrmDetail", { name: recipient })];
    case "transfer:mail":
      return [t("desk.ee.life.trMail"), t("desk.ee.life.trMailDetail", { name: recipient, count: config?.lifecycle.mailForwardDays ?? 90 })];
    case "transfer:idp": {
      const mode = config?.directory.deprovision ?? "disable_then_delete";
      const detail =
        mode === "disable"
          ? t("desk.ee.life.trIdpDisable")
          : mode === "delete"
            ? t("desk.ee.life.trIdpDelete")
            : t("desk.ee.life.trIdpDetail", { count: config?.directory.deleteAfterDays ?? 30 });
      return [t("desk.ee.life.trIdp"), detail];
    }
    default:
      return [typeof x.detail.label === "string" ? x.detail.label : x.key, ""];
  }
}
