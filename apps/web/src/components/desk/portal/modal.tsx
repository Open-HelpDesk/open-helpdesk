"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/client";

/** A centred dialog for the portal's small forms and confirmations. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0" style={{ background: "var(--scrim-modal)" }} onClick={onClose} />
      <div
        className="sd-rise relative flex w-[480px] max-w-full flex-col gap-4 rounded-2xl p-6"
        style={{ background: "var(--panel)", boxShadow: "0 24px 60px -20px rgb(13 28 23 / 45%)" }}
      >
        <div className="flex items-start gap-3">
          <h2 className="sd-title flex-1 text-[19px] leading-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("desk.portal.drawer.close")}
            className="-mr-2 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-[18px] hover:bg-[var(--sunk)]"
            style={{ color: "var(--ink-3)" }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
