"use client";

/**
 * Client furniture of the ee/ desk screens: the toast every action ends on,
 * the confirmation dialog of the destructive ones, and the small marks the
 * design repeats (avatar, bar, pill, checkbox, segmented control).
 *
 * The product had no toast: the design ends every action on one ("3 sièges
 * Figma libérés — 540 € / an…"), and that sentence is where the screen proves
 * what the action did. Scoped to these screens rather than added to the shell.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useT } from "@/i18n/client";
import { avatarOf } from "./format";
import { BTN, CARD, GROUP_HEAD, PRIMARY, SMALL_BTN } from "./styles";

export { BTN, CARD, GROUP_HEAD, PRIMARY, SMALL_BTN };

/* ---------------- Toast ---------------- */

type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastContext = createContext<(text: string, tone?: "ok" | "error") => void>(() => {});

export function DeskToaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { id, text, tone }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), tone === "error" ? 8000 : 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="fixed flex flex-col items-center"
        style={{ left: 0, right: 0, bottom: 24, gap: 8, zIndex: 60, pointerEvents: "none" }}
      >
        {toasts.map((x) => (
          <div
            key={x.id}
            role="status"
            className="ohd-rise-fast"
            style={{
              maxWidth: 560,
              margin: "0 16px",
              padding: "11px 16px",
              borderRadius: 11,
              fontSize: 13.5,
              fontWeight: 500,
              color: "#fff",
              background: x.tone === "error" ? "var(--dang)" : "var(--ink)",
              boxShadow: "0 12px 32px rgba(13,28,23,.25)",
              pointerEvents: "auto",
            }}
          >
            {x.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ---------------- Confirmation ---------------- */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  // A native modal <dialog> sits in the top layer: no ancestor transform or
  // overflow can clip it, which is what a portal would otherwise be for.
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      style={{ padding: 0, border: 0, background: "transparent", maxWidth: "none", maxHeight: "none", width: "100vw", height: "100vh" }}
    >
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ padding: 24 }}>
      <div className="absolute inset-0" style={{ background: "var(--scrim-modal)" }} onClick={onClose} />
      <div
        className="ohd-rise-fast relative rounded-[18px] border"
        style={{
          width: 460,
          maxWidth: "94vw",
          background: "var(--panel)",
          borderColor: "var(--line)",
          boxShadow: "0 20px 48px rgba(17,33,28,.2)",
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h2 style={{ fontFamily: "var(--font-title)", fontSize: 17, fontWeight: 600, letterSpacing: "-.01em" }}>{title}</h2>
        {body && <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{body}</div>}
        {children}
        <div className="flex justify-end" style={{ gap: 8, marginTop: 6 }}>
          <button type="button" onClick={onClose} className="ohd-hover" style={{ ...BTN, background: "var(--panel)" }}>
            {t("desk.ee.common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            style={{
              ...BTN,
              background: danger ? "var(--dang)" : "var(--brand)",
              borderColor: danger ? "var(--dang)" : "var(--brand)",
              color: "#fff",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
    </dialog>
  );
}

/* ---------------- Marks ---------------- */




export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const a = avatarOf(name);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        display: "grid",
        placeItems: "center",
        fontSize: Math.round(size * 0.35),
        fontWeight: 700,
        flex: "none",
        background: a.bg,
        color: a.fg,
      }}
    >
      {a.ini}
    </span>
  );
}

export function Bar({ pct, color = "var(--brand)", height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ flex: 1, height, borderRadius: 99, background: "var(--sunk)", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          borderRadius: 99,
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: color,
          transition: "width .25s",
        }}
      />
    </div>
  );
}

export function Pill({
  tone,
  children,
  title,
}: {
  tone: "ok" | "wait" | "dang" | "sunk" | "brand" | "open";
  children: ReactNode;
  title?: string;
}) {
  const bg = tone === "sunk" ? "var(--sunk)" : `var(--${tone}-t)`;
  const fg = tone === "sunk" ? "var(--ink-2)" : tone === "brand" ? "var(--brand)" : `var(--${tone})`;
  return (
    <span
      title={title}
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: bg,
        color: fg,
        flex: "none",
      }}
    >
      {children}
    </span>
  );
}

export function CheckMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        display: "grid",
        placeItems: "center",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        flex: "none",
        background: on ? "var(--brand)" : "var(--panel)",
        border: `1.5px solid ${on ? "var(--brand)" : "var(--line)"}`,
      }}
    >
      {on ? "✓" : ""}
    </span>
  );
}

/** The design's segmented control: sunk track, the selected option lifted. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  small,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div role="tablist" style={{ display: "flex", background: "var(--sunk)", borderRadius: 9, padding: 2.5 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            style={{
              padding: small ? "6px 13px" : "6px 16px",
              borderRadius: 7,
              fontSize: small ? 12.5 : 13,
              fontWeight: 600,
              cursor: "pointer",
              background: on ? "var(--panel)" : "transparent",
              color: on ? "var(--ink)" : "var(--ink-2)",
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


