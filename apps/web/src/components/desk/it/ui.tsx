"use client";

/**
 * Small pieces the agent-space service desk screens share: state pills, the
 * segmented control, the switch, a controlled dialog/drawer, the toast, and
 * field styles. Written in the house style (inline styles, the shared hover
 * classes of globals.css) so they read like the rest of the agent space.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";
import type { RequestState } from "@/lib/desk/it-data";
import { HW_TONE, STATE_TONE, btnStyle, card, dateOnly, initials, inputStyle, labelStyle, sectionLabel } from "./styles";

export { HW_TONE, STATE_TONE, btnStyle, card, dateOnly, initials, inputStyle, labelStyle, sectionLabel };

export function Pill({ label, c, t, dot = true, size = "sm" }: { label: string; c: string; t: string; dot?: boolean; size?: "sm" | "md" }) {
  const md = size === "md";
  return (
    <span
      className="inline-flex items-center whitespace-nowrap"
      style={{
        gap: md ? 6 : 5,
        padding: md ? "4px 11px" : "2px 8px",
        borderRadius: 999,
        fontSize: md ? 12 : 11,
        fontWeight: 600,
        background: t,
        color: c,
      }}
    >
      {dot && <span style={{ width: md ? 6 : 5, height: md ? 6 : 5, borderRadius: 99, background: c }} />}
      {label}
    </span>
  );
}

export function StatePill({ state, size }: { state: RequestState; size?: "sm" | "md" }) {
  const t = useT();
  const tone = STATE_TONE[state];
  return <Pill label={t(`desk.it.state.${state}` as MessageKey)} c={tone.c} t={tone.t} size={size} />;
}

/* ---------- Segmented control and switch ---------- */

export function Segmented<V extends string | number>({
  value,
  options,
  onChange,
  disabled,
  small,
}: {
  value: V;
  options: Array<{ value: V; label: ReactNode }>;
  onChange: (v: V) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <div role="radiogroup" className="flex" style={{ background: "var(--sunk)", borderRadius: 9, padding: 2.5, gap: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className="whitespace-nowrap"
            style={{
              flex: 1,
              textAlign: "center",
              padding: small ? "5px 2px" : "7px 0",
              borderRadius: 7,
              fontSize: small ? 11.5 : 12.5,
              fontWeight: 600,
              background: on ? "var(--panel)" : "transparent",
              color: on ? "var(--ink)" : "var(--ink-2)",
              boxShadow: on ? "0 1px 2px rgba(13,28,23,.1)" : "none",
              cursor: disabled ? "default" : "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 36,
        height: 20,
        flex: "none",
        borderRadius: 999,
        position: "relative",
        background: on ? "var(--brand)" : "var(--line)",
        transition: "background .15s ease",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          transition: "left .15s ease",
        }}
      />
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{hint}</span>}
    </label>
  );
}

/* ---------- Controlled overlay: modal or right-hand drawer ---------- */

export function Overlay({
  open,
  onClose,
  title,
  children,
  variant = "modal",
  width,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: "modal" | "drawer";
  width?: number;
}) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;

  const head = (
    <div className="flex shrink-0 items-center justify-between" style={{ gap: 12 }}>
      <h2 style={{ fontFamily: "var(--font-title)", fontSize: 16, fontWeight: 600, letterSpacing: "-.01em", color: "var(--ink)" }}>
        {title}
      </h2>
      <button type="button" onClick={onClose} aria-label={t("desk.it.common.close")} className="ohd-hover grid place-items-center" style={{ width: 28, height: 28, borderRadius: 8, color: "var(--ink-3)" }}>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  return createPortal(
    <div
      className={`ohd fixed inset-0 z-50 flex ${variant === "drawer" ? "justify-end" : "items-center justify-center"}`}
      role="dialog"
      aria-modal
      aria-label={title}
      style={{ padding: variant === "drawer" ? 0 : 24 }}
    >
      <div className="absolute inset-0" style={{ background: variant === "drawer" ? "var(--scrim-drawer)" : "var(--scrim-modal)" }} onClick={onClose} />
      {variant === "drawer" ? (
        <div
          className="sd-slide relative flex h-full flex-col border-l"
          style={{ width: width ?? 440, maxWidth: "94vw", background: "var(--panel)", borderColor: "var(--line)", boxShadow: "-16px 0 40px rgba(17,33,28,.16)" }}
        >
          <div className="border-b" style={{ padding: "15px 20px", borderColor: "var(--line)" }}>
            {head}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: 20 }}>
            {children}
          </div>
        </div>
      ) : (
        <div
          className="sd-pop relative flex flex-col rounded-[18px] border"
          style={{ width: width ?? 480, maxWidth: "94vw", maxHeight: "88vh", background: "var(--panel)", borderColor: "var(--line)", boxShadow: "0 20px 48px rgba(17,33,28,.2)", padding: 20, gap: 16 }}
        >
          {head}
          <div className="min-h-0 overflow-y-auto">{children}</div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ---------- Toast ---------- */

type ToastFn = (message: string, tone?: "ok" | "error") => void;
const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback<ToastFn>((message, tone = "ok") => {
    setToast({ message, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), tone === "error" ? 6000 : 3200);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed flex justify-center" style={{ left: 0, right: 0, bottom: 24, zIndex: 80 }}>
        <div
          role="status"
          className="sd-pop"
          style={{
            maxWidth: 560,
            padding: "11px 16px",
            borderRadius: 11,
            fontSize: 13,
            fontWeight: 500,
            background: toast.tone === "error" ? "var(--dang)" : "var(--ink)",
            color: "#fff",
            boxShadow: "0 12px 32px rgba(17,33,28,.25)",
          }}
        >
          {toast.message}
        </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

/* ---------- Helpers ---------- */

/** A stable soft colour per person, from the design's avatar palette. */
const AVATAR = [
  { bg: "#E9EEFC", c: "#1D4ED8" },
  { bg: "#FDF2E3", c: "#B45309" },
  { bg: "#EAF3EE", c: "#0B5F46" },
  { bg: "#F3E8FD", c: "#7C3AED" },
  { bg: "#E5F1EA", c: "#0E7A58" },
  { bg: "#FDECEA", c: "#C0342B" },
];

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = AVATAR[h % AVATAR.length]!;
  return (
    <span
      aria-hidden
      className="grid place-items-center"
      style={{ width: size, height: size, borderRadius: 99, flex: "none", fontSize: Math.round(size * 0.34), fontWeight: 700, background: tone.bg, color: tone.c }}
    >
      {initials(name)}
    </span>
  );
}
