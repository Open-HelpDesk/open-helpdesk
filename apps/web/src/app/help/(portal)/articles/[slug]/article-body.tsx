import type { ReactNode } from "react";

/**
 * Mini-renderer du corps d'article (PT-03) — le format de la KB est un texte
 * balisé léger : « ## » → h2, « > » → callout, bloc ``` (1re ligne = titre
 * d'en-tête), **gras**, paragraphes séparés par une ligne vide.
 */

export type ArticleBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string; id: string }
  | { type: "callout"; text: string }
  | { type: "code"; title: string; body: string };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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

/** **gras** → <strong>. */
function inline(text: string): ReactNode[] {
  return text
    .split(/\*\*([^*]+)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/** Corps 68ch, 16.5/1.7 — styles de la maquette PT-03. */
export function ArticleBody({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <div
      className="flex max-w-[68ch] flex-col gap-[17px] text-[16.5px] leading-[1.7]"
      style={{ textWrap: "pretty" }}
    >
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={i}
                id={block.id}
                className="pt-h2 mt-2.5 text-[22px] font-semibold tracking-[-0.015em]"
              >
                {block.text}
              </h2>
            );
          case "callout":
            return (
              <div
                key={i}
                className="rounded-r-[10px] px-[18px] py-[15px] text-[15.5px]"
                style={{ background: "var(--acc-t)", borderLeft: "3px solid var(--acc)" }}
              >
                {inline(block.text)}
              </div>
            );
          case "code":
            return (
              <div
                key={i}
                className="overflow-hidden rounded-[10px] border"
                style={{ borderColor: "var(--line)" }}
              >
                {block.title && (
                  <div
                    className="border-b px-3.5 py-[9px] font-mono text-[13px]"
                    style={{ background: "var(--sunk)", borderColor: "var(--line)", color: "var(--ink-3)" }}
                  >
                    {block.title}
                  </div>
                )}
                <div
                  className="overflow-x-auto whitespace-pre p-3.5 font-mono text-sm"
                  style={{ color: "var(--ink-2)" }}
                >
                  {block.body}
                </div>
              </div>
            );
          default:
            return (
              <p key={i} className="m-0">
                {inline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
