"use client";

/**
 * Pièces jointes du portail (PT-04/PT-06) : dropzone dashed de la maquette et
 * bouton « 📎 Joindre un fichier », avec retour visuel des fichiers choisis.
 */
import { useRef, useState } from "react";
import { useT } from "@/i18n/client";

/** Un seul fichier : son nom, plus parlant qu'un décompte. Sinon, le décompte. */
function useFileLabel() {
  const t = useT();
  return (files: File[]): string => {
    if (files.length === 0) return "";
    if (files.length === 1) return files[0]!.name;
    return t("dropzone.selected", { count: files.length });
  };
}

/** Dropzone dashed (PT-04) : « Déposez vos fichiers ici » + input file caché. */
export function DropZone() {
  const t = useT();
  const fileLabel = useFileLabel();
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className="pt-dashed flex cursor-pointer flex-col items-center gap-[7px] rounded-[14px] p-[26px] text-center"
      style={{ background: "var(--canvas)" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (inputRef.current && e.dataTransfer.files.length > 0) {
          inputRef.current.files = e.dataTransfer.files;
          setFiles([...e.dataTransfer.files]);
        }
      }}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="var(--ink-3)"
        strokeWidth="1.7"
      >
        <path d="M12 16V4m0 0L8 8m4-4l4 4" />
        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <span className="text-[14.5px] font-medium">{t("dropzone.title")}</span>
      <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
        {t("dropzone.hint")}
      </span>
      {files.length > 0 && (
        <span className="text-[13px] font-medium" style={{ color: "var(--acc-2)" }}>
          📎 {fileLabel(files)}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        name="files"
        multiple
        className="sr-only"
        onChange={(e) => setFiles([...(e.target.files ?? [])])}
      />
    </label>
  );
}

/** Bouton discret « 📎 Joindre un fichier » de la barre de réponse (PT-06). */
export function AttachButton() {
  const t = useT();
  const fileLabel = useFileLabel();
  const [files, setFiles] = useState<File[]>([]);

  return (
    <label className="cursor-pointer text-sm" style={{ color: "var(--ink-2)" }}>
      📎 {files.length > 0 ? fileLabel(files) : t("attach.label")}
      <input
        type="file"
        name="files"
        multiple
        className="sr-only"
        onChange={(e) => setFiles([...(e.target.files ?? [])])}
      />
    </label>
  );
}
