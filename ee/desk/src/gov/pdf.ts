/**
 * A minimal, valid PDF 1.4 of text lines — enough for a timestamped audit
 * evidence, without pulling a PDF library into the product.
 *
 * Standard 14 fonts only (Helvetica, Helvetica-Bold, Courier) in
 * WinAnsiEncoding: Latin-1 accents render; characters outside it become "?".
 * A4 landscape, lines paginated automatically.
 */

export type PdfLine = { text: string; font?: "regular" | "bold" | "mono"; size?: number; gapBefore?: number };

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 40;

/** WinAnsi differs from Latin-1 on 0x80–0x9F; map the few typographic ones people type. */
const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
};

function encodeText(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    let code = ch.codePointAt(0)!;
    if (WIN_ANSI_EXTRA[ch] !== undefined) code = WIN_ANSI_EXTRA[ch]!;
    else if (code > 0xff || (code >= 0x80 && code < 0xa0) || code < 0x20) code = 0x3f; // "?"
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += "\\" + String.fromCharCode(code);
    else if (code > 0x7e) out += "\\" + code.toString(8).padStart(3, "0");
    else out += String.fromCharCode(code);
  }
  return out;
}

/** Info-dictionary strings are PDFDocEncoding, not WinAnsi: write them as UTF-16BE. */
function utf16Hex(s: string): string {
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

const FONT_RES: Record<NonNullable<PdfLine["font"]>, string> = { regular: "F1", bold: "F2", mono: "F3" };

export function buildPdf(lines: PdfLine[], meta: { title: string; createdAt: Date }): Uint8Array {
  // Paginate.
  const pages: string[] = [];
  let ops: string[] = [];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const size = line.size ?? 10;
    const advance = (line.gapBefore ?? 0) + size * 1.35;
    if (y - advance < MARGIN) {
      pages.push(ops.join("\n"));
      ops = [];
      y = PAGE_H - MARGIN;
    }
    y -= advance;
    ops.push(`BT /${FONT_RES[line.font ?? "regular"]} ${size} Tf ${MARGIN} ${y.toFixed(2)} Td (${encodeText(line.text)}) Tj ET`);
  }
  pages.push(ops.join("\n"));

  // Objects: 1 catalog, 2 pages, 3-5 fonts, 6 info, then (page, content) pairs.
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 7 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  const d = meta.createdAt;
  const pdfDate = `D:${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;
  objects[6] = `<< /Title ${utf16Hex(meta.title)} /Producer (Open HelpDesk) /CreationDate (${pdfDate}) >>`;
  pages.forEach((content, i) => {
    const pageId = pageIds[i]!;
    const stream = Buffer.from(content, "latin1");
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${content}\nendstream`;
  });

  // Serialise with byte offsets for the xref table.
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let offset = chunks[0]!.length;
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    const body = Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, "latin1");
    offsets[id] = offset;
    chunks.push(body);
    offset += body.length;
  }
  const count = objects.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return new Uint8Array(Buffer.concat(chunks));
}
