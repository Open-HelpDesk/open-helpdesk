"use client";

/**
 * SD-A7 — the hardware inventory (spec 19 §6): status chips with counts, the
 * table, manual add/edit in a drawer, CSV import. A row opens the profile of
 * the person the device is assigned to; the pencil opens the edit drawer.
 * Declarative on purpose (V1): nothing is discovered, everything is entered.
 */
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";
import type { HardwareRow, HardwareStatus } from "@/lib/desk/it-data";
import { importHardwareAction, upsertHardwareAction } from "@/app/app/desk/hardware/actions";
import { CsvImportDialog } from "./csv-import";
import { Avatar, btnStyle, card, dateOnly, Field, HW_TONE, inputStyle, Overlay, Pill, useToast } from "./ui";

const STATUSES: HardwareStatus[] = ["assigned", "in_stock", "in_repair", "to_recover"];
const GRID = "minmax(0,.8fr) minmax(0,1.6fr) minmax(0,.8fr) minmax(0,1.4fr) minmax(0,.9fr) minmax(0,1fr) 32px";

export function HardwareScreen({ rows, people, today }: { rows: HardwareRow[]; people: Array<{ id: string; name: string }>; today: string }) {
  const t = useT();
  const router = useRouter();
  const [filter, setFilter] = useState<HardwareStatus | "all">("all");
  const [editing, setEditing] = useState<HardwareRow | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const s of STATUSES) c[s] = rows.filter((r) => r.status === s).length;
    return c;
  }, [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="h-full min-w-0 flex-1 overflow-auto" data-screen-label="SD-A7">
      <div className="flex flex-col" style={{ padding: "24px 28px 60px", gap: 18, maxWidth: 1240 }}>
        <div className="flex flex-wrap items-end" style={{ gap: 14 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1 style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 600, letterSpacing: "-.015em" }}>{t("desk.it.hw.title")}</h1>
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 2 }}>{t("desk.it.hw.subtitle")}</p>
          </div>
          <button type="button" className="ohd-hover-edge-ink" style={btnStyle("ghost")} onClick={() => setImporting(true)}>
            {t("desk.it.hw.import")}
          </button>
          <button type="button" style={btnStyle("primary")} onClick={() => setEditing("new")}>
            {t("desk.it.hw.add")}
          </button>
        </div>

        <div className="flex flex-wrap" style={{ gap: 6 }} role="tablist">
          {(["all", ...STATUSES] as const).map((k) => {
            const on = filter === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(k)}
                className="flex items-center"
                style={{
                  gap: 7,
                  padding: "6px 13px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
                  background: on ? "var(--ink)" : "var(--panel)",
                  color: on ? "var(--panel)" : "var(--ink-2)",
                }}
              >
                {k === "all" ? t("desk.it.hw.all") : t(`desk.it.hw.status.${k}` as MessageKey)}
                <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{t.fmt.number(counts[k] ?? 0)}</span>
              </button>
            );
          })}
        </div>

        <div style={{ ...card, overflowX: "auto" }}>
          <div className="grid border-b" style={{ gridTemplateColumns: GRID, gap: 14, minWidth: 780, padding: "10px 16px", borderColor: "var(--line)", fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)" }}>
            <span>{t("desk.it.hw.colTag")}</span>
            <span>{t("desk.it.hw.colModel")}</span>
            <span>{t("desk.it.hw.colType")}</span>
            <span>{t("desk.it.hw.colAssigned")}</span>
            <span>{t("desk.it.hw.colStatus")}</span>
            <span>{t("desk.it.hw.colWarranty")}</span>
            <span />
          </div>
          {shown.length === 0 && (
            <p style={{ padding: "18px 16px", fontSize: 13, color: "var(--ink-3)" }}>{rows.length ? t("desk.it.hw.emptyFilter") : t("desk.it.hw.empty")}</p>
          )}
          {shown.map((h) => {
            const expired = !!h.warrantyEndsOn && h.warrantyEndsOn < today;
            const warranty = h.warrantyEndsOn ? t.fmt.dateLong(dateOnly(h.warrantyEndsOn)) : t("desk.it.common.none");
            const open = () => (h.assignedPersonId ? router.push(`/app/desk/people/${h.assignedPersonId}`) : setEditing(h));
            return (
              <div
                key={h.id}
                role="link"
                tabIndex={0}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open();
                }}
                className="ohd-row grid cursor-pointer items-center border-b"
                style={{ gridTemplateColumns: GRID, gap: 14, minWidth: 780, padding: "10px 16px", borderColor: "var(--line-2)", fontSize: 13 } as CSSProperties}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-2)" }}>{h.tag}</span>
                <span className="truncate" style={{ fontWeight: 600 }}>{h.model}</span>
                <span style={{ color: "var(--ink-2)" }}>{h.type}</span>
                <span className="flex min-w-0 items-center" style={{ gap: 8 }}>
                  {h.assignedName ? (
                    <Avatar name={h.assignedName} size={24} />
                  ) : (
                    <span className="grid place-items-center" style={{ width: 24, height: 24, borderRadius: 99, background: "var(--sunk)", color: "var(--ink-3)", fontSize: 9.5, fontWeight: 700 }}>
                      {t("desk.it.common.none")}
                    </span>
                  )}
                  <span className="truncate">{h.assignedName ?? t("desk.it.hw.stock")}</span>
                </span>
                <span>
                  <Pill label={t(`desk.it.hw.status.${h.status}` as MessageKey)} c={HW_TONE[h.status].c} t={HW_TONE[h.status].t} dot={false} />
                </span>
                <span style={{ color: expired ? "var(--dang)" : "var(--ink-2)", fontWeight: expired ? 600 : 400 }}>
                  {expired ? t("desk.it.hw.warrantyExpired", { date: warranty }) : warranty}
                </span>
                <button
                  type="button"
                  aria-label={t("desk.it.hw.editTitle", { tag: h.tag })}
                  title={t("desk.it.hw.edit")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(h);
                  }}
                  className="ohd-hover grid place-items-center"
                  style={{ width: 28, height: 28, borderRadius: 8, color: "var(--ink-3)" }}
                >
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <HardwareDrawer key={editing === "new" ? "new" : (editing?.id ?? "none")} row={editing} people={people} onClose={() => setEditing(null)} />
      <CsvImportDialog open={importing} onClose={() => setImporting(false)} title={t("desk.it.import.hardwareTitle")} hint={t("desk.it.import.hardwareHint")} run={importHardwareAction} />
    </div>
  );
}

