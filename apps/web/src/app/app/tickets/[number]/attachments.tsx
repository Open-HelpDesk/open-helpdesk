"use client";

/**
 * AG-04 — Attachments of a message: 138 px thumbnails for images (click →
 * overlay viewer: zoom 60–160%, previous/next, Download, ✕),
 * chips for the other files.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { size } from "@/lib/format";
import { useT } from "@/i18n/client";

export type AttachmentData = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

/** Viewer borders — same light palette as the design (dark overlay). */
const VIEWER_INK = "#F2FBF7";
const VIEWER_LINE = "1px solid rgba(242,251,247,.24)";

export function MessageAttachments({
  attachments,
  senderName,
  borderColor = "var(--line)",
}: {
  attachments: AttachmentData[];
  senderName: string;
  /** Border of the carrying card — the design reuses the color of the message. */
  borderColor?: string;
}) {
  const t = useT();
  const images = attachments.filter((a) => a.contentType.startsWith("image/"));
  const files = attachments.filter((a) => !a.contentType.startsWith("image/"));
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (viewerIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewerIndex(null);
      if (e.key === "ArrowLeft") setViewerIndex((i) => (i !== null ? Math.max(0, i - 1) : i));
      if (e.key === "ArrowRight")
        setViewerIndex((i) => (i !== null ? Math.min(images.length - 1, i + 1) : i));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, images.length]);

  const current = viewerIndex !== null ? images[viewerIndex] : null;

  return (
    <>
      {(images.length > 0 || files.length > 0) && (
        <div
          className="flex flex-wrap"
          style={{ padding: "0 12px 11px", gap: 9 }}
        >
          {images.map((a, i) => (
            <button
              key={a.id}
              type="button"
              title={a.filename}
              onClick={() => {
                setViewerIndex(i);
                setZoom(100);
              }}
              className="ohd-hover-acc overflow-hidden text-left"
              style={{
                width: 138,
                borderRadius: 8,
                // The resting rule goes through --edge and not through `border`: a
                // border color set inline would beat the class's :hover, and the
                // thumbnail would stay inert on hover.
                "--edge": borderColor,
                background: "var(--panel)",
                cursor: "zoom-in",
              } as CSSProperties}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/attachments/${a.id}`}
                alt={a.filename}
                style={{
                  width: "100%",
                  height: 84,
                  objectFit: "cover",
                  objectPosition: "top center",
                  display: "block",
                  background: "var(--sunk)",
                }}
              />
              <span
                className="flex items-center"
                style={{
                  gap: 6,
                  padding: "6px 8px",
                  borderTop: `1px solid ${borderColor}`,
                }}
              >
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 11.5 }}>
                  {a.filename}
                </span>
                <span
                  className="whitespace-nowrap"
                  style={{ fontSize: 10.5, color: "var(--ink-3)" }}
                >
                  {size(t, a.sizeBytes)}
                </span>
              </span>
            </button>
          ))}
          {files.map((a) => (
            <a
              key={a.id}
              href={`/api/attachments/${a.id}`}
              className="inline-flex items-center self-start"
              style={{
                gap: 7,
                padding: "7px 10px",
                borderRadius: 8,
                border: `1px solid ${borderColor}`,
                background: "var(--panel)",
                fontSize: 12,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="var(--ink-3)"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M14 3v5h5" />
                <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
              </svg>
              <span>{a.filename}</span>
              <span style={{ color: "var(--ink-3)", fontSize: 10.5 }}>
                {size(t, a.sizeBytes)}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Viewer */}
      {current && viewerIndex !== null && (
        <div
          className="ohd-rise-viewer fixed inset-0 z-[80] flex flex-col"
          style={{ background: "var(--scrim-viewer)", color: VIEWER_INK }}
          onClick={() => setViewerIndex(null)}
        >
          {/* Header: name + meta, zoom, Download, ✕ */}
          <div
            className="flex shrink-0 items-center"
            style={{
              gap: 12,
              padding: "12px 18px",
              borderBottom: "1px solid rgba(242,251,247,.14)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="shrink-0"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 16l5-5 4 4 3-3 6 6" />
              <circle cx="9" cy="9" r="1.6" />
            </svg>
            <div className="flex min-w-0 flex-col">
              <span className="truncate" style={{ fontSize: 13.5, fontWeight: 600 }}>
                {current.filename}
              </span>
              <span style={{ fontSize: 11.5, opacity: 0.6 }}>
                {t("app.ticket.attachmentMeta", {
                  size: size(t, current.sizeBytes),
                  name: senderName,
                })}
              </span>
            </div>
            <span className="flex-1" />
            <div
              className="flex items-center"
              style={{
                gap: 2,
                padding: 2,
                background: "rgba(242,251,247,.1)",
                borderRadius: 7,
              }}
            >
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(60, z - 20))}
                className="grid place-items-center"
                style={{ width: 30, height: 26, borderRadius: 5, fontSize: 15 }}
                title={t("app.ticket.zoomOut")}
              >
                −
              </button>
              <span
                className="text-center tabular-nums"
                style={{ minWidth: 52, fontSize: 12 }}
              >
                {t("app.ticket.zoomPercent", { value: zoom })}
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(160, z + 20))}
                className="grid place-items-center"
                style={{ width: 30, height: 26, borderRadius: 5, fontSize: 15 }}
                title={t("app.ticket.zoomIn")}
              >
                +
              </button>
            </div>
            <a
              href={`/api/attachments/${current.id}`}
              className="grid place-items-center whitespace-nowrap"
              style={{ height: 28, padding: "0 11px", border: VIEWER_LINE, borderRadius: 6, fontSize: 12.5 }}
            >
              {t("app.ticket.download")}
            </a>
            <button
              type="button"
              onClick={() => setViewerIndex(null)}
              className="grid place-items-center"
              style={{ width: 28, height: 28, borderRadius: 6, fontSize: 14, opacity: 0.7 }}
              title={t("app.ticket.close")}
            >
              ✕
            </button>
          </div>

          {/* Image */}
          <div
            className="grid min-h-0 flex-1 place-items-center overflow-auto"
            style={{ padding: 24, cursor: "zoom-out" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attachments/${current.id}`}
              alt={current.filename}
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "88%",
                maxHeight: "100%",
                transform: `scale(${zoom / 100})`,
                transition: "transform .12s ease",
                borderRadius: 8,
                boxShadow: "0 24px 70px rgba(0,0,0,.6)",
              }}
            />
          </div>

          {/* Footer: "Attachment 1 of 2" + ← / → */}
          <div
            className="flex shrink-0 items-center"
            style={{
              gap: 10,
              padding: "10px 18px",
              borderTop: "1px solid rgba(242,251,247,.14)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: 11.5, opacity: 0.55 }}>
              {t("app.ticket.attachmentPosition", {
                index: viewerIndex + 1,
                total: images.length,
              })}
            </span>
            <span className="flex-1" />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={viewerIndex === 0}
                  onClick={() => {
                    setViewerIndex((i) => Math.max(0, (i ?? 0) - 1));
                    setZoom(100);
                  }}
                  className="grid place-items-center whitespace-nowrap disabled:opacity-40"
                  style={{ height: 28, padding: "0 12px", border: VIEWER_LINE, borderRadius: 6, fontSize: 12.5 }}
                >
                  {t("app.ticket.previousAttachment")}
                </button>
                <button
                  type="button"
                  disabled={viewerIndex === images.length - 1}
                  onClick={() => {
                    setViewerIndex((i) => Math.min(images.length - 1, (i ?? 0) + 1));
                    setZoom(100);
                  }}
                  className="grid place-items-center whitespace-nowrap disabled:opacity-40"
                  style={{ height: 28, padding: "0 12px", border: VIEWER_LINE, borderRadius: 6, fontSize: 12.5 }}
                >
                  {t("app.ticket.nextAttachment")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
