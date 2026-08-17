/**
 * Format des articles de la base de connaissances — analyseur partagé.
 *
 * C'est LE contrat entre l'éditeur (agent) et le portail (client) : les deux
 * importent ce module, donc l'aperçu montre exactement ce que le client verra.
 * Un balisage léger, volontairement limité à ce qu'un article de support demande.
 *
 * Blocs   : « ## » titre · « ### » sous-titre · « > » encadré · ``` bloc de code
 *           (le texte après les backticks devient l'en-tête) · « - » liste à puces
 *           · « 1. » étapes numérotées · ligne vide = nouveau paragraphe.
 * En ligne : **gras** · *italique* · `code` · [texte](https://lien).
 * Image   : ![description](url) seule sur sa ligne.
 */

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type ArticleBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string; id: string }
  | { type: "h3"; text: string; id: string }
  | { type: "callout"; text: string }
  | { type: "code"; title: string; body: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "image"; src: string; alt: string };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

export function parseArticle(body: string): ArticleBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "p", text: paragraph.join(" ") });
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith("```")) {
      flush();
      const title = line.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        code.push(lines[i]!);
        i += 1;
      }
      i += 1; // fence de fermeture
      blocks.push({ type: "code", title, body: code.join("\n") });
      continue;
    }

    const image = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (image) {
      flush();
      blocks.push({ type: "image", src: image[2]!, alt: image[1]! });
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      flush();
      const text = line.slice(4).trim();
      blocks.push({ type: "h3", text, id: slugify(text) });
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      flush();
      const text = line.slice(3).trim();
      blocks.push({ type: "h2", text, id: slugify(text) });
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      flush();
      const parts = [line.slice(2)];
      i += 1;
      while (i < lines.length && lines[i]!.startsWith("> ")) {
        parts.push(lines[i]!.slice(2));
        i += 1;
      }
      blocks.push({ type: "callout", text: parts.join(" ") });
      continue;
    }

    // Listes : les lignes consécutives du même type forment un seul bloc.
    const numbered = line.match(NUMBERED);
    const bullet = numbered ? null : line.match(BULLET);
    if (numbered || bullet) {
      flush();
      const ordered = Boolean(numbered);
      const items: string[] = [(numbered ?? bullet)![1]!.trim()];
      i += 1;
      while (i < lines.length) {
        const next = lines[i]!;
        const m = ordered ? next.match(NUMBERED) : next.match(BULLET);
        if (!m) break;
        items.push(m[1]!.trim());
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (line.trim() === "") {
      flush();
      i += 1;
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }
  flush();
  return blocks;
}

// L'ordre compte : **gras** avant *italique*, sinon les deux astérisques se coupent.
const INLINE =
  /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Découpe un texte en fragments stylés — sans React, donc testable et partageable. */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index;
    if (start > last) tokens.push({ kind: "text", text: text.slice(last, start) });
    if (m[1] !== undefined) tokens.push({ kind: "bold", text: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: "italic", text: m[2] });
    else if (m[3] !== undefined) tokens.push({ kind: "code", text: m[3] });
    else if (m[4] !== undefined && m[5] !== undefined) {
      tokens.push({ kind: "link", text: m[4], href: m[5] });
    }
    last = start + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });
  return tokens;
}

/** Texte brut d'un article — extraits de liste et temps de lecture. */
export function plainText(body: string): string {
  return parseArticle(body)
    .map((b) => {
      if (b.type === "code") return b.body;
      if (b.type === "list") return b.items.join(" ");
      if (b.type === "image") return b.alt;
      return b.text;
    })
    .join(" ")
    .replace(/[*`]/g, "");
}
