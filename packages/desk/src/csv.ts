/**
 * A small RFC 4180 reader for the directory and hardware imports: quoted
 * fields, doubled quotes, CRLF, a BOM, and `;` as well as `,` (a spreadsheet
 * saved in a French locale writes semicolons).
 */
export type CsvRow = { line: number; values: Record<string, string> };

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

export function parseCsv(input: string): { headers: string[]; rows: CsvRow[] } {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = detectDelimiter(firstLine);
  const records: Array<{ line: number; fields: string[] }> = [];
  let field = "";
  let fields: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delim) {
      fields.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      fields.push(field);
      records.push({ line: recordLine, fields });
      fields = [];
      field = "";
      line++;
      recordLine = line;
    } else field += c;
  }
  if (field !== "" || fields.length > 0) {
    fields.push(field);
    records.push({ line: recordLine, fields });
  }
  const nonEmpty = records.filter((r) => r.fields.some((f) => f.trim() !== ""));
  const [head, ...body] = nonEmpty;
  if (!head) return { headers: [], rows: [] };
  const headers = head.fields.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  return {
    headers,
    rows: body.map((r) => ({
      line: r.line,
      values: Object.fromEntries(headers.map((h, i) => [h, (r.fields[i] ?? "").trim()])),
    })),
  };
}
