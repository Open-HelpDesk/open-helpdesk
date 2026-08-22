/**
 * Bridge between the visual editor and the stored format.
 *
 * The agent never sees markup: they apply formatting, and the conversion happens
 * here. The storage format stays the portal's, so articles already published
 * open without migration and the client-side rendering does not change.
 *
 *   markupToHtml: stored format → the editor's starting HTML
 *   docToMarkup:  editor document → stored format
 */
import { parseArticle, parseInline } from "./article-format";

/* ---------- Stored format → HTML (editor loading) ---------- */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineToHtml(text: string): string {
  return parseInline(text)
    .map((token) => {
      const content = escapeHtml(token.text);
      switch (token.kind) {
        case "bold":
          return `<strong>${content}</strong>`;
        case "italic":
          return `<em>${content}</em>`;
        case "code":
          return `<code>${content}</code>`;
        case "link":
          return `<a href="${escapeHtml(token.href)}">${content}</a>`;
        default:
          return content;
      }
    })
    .join("");
}

export function markupToHtml(markup: string): string {
  if (!markup.trim()) return "";
  return parseArticle(markup)
    .map((block) => {
      switch (block.type) {
        case "h2":
          return `<h2>${inlineToHtml(block.text)}</h2>`;
        case "h3":
          return `<h3>${inlineToHtml(block.text)}</h3>`;
        case "callout":
          return `<blockquote><p>${inlineToHtml(block.text)}</p></blockquote>`;
        case "code": {
          // Dedicated attribute: a "language-…" class would be cut at the first space.
          const titleAttr = block.title ? ` data-titre="${escapeHtml(block.title)}"` : "";
          return `<pre${titleAttr}><code>${escapeHtml(block.body)}</code></pre>`;
        }
        case "list": {
          const items = block.items.map((i) => `<li><p>${inlineToHtml(i)}</p></li>`).join("");
          return block.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
        }
        case "image":
          return `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}">`;
        default:
          return `<p>${inlineToHtml(block.text)}</p>`;
      }
    })
    .join("");
}

/* ---------- Editor document → stored format (saving) ---------- */

type Mark = { type: string; attrs?: Record<string, unknown> };
export type EditorNode = {
  type?: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
};

/** Applies the marks of a text fragment. The order reproduces the format. */
function textToMarkup(node: EditorNode): string {
  let out = node.text ?? "";
  if (!out) return "";
  const marks = node.marks ?? [];
  const has = (type: string) => marks.some((m) => m.type === type);

  // Literal code does not combine with emphasis: it would absorb it.
  if (has("code")) return `\`${out}\``;
  if (has("bold")) out = `**${out}**`;
  if (has("italic")) out = `*${out}*`;
  const link = marks.find((m) => m.type === "link");
  if (link?.attrs?.href) out = `[${out}](${String(link.attrs.href)})`;
  return out;
}

function inlineContent(node: EditorNode): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === "text") return textToMarkup(child);
      if (child.type === "hardBreak") return " ";
      return inlineContent(child);
    })
    .join("")
    .trim();
}

/** Text of a list item: its paragraphs, flattened onto one line. */
function listItemText(item: EditorNode): string {
  return (item.content ?? [])
    .map((block) => inlineContent(block))
    .filter(Boolean)
    .join(" ");
}

/**
 * Lifts images out of their parents: dropped inside a list step, an image stays a
 * block in its own right in the stored format. Without this it would simply be
 * lost on saving.
 */
function hoistImages(nodes: EditorNode[]): EditorNode[] {
  const out: EditorNode[] = [];
  for (const node of nodes) {
    if (node.type === "image") {
      out.push(node);
      continue;
    }
    const innerImages: EditorNode[] = [];
    const collect = (n: EditorNode): EditorNode => ({
      ...n,
      content: (n.content ?? []).flatMap((child) => {
        if (child.type === "image") {
          innerImages.push(child);
          return [];
        }
        return [collect(child)];
      }),
    });
    const cleaned = collect(node);
    if ((cleaned.content ?? []).length > 0 || node.type === "codeBlock") out.push(cleaned);
    out.push(...innerImages);
  }
  return out;
}

export function docToMarkup(doc: EditorNode): string {
  const lines: string[] = [];

  for (const node of hoistImages(doc.content ?? [])) {
    switch (node.type) {
      case "heading": {
        const level = Number(node.attrs?.level ?? 2);
        lines.push(`${level >= 3 ? "###" : "##"} ${inlineContent(node)}`, "");
        break;
      }
      case "blockquote": {
        for (const block of node.content ?? []) {
          const text = inlineContent(block);
          if (text) lines.push(`> ${text}`);
        }
        lines.push("");
        break;
      }
      case "codeBlock": {
        const title = String(node.attrs?.titre ?? "").trim();
        lines.push(`\`\`\`${title}`);
        lines.push(...(node.content ?? []).map((c) => c.text ?? "").join("").split("\n"));
        lines.push("```", "");
        break;
      }
      case "bulletList":
      case "orderedList": {
        const ordered = node.type === "orderedList";
        (node.content ?? []).forEach((item, i) => {
          const text = listItemText(item);
          if (text) lines.push(ordered ? `${i + 1}. ${text}` : `- ${text}`);
        });
        lines.push("");
        break;
      }
      case "image": {
        const src = String(node.attrs?.src ?? "");
        if (src) lines.push(`![${String(node.attrs?.alt ?? "")}](${src})`, "");
        break;
      }
      default: {
        const text = inlineContent(node);
        if (text) lines.push(text, "");
      }
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
