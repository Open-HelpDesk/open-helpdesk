"use client";

/**
 * Pièces jointes du portail (PT-04/PT-06) : dropzone dashed de la maquette et
 * bouton « 📎 Joindre un fichier », avec retour visuel des fichiers choisis.
 */
import { useRef, useState } from "react";

function fileLabel(files: File[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0]!.name;
  return `${files.length} fichiers sélectionnés`;
}

/** Dropzone dashed (PT-04) : « Déposez vos fichiers ici » + input file caché. */
export function DropZone() {
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-dashed p-5 text-center"
      style={{ borderColor: "var(--line)" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (inputRef.current && e.dataTransfer.files.length > 0) {
          inputRef.current.files = e.dataTransfer.files;
          setFiles([...e.dataTransfer.files]);
        }
      }}
    >
      <span className="text-[14.5px] font-medium">Déposez vos fichiers ici</span>
      <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
        PNG, JPG, PDF — 10 Mo maximum
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
  const [files, setFiles] = useState<File[]>([]);

  return (
    <label className="cursor-pointer text-sm" style={{ color: "var(--ink-2)" }}>
      📎 {files.length > 0 ? fileLabel(files) : "Joindre un fichier"}
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
