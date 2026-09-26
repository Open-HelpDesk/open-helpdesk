"use client";

/**
 * SD-A9 — the furniture of the service desk configuration screen.
 *
 * Every setting saves itself the moment it changes (the design's promise:
 * "each change applies immediately and is written to the audit log"), so there
 * is no Save button here: a provider holds the configuration, applies a change
 * optimistically, sends it to the server action and rolls it back if the
 * server refuses. The header shows the outcome ("Saved"), and a toast carries
 * what a button did.
 *
 * Shared with the ee/ panels (ee/web/src/desk/config), which import it through
 * the `@/` alias like the other ee screens import the settings primitives.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DeskConfig } from "@openhelpdesk/desk";
import { useT } from "@/i18n/client";
import { eyebrow } from "./styles";

/* ---------------- State ---------------- */

export type ConfigPatch = { [S in keyof DeskConfig]?: Partial<DeskConfig[S]> };
export type SaveResult = { ok: true; config: DeskConfig } | { ok: false; error: string };
type Status = "idle" | "saving" | "saved" | "error";
type Toast = { id: number; text: string; tone: "ok" | "dang" };

type Ctx = {
  config: DeskConfig;
  status: Status;
  update: <S extends keyof DeskConfig, K extends keyof DeskConfig[S]>(section: S, key: K, value: DeskConfig[S][K]) => void;
  toast: (text: string, tone?: "ok" | "dang") => void;
  /** Wraps any other server call with the same Saving → Saved indicator ({ ok: false } counts as a failure). */
  track: <T>(work: Promise<T>) => Promise<T>;
};

const CfgContext = createContext<Ctx | null>(null);

export function useCfg(): Ctx {
  const ctx = useContext(CfgContext);
  if (!ctx) throw new Error("useCfg() outside <CfgProvider>.");
  return ctx;
}

export function CfgProvider({
  initial,
  save,
  children,
}: {
  initial: DeskConfig;
  save: (patch: ConfigPatch) => Promise<SaveResult>;
  children: ReactNode;
}) {
  const t = useT();
  const [config, setConfig] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;

  const toast = useCallback((text: string, tone: "ok" | "dang" = "ok") => {
    const id = ++seq.current;
    setToasts((all) => [...all.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 4200);
  }, []);

  const track = useCallback(
    async <T,>(work: Promise<T>): Promise<T> => {
      setStatus("saving");
      try {
        const out = await work;
        // Actions answer { ok: false, error } rather than throwing.
        const refused = typeof out === "object" && out !== null && "ok" in out && (out as { ok: unknown }).ok === false;
        setStatus(refused ? "error" : "saved");
        return out;
      } catch (err) {
        setStatus("error");
        toast(err instanceof Error ? err.message : t("desk.cfg.saveFailed"), "dang");
        throw err;
      }
    },
    [t, toast],
  );

  const update = useCallback<Ctx["update"]>(
    (section, key, value) => {
      const previous = configRef.current;
      setConfig((c) => ({ ...c, [section]: { ...c[section], [key]: value } }));
      setStatus("saving");
      const patch = { [section]: { [key]: value } } as ConfigPatch;
      save(patch)
        .then((res) => {
          if (res.ok) {
            setConfig(res.config);
            setStatus("saved");
          } else {
            setConfig(previous);
            setStatus("error");
            toast(res.error, "dang");
          }
        })
        .catch(() => {
          setConfig(previous);
          setStatus("error");
          toast(t("desk.cfg.saveFailed"), "dang");
        });
    },
    [save, t, toast],
  );

  const value = useMemo(() => ({ config, status, update, toast, track }), [config, status, update, toast, track]);
  return (
    <CfgContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 8, zIndex: 60, alignItems: "center" }}
      >
        {toasts.map((x) => (
          <div
            key={x.id}
            role="status"
            style={{
              background: x.tone === "dang" ? "var(--dang)" : "var(--ink)",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: "0 10px 30px rgba(13,28,23,.22)",
              maxWidth: 560,
            }}
          >
            {x.text}
          </div>
        ))}
      </div>
    </CfgContext.Provider>
  );
}