function HardwareDrawer({ row, people, onClose }: { row: HardwareRow | "new" | null; people: Array<{ id: string; name: string }>; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const existing = row && row !== "new" ? row : null;
  const [f, setF] = useState({
    tag: existing?.tag ?? "",
    model: existing?.model ?? "",
    type: existing?.type ?? "",
    serial: existing?.serial ?? "",
    assignedPersonId: existing?.assignedPersonId ?? "",
    status: (existing?.status ?? "in_stock") as HardwareStatus,
    warrantyEndsOn: existing?.warrantyEndsOn ?? "",
    purchasedOn: existing?.purchasedOn ?? "",
    cost: existing?.costCents != null ? String(existing.costCents / 100) : "",
  });
  const set = (p: Partial<typeof f>) => setF((cur) => ({ ...cur, ...p }));
  const text = (k: "tag" | "model" | "type" | "serial" | "warrantyEndsOn" | "purchasedOn" | "cost") => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.value }),
    style: inputStyle,
  });

  return (
    <Overlay open={row !== null} onClose={onClose} variant="drawer" title={existing ? t("desk.it.hw.editTitle", { tag: existing.tag }) : t("desk.it.hw.addTitle")}>
      <form
        className="flex flex-col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          const cost = f.cost.trim() === "" ? null : Math.round((Number.parseFloat(f.cost.replace(",", ".")) || 0) * 100);
          start(async () => {
            const res = await upsertHardwareAction({
              id: existing?.id,
              tag: f.tag,
              model: f.model,
              type: f.type,
              serial: f.serial || null,
              assignedPersonId: f.assignedPersonId || null,
              status: f.status,
              warrantyEndsOn: f.warrantyEndsOn || null,
              purchasedOn: f.purchasedOn || null,
              costCents: cost,
            });
            if (res.ok) {
              toast(t("desk.it.hw.saved"));
              onClose();
              router.refresh();
            } else toast(t("desk.it.common.error", { message: res.error }), "error");
          });
        }}
      >
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("desk.it.hw.fieldTag")}>
            <input required autoFocus {...text("tag")} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} />
          </Field>
          <Field label={t("desk.it.hw.fieldType")}>
            <input required {...text("type")} />
          </Field>
        </div>
        <Field label={t("desk.it.hw.fieldModel")}>
          <input required {...text("model")} />
        </Field>
        <Field label={t("desk.it.hw.fieldSerial")}>
          <input {...text("serial")} />
        </Field>
        <Field label={t("desk.it.hw.fieldAssignee")}>
          <select
            value={f.assignedPersonId}
            onChange={(e) => {
              const v = e.target.value;
              // Assigning moves the device out of stock; unassigning puts it back.
              set({ assignedPersonId: v, status: v && f.status === "in_stock" ? "assigned" : !v && f.status === "assigned" ? "in_stock" : f.status });
            }}
            style={inputStyle}
          >
            <option value="">{t("desk.it.hw.nobody")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("desk.it.hw.fieldStatus")}>
          <select value={f.status} onChange={(e) => set({ status: e.target.value as HardwareStatus })} style={inputStyle}>
            {(["assigned", "in_stock", "in_repair", "to_recover", "retired"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`desk.it.hw.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("desk.it.hw.fieldWarranty")}>
            <input type="date" {...text("warrantyEndsOn")} />
          </Field>
          <Field label={t("desk.it.hw.fieldPurchased")}>
            <input type="date" {...text("purchasedOn")} />
          </Field>
        </div>
        <Field label={t("desk.it.hw.fieldCost")}>
          <input inputMode="decimal" {...text("cost")} />
        </Field>
        <div className="flex justify-end" style={{ gap: 8 }}>
          <button type="button" className="ohd-hover" style={btnStyle("ghost")} onClick={onClose}>
            {t("desk.it.common.cancel")}
          </button>
          <button type="submit" disabled={pending || !f.tag.trim() || !f.model.trim() || !f.type.trim()} style={btnStyle("primary")}>
            {t("desk.it.common.save")}
          </button>
        </div>
      </form>
    </Overlay>
  );
}
