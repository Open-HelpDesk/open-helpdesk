"use client";

/**
 * AG-04 — Pièces jointes d'un message : vignettes 138 px pour les images (clic →
 * visionneuse overlay : zoom 60–160 %, précédente/suivante, Télécharger, ✕),
 * chips pour les autres fichiers.
 */
import { useEffect, useState } from "react";
import { sizeFr } from "@/lib/format";

export type AttachmentData = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

export function MessageAttachments({
  attachments,
  senderName,
}: {
  attachments: AttachmentData[];
  senderName: string;
}) {
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
        <div className="mt-2.5 flex flex-wrap gap-2">
          {images.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setViewerIndex(i);
                setZoom(100);
              }}
              className="overflow-hidden border text-left"
              style={{
                width: 138,
                borderRadius: 8,
                borderColor: "var(--line)",
                background: "var(--bg)",
                cursor: "zoom-in",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/attachments/${a.id}`}
                alt={a.filename}
                style={{ width: "100%", height: 84, objectFit: "cover", display: "block" }}
              />
              <span className="block px-2 py-1">
                <span className="block truncate" style={{ fontSize: 11, fontWeight: 500 }}>
                  {a.filename}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                  {sizeFr(a.sizeBytes)}
                </span>
              </span>
            </button>
          ))}
          {files.map((a) => (
            <a
              key={a.id}
              href={`/api/attachments/${a.id}`}
              className="inline-flex items-center gap-1.5 border px-2 py-1"
              style={{
                borderRadius: 6,
                borderColor: "var(--line)",
                background: "var(--sunk)",
                fontSize: 11.5,
                fontFamily: "var(--font-mono)",
                color: "var(--ink-2)",
              }}
            >
              📎 {a.filename}
              <span style={{ color: "var(--ink-3)" }}>{sizeFr(a.sizeBytes)}</span>
            </a>
          ))}
        </div>
      )}

      {/* Visionneuse */}
      {current && viewerIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "rgba(6,12,10,.86)" }}
          onClick={() => setViewerIndex(null)}
        >
          {/* En-tête */}
          <div
            className="flex items-center gap-3 px-4"
            style={{ height: 52, color: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="min-w-0 truncate text-[13px] font-semibold">
              {current.filename}
            </span>
            <span className="hidden text-[11.5px] sm:inline" style={{ color: "rgba(255,255,255,.65)" }}>
              {sizeFr(current.sizeBytes)} · reçue de {senderName}
            </span>
            <span className="flex-1" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(60, z - 20))}
                className="rounded px-2 py-1 text-[14px]"
                style={{ background: "rgba(255,255,255,.12)" }}
                title="Réduire"
              >
                −
              </button>
              <span className="w-12 text-center text-[12px] tabular-nums">{zoom} %</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(160, z + 20))}
                className="rounded px-2 py-1 text-[14px]"
                style={{ background: "rgba(255,255,255,.12)" }}
                title="Agrandir"
              >
                +
              </button>
            </div>
            <a
              href={`/api/attachments/${current.id}`}
              className="rounded px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              Télécharger
            </a>
            <button
              type="button"
              onClick={() => setViewerIndex(null)}
              className="rounded px-2 py-1.5 text-[14px]"
              style={{ background: "rgba(255,255,255,.12)" }}
              title="Fermer"
            >
              ✕
            </button>
          </div>

          {/* Image */}
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
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
                borderRadius: 6,
              }}
            />
          </div>

          {/* Pied */}
          {images.length > 1 && (
            <div
              className="flex items-center justify-center gap-4 pb-4"
              style={{ color: "rgba(255,255,255,.8)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                disabled={viewerIndex === 0}
                onClick={() => {
                  setViewerIndex((i) => Math.max(0, (i ?? 0) - 1));
                  setZoom(100);
                }}
                className="rounded px-2 py-1 disabled:opacity-40"
                style={{ background: "rgba(255,255,255,.12)" }}
                title="Précédente"
              >
                ←
              </button>
              <span className="text-[12px]">
                Pièce jointe {viewerIndex + 1} sur {images.length}
              </span>
              <button
                type="button"
                disabled={viewerIndex === images.length - 1}
                onClick={() => {
                  setViewerIndex((i) => Math.min(images.length - 1, (i ?? 0) + 1));
                  setZoom(100);
                }}
                className="rounded px-2 py-1 disabled:opacity-40"
                style={{ background: "rgba(255,255,255,.12)" }}
                title="Suivante"
              >
                →
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
