"use client";

/**
 * The guided tour of the agent space, shown once on the first arrival in the
 * inbox.
 *
 * It exists because the screen that greets a new workspace is an empty table.
 * Everything the product can do is on it — the rail, the views, the palette —
 * and none of it says what it is to someone who has never seen it. The tour
 * points at the real controls rather than describing them: the reader ends up
 * knowing where things are, which a paragraph cannot do.
 *
 * Anchored by `data-tour` on the real elements. A step whose anchor is missing
 * is skipped rather than shown floating in the void — a screen narrower than
 * the sidebar breakpoint genuinely has no views column, and pointing at nothing
 * is worse than saying nothing.
 */
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { markTourSeen } from "@/app/app/tickets/tour-actions";

type Step = { anchor: string; title: string; body: string };

/** Where the bubble sits relative to the highlighted element. */
type Placement = "right" | "bottom" | "corner";

const BUBBLE_WIDTH = 300;
/** Enough for two lines of body — only used to keep the bubble on screen. */
const BUBBLE_HEIGHT = 168;
const GAP = 12;

export function InboxTour() {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [done, setDone] = useState(false);

  const steps: Step[] = [
    {
      anchor: "rail",
      title: t("app.tour.railTitle"),
      body: t("app.tour.railBody"),
    },
    {
      anchor: "views",
      title: t("app.tour.viewsTitle"),
      body: t("app.tour.viewsBody"),
    },
    {
      anchor: "table",
      title: t("app.tour.tableTitle"),
      body: t("app.tour.tableBody"),
    },
    {
      anchor: "search",
      title: t("app.tour.searchTitle"),
      body: t("app.tour.searchBody"),
    },
    {
      anchor: "new",
      title: t("app.tour.newTitle"),
      body: t("app.tour.newBody"),
    },
  ];

  /* Which anchors exist is a question about the DOM, so it cannot be asked
     while rendering on the server. Resolved once, after mount. */
  const [present, setPresent] = useState<Step[] | null>(null);
  useEffect(() => {
    setPresent(steps.filter((s) => document.querySelector(`[data-tour="${s.anchor}"]`)));
    // The step list is rebuilt on every render (it holds translated strings);
    // depending on it would re-run this on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = present?.[index];

  const finish = useCallback(() => {
    setDone(true);
    void markTourSeen();
  }, []);

  /* The highlight follows the element: measured on each step, and again on
     resize and scroll, because the views column scrolls under a short window. */
  useEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Escape leaves the tour, like any other overlay of the product.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  if (done || !present || !step || !rect) return null;

  const last = index === present.length - 1;

  /* Where the bubble goes without covering what it describes.
   *
   *  · A narrow column (the rail) or a tall one (the views): beside it. Under
   *    it there is no room, and over it is the one place it must not be.
   *  · An element taller than most of the window (the ticket table) has no
   *    "outside" left. The bubble goes to the bottom corner, over the part of
   *    the list that is empty in a young workspace, rather than over its rows.
   *  · Everything else — the top bar controls — reads below.
   */
  const tall = rect.height > window.innerHeight * 0.6;
  const roomRight = window.innerWidth - rect.right > BUBBLE_WIDTH + GAP * 2;
  const placement: Placement =
    (rect.width < 120 || tall) && roomRight ? "right" : tall ? "corner" : "bottom";

  const top =
    placement === "right"
      ? Math.min(rect.top, window.innerHeight - BUBBLE_HEIGHT - GAP)
      : placement === "corner"
        ? window.innerHeight - BUBBLE_HEIGHT - GAP
        : rect.bottom + GAP;
  const left =
    placement === "right"
      ? rect.right + GAP
      : placement === "corner"
        ? rect.left + GAP
        : Math.min(rect.left, window.innerWidth - BUBBLE_WIDTH - GAP);

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={step.title}
      className="fixed inset-0"
      style={{ zIndex: 70 }}
    >
      {/* The scrim IS the highlight: an outward shadow large enough to cover the
          screen leaves the element's own box lit, with no second layer to keep
          aligned with it. Clicks pass through to nothing — the tour is modal. */}
      <div
        onClick={finish}
        style={{
          position: "absolute",
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          borderRadius: 12,
          boxShadow: "0 0 0 9999px var(--scrim-modal)",
          pointerEvents: "auto",
        }}
      />

      <div
        className="ohd-rise-fast flex flex-col"
        style={{
          position: "absolute",
          top: Math.max(GAP, top),
          left: Math.max(GAP, left),
          width: BUBBLE_WIDTH,
          maxWidth: `calc(100vw - ${GAP * 2}px)`,
          gap: 10,
          padding: 16,
          borderRadius: 12,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          boxShadow: "0 16px 44px rgb(0 0 0 / 18%)",
        }}
      >
        <div className="flex flex-col" style={{ gap: 5 }}>
          <p style={{ fontSize: 14.5, fontWeight: 600 }}>{step.title}</p>
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55, textWrap: "pretty" }}>
            {step.body}
          </p>
        </div>

        <div className="flex items-center" style={{ gap: 10 }}>
          <span
            className="font-mono tabular-nums"
            style={{ fontSize: 11, color: "var(--ink-3)" }}
          >
            {index + 1}/{present.length}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={finish}
            className="ohd-hover rounded-lg"
            style={{ height: 30, padding: "0 10px", fontSize: 12.5, color: "var(--ink-3)" }}
          >
            {t("app.tour.skip")}
          </button>
          <button
            type="button"
            onClick={() => (last ? finish() : setIndex(index + 1))}
            className="rounded-lg font-semibold"
            style={{
              height: 30,
              padding: "0 14px",
              fontSize: 12.5,
              background: "var(--brand)",
              color: "var(--on-brand)",
            }}
          >
            {last ? t("app.tour.finish") : t("app.tour.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
