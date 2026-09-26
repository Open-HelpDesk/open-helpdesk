"use client";

/**
 * CSV import dialog shared by the directory (SD-A5) and the hardware inventory
 * (SD-A7): a file or pasted text, then the report line by line — a rejected
 * line is named with its reason, never dropped in silence.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";
import type { CsvImportReport } from "@/lib/desk";
import type { DeskActionResult } from "@/lib/desk/it-guard";
import { btnStyle, inputStyle, labelStyle, Overlay, useToast } from "./ui";

export function CsvImportDialog({
  open,
  onClose,
  title,
  hint,
  run,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  run: (csv: string) => Promise<DeskActionResult<CsvImportReport>>;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<CsvImportReport | null>(null);

  // The importer reports a stable code per rejected line; its sentence lives
  // in the domain area (csv.* first, then the generic error.* codes).
  const reason = (code: string) => {
    for (const key of [`desk.domain.csv.${code}`, `desk.domain.error.${code}`] as MessageKey[]) {
      const text = t(key);
      if (text !== key) return text;
    }
    return code;
  };

  const close = () => {
    setCsv("");
    setReport(null);
    onClose();
  };

  return (
    <Overlay open={open} onClose={close} title={title} width={560}>
      <form
        className="flex flex-col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await run(csv);
            if (res.ok) {
              setReport(res.value);
              router.refresh();
            } else toast(t("desk.it.common.error", { message: res.error }), "error");
          });
        }}
      >
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{hint}</p>
        <label className="flex flex-col" style={{ gap: 6 }}>
          <span style={labelStyle}>{t("desk.it.import.file")}</span>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setCsv(await file.text());
            }}
            style={{ fontSize: 12.5 }}
          />
        </label>
        <label className="flex flex-col" style={{ gap: 6 }}>
          <span style={labelStyle}>{t("desk.it.import.paste")}</span>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            spellCheck={false}
            style={{ ...inputStyle, height: "auto", padding: "9px 11px", fontFamily: "var(--font-mono)", fontSize: 12, resize: "vertical" }}
          />
        </label>

        {report && (
          <div role="status" style={{ padding: "12px 14px", borderRadius: 11, background: "var(--sunk)", fontSize: 12.5, lineHeight: 1.5 }}>
            <p style={{ fontWeight: 600, color: "var(--ink)" }}>{t("desk.it.import.result", { created: report.created, updated: report.updated })}</p>
            {report.errors.length > 0 && (
              <>
                <p style={{ marginTop: 6, color: "var(--dang)", fontWeight: 600 }}>{t("desk.it.import.errors", { count: report.errors.length })}</p>
                <ul style={{ marginTop: 4, maxHeight: 180, overflow: "auto", color: "var(--ink-2)" }}>
                  {report.errors.map((err, i) => (
                    <li key={`${err.line}-${i}`}>{t("desk.it.import.line", { line: String(err.line), message: reason(err.message) })}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end" style={{ gap: 8 }}>
          <button type="button" className="ohd-hover" style={btnStyle("ghost")} onClick={close}>
            {report ? t("desk.it.common.close") : t("desk.it.common.cancel")}
          </button>
          <button type="submit" disabled={pending || !csv.trim()} style={btnStyle("primary")}>
            {pending ? t("desk.it.import.running") : t("desk.it.import.run")}
          </button>
        </div>
      </form>
    </Overlay>
  );
}
