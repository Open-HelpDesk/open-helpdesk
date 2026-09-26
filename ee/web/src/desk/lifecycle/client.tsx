"use client";

/** SD-A6 — the interactive parts of the joiners and leavers screen. */
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/i18n/client";
import { CONNECTOR_NAMES, euros, isoDay, parseDay } from "../shared/format";
import { Avatar, BTN, CARD, CheckMark, ConfirmDialog, PRIMARY, Pill, Segmented, useToast } from "../shared/ui";
import { savePackAction, scheduleOffboardingAction, scheduleOnboardingAction, setTaskDoneAction } from "./actions";
import type { CatalogueApp, PersonLite } from "./data";

/* ---------------- Tabs and picker ---------------- */

export function LifecycleTabs({ value }: { value: "off" | "on" }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Segmented
      value={value}
      options={[
        { value: "off", label: t("desk.ee.life.tabOff") },
        { value: "on", label: t("desk.ee.life.tabOn") },
      ]}
      onChange={(v) => router.push(v === "on" ? `${pathname}?tab=on` : pathname, { scroll: false })}
    />
  );
}

type Option = { id: string; label: string; sub: string };

export function PersonPicker({ leavers, others, value }: { leavers: Option[]; others: Option[]; value: string | null }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.ee.life.pickPerson")}</span>
      <select
        className="ohd-field"
        value={value ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("person", e.target.value);
          next.delete("tab");
          router.push(`${pathname}?${next.toString()}`, { scroll: false });
        }}
        style={{ height: 36, borderRadius: 9, border: "1px solid var(--line)", padding: "0 10px", fontSize: 13, background: "var(--panel)", color: "var(--ink)", minWidth: 260 }}
      >
        {value == null && <option value="">{t("desk.ee.life.pickPlaceholder")}</option>}
        {leavers.length > 0 && (
          <optgroup label={t("desk.ee.life.pickLeavers")}>
            {leavers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.sub ? `${o.label} — ${o.sub}` : o.label}
              </option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label={t("desk.ee.life.pickOthers")}>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.sub ? `${o.label} — ${o.sub}` : o.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

/* ---------------- Departure ---------------- */

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OffboardingHeader({
  personId,
  name,
  scheduledAt,
  defaultAt,
  counts,
}: {
  personId: string;
  name: string;
  scheduledAt: string | null;
  defaultAt: string | null;
  counts: { access: number; devices: number; transfers: number };
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(toLocalInput(defaultAt));
  const [pending, start] = useTransition();

  if (scheduledAt) {
    return (
      <Pill tone="ok">
        {t("desk.ee.life.scheduledOn", {
          date: t.fmt.dateLong(new Date(scheduledAt)),
          time: new Date(scheduledAt).toLocaleTimeString(t.locale.tag, { hour: "2-digit", minute: "2-digit" }),
        })}
      </Pill>
    );
  }

  const schedule = () =>
    start(async () => {
      const res = await scheduleOffboardingAction(personId, at ? new Date(at).toISOString() : null);
      setOpen(false);
      if (!res.ok) return toast(res.error, "error");
      toast(
        t("desk.ee.life.offScheduledToast", {
          name,
          access: t.fmt.number(counts.access),
          devices: t.fmt.number(counts.devices),
          count: counts.transfers,
        }),
      );
      router.refresh();
    });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={PRIMARY}>
        {t("desk.ee.life.offSchedule")}
      </button>
      <ConfirmDialog
        open={open}
        busy={pending}
        title={t("desk.ee.life.offConfirmTitle", { name })}
        body={t("desk.ee.life.offConfirmBody", { access: t.fmt.number(counts.access), devices: t.fmt.number(counts.devices), count: counts.transfers })}
        confirmLabel={t("desk.ee.life.offSchedule")}
        onConfirm={schedule}
        onClose={() => setOpen(false)}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>{t("desk.ee.life.executeAt")}</span>
          <input
            type="datetime-local"
            className="ohd-field"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            style={{ height: 38, borderRadius: 9, border: "1px solid var(--line)", padding: "0 12px", fontSize: 13.5, background: "var(--panel)", color: "var(--ink)" }}
          />
          {!at && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("desk.ee.life.executeNow")}</span>}
        </label>
      </ConfirmDialog>
    </>
  );
}

export function TaskRow({
  id,
  done: initial,
  label,
  detail,
  icon,
  tag,
  top,
}: {
  id: string | null;
  done: boolean;
  label: string;
  detail: string;
  icon?: ReactNode;
  tag?: { label: string; tone: "ok" | "wait" };
  top?: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [done, setDone] = useState(initial);
  const [pending, start] = useTransition();
  const live = id != null;

  const toggle = () => {
    if (!live || pending) return;
    const next = !done;
    setDone(next);
    start(async () => {
      const res = await setTaskDoneAction(id, next);
      if (!res.ok) {
        setDone(!next);
        return toast(res.error, "error");
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={done}
      disabled={!live}
      title={live ? undefined : t("desk.ee.life.previewTip")}
      className={live ? "ohd-hover" : undefined}
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        alignItems: top ? "flex-start" : "center",
        gap: 10,
        padding: "10px 16px",
        borderBottom: "1px solid var(--line-2)",
        cursor: live ? "pointer" : "default",
      }}
    >
      <span style={{ marginTop: top ? 1 : 0, opacity: live ? 1 : 0.5 }}>
        <CheckMark on={done} />
      </span>
      {icon}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: done ? "var(--ink-3)" : "var(--ink)",
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {label}
        </span>
        {detail && <span style={{ display: "block", fontSize: top ? 12 : 11.5, color: "var(--ink-3)" }}>{detail}</span>}
      </span>
      {tag && <Pill tone={tag.tone}>{tag.label}</Pill>}
    </button>
  );
}

/* ---------------- Arrival ---------------- */

export function Onboarding({
  joiners,
  scheduled,
  managers,
  departments,
  packs,
  apps,
  stock,
  canSavePack,
  icons,
}: {
  joiners: PersonLite[];
  scheduled: Array<{ personId: string; name: string; executeAt: string }>;
  managers: PersonLite[];
  departments: string[];
  packs: Record<string, string[]>;
  apps: CatalogueApp[];
  stock: Array<{ model: string; type: string; count: number }>;
  canSavePack: boolean;
  icons: Record<string, ReactNode>;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  // Who: an existing person with a future first day, or a new one.
  const [who, setWho] = useState<string>(joiners[0]?.id ?? "new");
  const existing = joiners.find((p) => p.id === who) ?? null;
  const [np, setNp] = useState({ name: "", email: "", title: "", department: departments[0] ?? "", managerEmail: "", startsOn: isoDay(14) });
  const department = existing?.department ?? np.department;
  const packNames = useMemo(() => {
    const names = Object.keys(packs);
    return names.length ? names : departments;
  }, [packs, departments]);
  const [pack, setPack] = useState<string>(department && packNames.includes(department) ? department : (packNames[0] ?? ""));
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const visibleIds = new Set(apps.map((a) => a.id));
  const selected = (overrides[pack] ?? packs[pack] ?? []).filter((id) => visibleIds.has(id));
  const [hardware, setHardware] = useState<string[]>([]);

  const chosen = apps.filter((a) => selected.includes(a.id));
  const auto = chosen.filter((a) => a.automatic).length;
  const monthly = chosen.reduce((s, a) => s + a.monthlyCents, 0);
  const packChanged = overrides[pack] != null && JSON.stringify([...(overrides[pack] ?? [])].sort()) !== JSON.stringify([...(packs[pack] ?? [])].sort());

  const toggleApp = (id: string) =>
    setOverrides((o) => {
      const cur = o[pack] ?? packs[pack] ?? [];
      return { ...o, [pack]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });

  const name = existing?.name ?? np.name;
  const firstDay = existing?.startsOn ?? np.startsOn;

  const schedule = () =>
    start(async () => {
      const res = await scheduleOnboardingAction({
        personId: existing?.id ?? null,
        newPerson: existing ? null : { ...np, department: np.department || pack },
        appIds: selected,
        hardwareModels: hardware,
      });
      if (!res.ok) return toast(res.error, "error");
      setOverrides({});
      setHardware([]);
      toast(
        firstDay
          ? t("desk.ee.life.onScheduledToast", { name, date: t.fmt.dateLong(parseDay(firstDay)) })
          : t("desk.ee.life.onScheduledToastNoDate", { name }),
      );
      router.refresh();
    });

  const savePack = () =>
    start(async () => {
      const res = await savePackAction(pack, selected);
      if (!res.ok) return toast(res.error, "error");
      toast(t("desk.ee.life.packSavedToast", { team: pack }));
      router.refresh();
    });

  const field: React.CSSProperties = {
    height: 36,
    borderRadius: 9,
    border: "1px solid var(--line)",
    padding: "0 10px",
    fontSize: 13,
    background: "var(--panel)",
    color: "var(--ink)",
    width: "100%",
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--ink-2)" };
  const manager = existing ? null : managers.find((m) => m.email === np.managerEmail);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {scheduled.length > 0 && (
        <div style={{ ...CARD, padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, color: "var(--ink-2)" }}>
          <span style={{ fontWeight: 600 }}>{t("desk.ee.life.alreadyScheduled")}</span>
          {scheduled.map((s) => (
            <Pill key={s.personId} tone="ok">
              {t("desk.ee.life.scheduledArrival", { name: s.name, date: t.fmt.dateShort(s.executeAt.length === 10 ? parseDay(s.executeAt) : new Date(s.executeAt)) })}
            </Pill>
          ))}
        </div>
      )}

      <div style={{ ...CARD, borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Avatar name={name || "?"} size={46} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: "var(--font-title)", fontSize: 19, fontWeight: 600, letterSpacing: "-.01em" }}>
              {name ? t("desk.ee.life.onTitle", { name }) : t("desk.ee.life.onTitleNew")}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {[
                existing?.title ?? np.title,
                department,
                firstDay ? t("desk.ee.life.firstDay", { date: t.fmt.dateLong(parseDay(firstDay)) }) : null,
                manager ? t("desk.ee.life.managerIs", { name: manager.name }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {packNames.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.ee.life.pack")}</span>
              <Segmented small value={pack} onChange={setPack} options={packNames.map((d) => ({ value: d, label: d }))} />
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, borderTop: "1px solid var(--line-2)", paddingTop: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={label}>{t("desk.ee.life.who")}</span>
            <select
              className="ohd-field"
              style={field}
              value={who}
              onChange={(e) => {
                setWho(e.target.value);
                const d = joiners.find((p) => p.id === e.target.value)?.department ?? np.department;
                if (d && packNames.includes(d)) setPack(d);
              }}
            >
              {joiners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="new">{t("desk.ee.life.newPerson")}</option>
            </select>
          </label>
          {!existing && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={label}>{t("desk.ee.life.fieldName")}</span>
                <input className="ohd-field" style={field} value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={label}>{t("desk.ee.life.fieldEmail")}</span>
                <input type="email" className="ohd-field" style={field} value={np.email} onChange={(e) => setNp({ ...np, email: e.target.value })} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={label}>{t("desk.ee.life.fieldTitle")}</span>
                <input className="ohd-field" style={field} value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={label}>{t("desk.ee.life.fieldDepartment")}</span>
                <select
                  className="ohd-field"
                  style={field}
                  value={np.department}
                  onChange={(e) => {
                    setNp({ ...np, department: e.target.value });
                    if (packNames.includes(e.target.value)) setPack(e.target.value);
                  }}
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={label}>{t("desk.ee.life.fieldManager")}</span>
                <select className="ohd-field" style={field} value={np.managerEmail} onChange={(e) => setNp({ ...np, managerEmail: e.target.value })}>
                  <option value="">—</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.email}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={label}>{t("desk.ee.life.fieldStart")}</span>
                <input type="date" className="ohd-field" style={field} value={np.startsOn} onChange={(e) => setNp({ ...np, startsOn: e.target.value })} />
              </label>
            </>
          )}
        </div>
      </div>

      {apps.length === 0 ? (
        <div style={{ ...CARD, padding: "24px", fontSize: 13.5, color: "var(--ink-2)" }}>{t("desk.ee.life.noApps")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
          {apps.map((a) => {
            const on = selected.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleApp(a.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 13px",
                  borderRadius: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  border: `1.5px solid ${on ? "var(--brand)" : "var(--line)"}`,
                  background: on ? "var(--brand-t)" : "var(--panel)",
                }}
              >
                <CheckMark on={on} />
                {icons[a.id]}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)" }}>
                    {a.automatic && a.provisioning !== "manual"
                      ? t("desk.ee.life.tagAuto", { connector: CONNECTOR_NAMES[a.provisioning] })
                      : t("desk.ee.life.manualCreation")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {canSavePack && packChanged && pack && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" disabled={pending} onClick={savePack} className="ohd-hover-edge-fill" style={{ ...BTN, background: "var(--panel)" }}>
            {t("desk.ee.life.savePack", { team: pack })}
          </button>
        </div>
      )}

      <div style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          {t("desk.ee.life.stockTitle")}
        </div>
        {stock.length === 0 && <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("desk.ee.life.stockEmpty")}</div>}
        {stock.map((h) => {
          const on = hardware.includes(h.model);
          return (
            <button
              key={h.model}
              type="button"
              aria-pressed={on}
              onClick={() => setHardware((all) => (on ? all.filter((x) => x !== h.model) : [...all, h.model]))}
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, textAlign: "left", cursor: "pointer" }}
            >
              <CheckMark on={on} />
              <span style={{ flex: 1, fontWeight: 600 }}>{h.model}</span>
              <span style={{ color: "var(--ink-3)" }}>{t("desk.ee.life.inStock", { count: h.count })}</span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "16px 18px",
          borderRadius: 14,
          background: "var(--brand-t)",
          border: "1px solid var(--brand-b)",
        }}
      >
        <span style={{ flex: 1, minWidth: 260, fontSize: 13.5, color: "var(--ink)" }}>
          {t("desk.ee.life.summary", {
            count: chosen.length,
            auto: t.fmt.number(auto),
            manual: t.fmt.number(chosen.length - auto),
            amount: euros(t, monthly),
          })}
        </span>
        <button type="button" disabled={pending || (!existing && !np.name.trim())} onClick={schedule} style={{ ...PRIMARY, opacity: pending ? 0.6 : 1 }}>
          {t("desk.ee.life.onSchedule")}
        </button>
      </div>
    </div>
  );
}
