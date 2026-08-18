"use client";

/** PT-08 — « Copier » (presse-papiers) avec retour visuel bref. */
import { useState } from "react";
import { useT } from "@/i18n/client";

export function CopyButton({
  text,
  label,
  className,
  style,
}: {
  text: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* presse-papiers indisponible */
        }
      }}
    >
      {copied ? t("sso.copied") : label}
    </button>
  );
}