/** "Saving…" / "✓ Saved" next to the title. */
export function SavedIndicator() {
  const t = useT();
  const { status } = useCfg();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (status === "idle") return;
    setVisible(true);
    if (status !== "saved") return;
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, [status]);
  if (!visible || status === "idle") return null;
  const color = status === "error" ? "var(--dang)" : status === "saving" ? "var(--ink-3)" : "var(--ok)";
  const label = status === "error" ? t("desk.cfg.notSaved") : status === "saving" ? t("desk.cfg.saving") : t("desk.cfg.saved");
  return (
    <span aria-live="polite" style={{ fontSize: 12.5, fontWeight: 600, color, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

/* ---------------- Layout ---------------- */


/** A card of the screen: uppercase title and a one-line explanation, rows below. */
export function Panel({
  title,
  hint,
  action,
  children,
  scroll,
  minWidth,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  /** Horizontal scroll for wide grids on narrow screens. */
  scroll?: boolean;
  minWidth?: number;
}) {
  return (
    <section
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        overflowX: scroll ? "auto" : "hidden",
        overflowY: "hidden",
      }}
    >
      {(title || hint || action) && (
        <div
          style={{
            padding: "13px 18px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            flexWrap: "wrap",
            minWidth,
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            {title && <h2 style={eyebrow}>{title}</h2>}
            {hint && <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3, maxWidth: 620 }}>{hint}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Title + hint on the left, the control on the right. */
export function Row({
  label,
  hint,
  children,
  disabled,
  last,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 18px",
        borderBottom: last ? "none" : "1px solid var(--line-2)",
        flexWrap: "wrap",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
        {hint && <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 1 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/* ---------------- Controls ---------------- */

export function Seg<V extends string | number>({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: Array<{ value: V; label: string }>;
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", background: "var(--sunk)", borderRadius: 9, padding: 2.5, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onChange(o.value)}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: disabled ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              background: on ? "var(--panel)" : "transparent",
              color: on ? "var(--ink)" : "var(--ink-3)",
              boxShadow: on ? "0 1px 2px rgba(13,28,23,.1)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        flex: "none",
        transition: "background .15s",
        background: checked ? "var(--brand)" : "var(--line)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          transition: "left .15s",
        }}
      />
    </button>
  );
}

/** A segmented control bound to one setting. */
export function ConfigSeg<S extends keyof DeskConfig, K extends keyof DeskConfig[S]>({
  section,
  field,
  options,
  disabled,
  label,
}: {
  section: S;
  field: K;
  options: Array<{ value: DeskConfig[S][K]; label: string }>;
  disabled?: boolean;
  label?: string;
}) {
  const { config, update } = useCfg();
  return (
    <Seg
      label={label}
      options={options as Array<{ value: string | number; label: string }>}
      value={config[section][field] as string | number}
      onChange={(v) => update(section, field, v as DeskConfig[S][K])}
      disabled={disabled}
    />
  );
}

/** A switch bound to one boolean setting. */
export function ConfigSwitch<S extends keyof DeskConfig, K extends keyof DeskConfig[S]>({
  section,
  field,
  disabled,
  label,
}: {
  section: S;
  field: K;
  disabled?: boolean;
  label: string;
}) {
  const { config, update } = useCfg();
  return (
    <Switch
      label={label}
      checked={Boolean(config[section][field])}
      onChange={(v) => update(section, field, v as DeskConfig[S][K])}
      disabled={disabled}
    />
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  tone = "default",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
  type?: "button" | "submit";
  title?: string;
}) {
  const primary = tone === "primary";
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={primary ? undefined : "ohd-hover-edge-ink"}
      style={{
        height: 34,
        padding: "0 13px",
        borderRadius: 9,
        border: primary ? "1px solid var(--brand)" : "1px solid var(--line)",
        background: primary ? "var(--brand)" : "var(--panel)",
        color: primary ? "var(--on-brand)" : tone === "danger" ? "var(--dang)" : "var(--ink)",
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "wait" | "dang" | "open" | "neutral"; children: ReactNode }) {
  const bg = tone === "neutral" ? "var(--sunk)" : `var(--${tone}-t)`;
  const fg = tone === "neutral" ? "var(--ink-2)" : `var(--${tone})`;
  return (
    <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", background: bg, color: fg }}>
      {children}
    </span>
  );
}


/** An ee/ block the workspace does not have: shown, never hidden, and never faked. */
export function LockedNote({ text }: { text: string }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "var(--sunk)", fontSize: 12.5, color: "var(--ink-2)", flexWrap: "wrap" }}>
      <span
        style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "var(--new-t)", color: "var(--new)" }}
      >
        {t("desk.cfg.lockedBadge")}
      </span>
      <span style={{ flex: 1, minWidth: 200 }}>{text}</span>
    </div>
  );
}
