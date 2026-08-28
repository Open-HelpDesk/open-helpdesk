"use client";

/**
 * AG-04 (V2) — the ⋯ menu of the ticket header, and the merge dialog it opens.
 *
 * The V2 header replaces the row of chips with three real buttons and this menu,
 * so `ChipVisual` (a button with no handler), `CopyLinkChip` and `MergeChip` are
 * gone: the two of them that did something moved in here, and the third did
 * nothing at all.
 *
 * The mockup's menu also lists "print" and "mark as spam". The product has
 * neither, and a menu item that answers nothing is the very defect this redesign
 * keeps turning up, so they are not here either.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { mergeTicket } from "../actions";

export function MergeDialog({
  ticketId,
  ticketNumber,
  onClose,
}: {
  ticketId: string;
  ticketNumber: number;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--scrim-modal)", padding: 24 }}
      onClick={onClose}
    >
      <div
        className="ohd-rise-fast w-full max-w-md border shadow-xl"
        style={{
          background: "var(--panel)",
          borderColor: "var(--line)",
          borderRadius: 14,
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-semibold">
            {t("app.ticket.mergeTitle", { number: String(ticketNumber) })}
          </p>
          <button type="button" onClick={onClose} style={{ color: "var(--ink-3)" }}>
            ✕
          </button>
        </div>
        <p className="mb-4 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
          {t("app.ticket.mergeHelp")}
        </p>
        <form action={mergeTicket} className="flex items-center gap-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input
            name="targetNumber"
            required
            placeholder={t("app.ticket.mergeTargetPlaceholder")}
            className="min-w-0 flex-1 border px-3 outline-none"
            style={{
              height: 36,
              borderRadius: 9,
              borderColor: "var(--line)",
              background: "var(--bg)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            className="shrink-0 px-3 text-[13px] font-semibold"
            style={{ color: "var(--on-brand)", height: 36, borderRadius: 9, background: "var(--brand)" }}
          >
            {t("app.ticket.merge")}
          </button>
        </form>
      </div>
    </div>
  );
}

export function TicketMoreMenu({
  ticketId,
  ticketNumber,
}: {
  ticketId: string;
  ticketNumber: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item: React.CSSProperties = {
    padding: "8px 11px",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--ink-2)",
    width: "100%",
    textAlign: "left",
  };

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button
        type="button"
        title={t("app.ticket.moreActions")}
        aria-label={t("app.ticket.moreActions")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid place-items-center"
        style={{
          height: 36,
          width: 36,
          border: `1px solid ${open ? "var(--brand-b)" : "var(--line)"}`,
          borderRadius: 9,
          background: "var(--panel)",
          fontSize: 16,
          color: "var(--ink-2)",
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 42,
            right: 0,
            width: 232,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 2px 4px rgba(13,28,23,.05), 0 18px 40px -16px rgba(13,28,23,.25)",
            padding: 6,
            zIndex: 50,
          }}
        >
          <button
            type="button"
            className="ohd-row"
            style={item}
            onClick={() => {
              setOpen(false);
              setMerging(true);
            }}
          >
            {t("app.ticket.merge")}
          </button>
          <button
            type="button"
            className="ohd-row"
            style={item}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard unavailable — the URL is in the address bar anyway */
              }
              setOpen(false);
            }}
          >
            {copied ? t("app.ticket.linkCopied") : t("app.ticket.copyLink")}
          </button>
        </div>
      )}

      {merging && (
        <MergeDialog
          ticketId={ticketId}
          ticketNumber={ticketNumber}
          onClose={() => setMerging(false)}
        />
      )}
    </div>
  );
}
