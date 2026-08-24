"use client";

/**
 * Client overlays of the admin area: 420 px drawer (st-slide .18s), 460 px modal
 * (st-rise .16s), copy button, auto-submitted select. The content (children) is
 * rendered server-side and may contain forms wired to server actions —
 * the drawer closes on submit.
 */
import { useT } from "@/i18n/client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Drawer({
  trigger,
  triggerClassName,
  triggerStyle,
  title,
  children,
  width = 420,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
        style={triggerStyle}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          // A React portal, not a DOM child of the trigger: a `.st-rise` ancestor's
          // entrance animation leaves `transform: matrix(1,0,0,1,0,0)` behind
          // (animation-fill-mode: both never resolves back to the `none` keyword),
          // which — being a value other than `none` — opens a new containing block
          // for `position: fixed` descendants. Nested here, the drawer would be
          // confined to that ancestor's box instead of the viewport.
          <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal>
            <div
              className="absolute inset-0"
              style={{ background: "var(--scrim-drawer)" }}
              onClick={() => setOpen(false)}
            />
            <div
              className="st-slide relative flex h-full flex-col border-l"
              style={{
                width,
                maxWidth: "94vw",
                background: "var(--panel)",
                borderColor: "var(--line)",
                boxShadow: "-16px 0 40px rgba(17,33,28,.16)",
              }}
              onSubmit={() => setOpen(false)}
            >
              <div
                className="flex shrink-0 items-center justify-between border-b"
                style={{ padding: "14px 18px", borderColor: "var(--line)" }}
              >
                <h2 className="font-semibold" style={{ fontSize: 15, color: "var(--ink)" }}>
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("app.settings.shell.close")}
                  style={{ color: "var(--ink-3)" }}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: 18 }}>
                {children}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function Modal({
  trigger,
  triggerClassName,
  triggerStyle,
  title,
  children,
  width = 460,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
        style={triggerStyle}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          // Same reason as Drawer: escape any `.st-rise`/`.st-pop` ancestor whose
          // finished entrance animation leaves a non-`none` computed transform
          // behind, which would otherwise confine this `position: fixed` overlay
          // to that ancestor's box instead of the viewport.
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal
            style={{ padding: 24 }}
          >
            <div
              className="absolute inset-0"
              style={{ background: "var(--scrim-modal)" }}
              onClick={() => setOpen(false)}
            />
            <div
              className="st-pop relative rounded-[10px] border"
              style={{
                width,
                maxWidth: "94vw",
                background: "var(--panel)",
                borderColor: "var(--line)",
                boxShadow: "0 20px 48px rgba(17,33,28,.2)",
                padding: 20,
              }}
              onSubmit={() => setOpen(false)}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold" style={{ fontSize: 15, color: "var(--ink)" }}>
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("app.settings.shell.close")}
                  style={{ color: "var(--ink-3)" }}
                >
                  <X size={16} />
                </button>
              </div>
              {children}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Confirmation by typing the slug (ST-01): the button stays disabled as long as
 * the input does not match the workspace slug exactly.
 */
export function SlugConfirmField({
  slug,
  prompt,
  buttonLabel,
}: {
  slug: string;
  /** "Type 'acme' to confirm" — already translated and interpolated. */
  prompt: string;
  buttonLabel: string;
}) {
  const [value, setValue] = useState("");
  const match = value === slug;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
          {prompt}
        </span>
        <input
          name="confirmation"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="rounded-md border font-mono text-[13.5px]"
          style={{
            minHeight: 36,
            padding: "7px 11px",
            borderColor: "var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
        />
      </label>
      <button
        type="submit"
        disabled={!match}
        className="inline-flex items-center justify-center rounded-md px-3.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        style={{ height: 32, fontSize: 13, background: "var(--dang)" }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1800);
      }}
      className="whitespace-nowrap rounded-md border px-2 py-1 font-medium"
      style={{
        fontSize: 12,
        borderColor: "var(--line)",
        background: "var(--panel)",
        color: copied ? "var(--ok)" : "var(--ink)",
      }}
    >
      {copied ? `✓ ${t("app.settingsNav.copied")}` : (label ?? t("app.settingsNav.copy"))}
    </button>
  );
}

/** Select that submits its form on change (ST-02 inline role). */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  style,
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  style?: CSSProperties;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="rounded-md border px-2 py-1 text-[12.5px]"
      style={{
        borderColor: "var(--line)",
        background: "var(--bg)",
        color: "var(--ink)",
        ...style,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
