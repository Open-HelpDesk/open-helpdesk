/**
 * Pont entre l'éditeur visuel et le format stocké.
 *
 * L'agent ne voit jamais de balisage : il met en forme, et la conversion se fait
 * ici. Le format de stockage reste celui du portail, donc les articles déjà
 * publiés s'ouvrent sans migration et le rendu client ne change pas.
 *
 *   markupToHtml : format stocké → HTML de départ de l'éditeur
 *   docToMarkup  : document de l'éditeur → format stocké
 */
import { parseArticle, parseInline } from "./article-format";

/* ---------- Format stocké → HTML (chargement de l'éditeur) ---------- */

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
      const contenu = escapeHtml(token.text);
      switch (token.kind) {
        case "bold":
          return `<strong>${contenu}</strong>`;
        case "italic":
          return `<em>${contenu}</em>`;
        case "code":
          return `<code>${contenu}</code>`;
        case "link":
          return `<a href="${escapeHtml(token.href)}">${contenu}</a>`;
        default:
          return contenu;
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
          // Attribut dédié : la classe « language-… » se couperait au premier espace.
          const titre = block.title ? ` data-titre="${escapeHtml(block.title)}"` : "";
          return `<pre${titre}><code>${escapeHtml(block.body)}</code></pre>`;
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

/* ---------- Document de l'éditeur → format stocké (enregistrement) ---------- */

type Mark = { type: string; attrs?: Record<string, unknown> };
export type EditorNode = {
  type?: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
};

/** Applique les marques d'un fragment de texte. L'ordre reproduit le format. */
function textToMarkup(node: EditorNode): string {
  let out = node.text ?? "";
  if (!out) return "";
  const marks = node.marks ?? [];
  const has = (type: string) => marks.some((m) => m.type === type);

  // Le code littéral ne se combine pas avec l'emphase : il l'absorberait.
  if (has("code")) return `\`${out}\``;
  if (has("bold")) out = `**${out}**`;
  if (has("italic")) out = `*${out}*`;
  const lien = marks.find((m) => m.type === "link");
  if (lien?.attrs?.href) out = `[${out}](${String(lien.attrs.href)})`;
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

/** Texte d'un élément de liste : ses paragraphes, aplatis sur une ligne. */
function listItemText(item: EditorNode): string {
  return (item.content ?? [])
    .map((bloc) => inlineContent(bloc))
    .filter(Boolean)
    .join(" ");
}

/**
 * Sort les images de leurs parents : déposée dans une étape de liste, une image
 * reste un bloc à part entière dans le format stocké. Sans cela elle serait
 * simplement perdue à l'enregistrement.
 */
function hoisterImages(nodes: EditorNode[]): EditorNode[] {
  const sortie: EditorNode[] = [];
  for (const node of nodes) {
    if (node.type === "image") {
      sortie.push(node);
      continue;
    }
    const imagesInternes: EditorNode[] = [];
    const collecter = (n: EditorNode): EditorNode => ({
      ...n,
      content: (n.content ?? []).flatMap((child) => {
        if (child.type === "image") {
          imagesInternes.push(child);
          return [];
        }
        return [collecter(child)];
      }),
    });
    const nettoye = collecter(node);
    if ((nettoye.content ?? []).length > 0 || node.type === "codeBlock") sortie.push(nettoye);
    sortie.push(...imagesInternes);
  }
  return sortie;
}

export function docToMarkup(doc: EditorNode): string {
  const lignes: string[] = [];

  for (const node of hoisterImages(doc.content ?? [])) {
    switch (node.type) {
      case "heading": {
        const niveau = Number(node.attrs?.level ?? 2);
        lignes.push(`${niveau >= 3 ? "###" : "##"} ${inlineContent(node)}`, "");
        break;
      }
      case "blockquote": {
        for (const bloc of node.content ?? []) {
          const texte = inlineContent(bloc);
          if (texte) lignes.push(`> ${texte}`);
        }
        lignes.push("");
        break;
      }
      case "codeBlock": {
        const titre = String(node.attrs?.titre ?? "").trim();
        lignes.push(`\`\`\`${titre}`);
        lignes.push(...(node.content ?? []).map((c) => c.text ?? "").join("").split("\n"));
        lignes.push("```", "");
        break;
      }
      case "bulletList":
      case "orderedList": {
        const ordonnee = node.type === "orderedList";
        (node.content ?? []).forEach((item, i) => {
          const texte = listItemText(item);
          if (texte) lignes.push(ordonnee ? `${i + 1}. ${texte}` : `- ${texte}`);
        });
        lignes.push("");
        break;
      }
      case "image": {
        const src = String(node.attrs?.src ?? "");
        if (src) lignes.push(`![${String(node.attrs?.alt ?? "")}](${src})`, "");
        break;
      }
      default: {
        const texte = inlineContent(node);
        if (texte) lignes.push(texte, "");
      }
    }
  }

  return lignes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
