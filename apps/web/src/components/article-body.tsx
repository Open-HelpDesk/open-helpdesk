import type { ReactNode } from "react";
import { parseInline, type ArticleBlock } from "@/lib/article-format";

/**
 * Rendu d'un corps d'article (PT-03) — mesures de la maquette : 68ch, 16.5/1.7.
 *
 * Aucune directive « use client » : le portail le rend côté serveur, l'aperçu de
 * l'éditeur le rend côté client. Le même composant des deux côtés, c'est ce qui
 * garantit que l'aperçu ne ment pas.
 */

function inline(text: string): ReactNode[] {
  return parseInline(text).map((token, i) => {
    switch (token.kind) {
      case "bold":
        return <strong key={i}>{token.text}</strong>;
      case "italic":
        return <em key={i}>{token.text}</em>;
      case "code":
        return (
          <code
            key={i}
            className="rounded px-1 py-0.5 font-mono text-[0.88em]"
            style={{ background: "var(--sunk)", color: "var(--ink-2)" }}
          >
            {token.text}
          </code>
        );
      case "link":
        return (
          <a
            key={i}
            href={token.href}
            style={{ color: "var(--acc)", textDecoration: "underline" }}
          >
            {token.text}
          </a>
        );
      default:
        return token.text;
    }
  });
}

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
          case "h3":
            return (
              <h3 key={i} id={block.id} className="mt-1 text-[17.5px] font-semibold">
                {block.text}
              </h3>
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
          case "list":
            // Les étapes numérotées portent une pastille : une procédure se suit
            // du regard, elle ne se lit pas comme un paragraphe.
            return block.ordered ? (
              <ol key={i} className="m-0 flex list-none flex-col gap-[11px] p-0">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3">
                    <span
                      className="mt-[3px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[12.5px] font-semibold"
                      style={{ background: "var(--acc-t)", color: "var(--acc)" }}
                    >
                      {j + 1}
                    </span>
                    <span className="min-w-0">{inline(item)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="m-0 flex list-none flex-col gap-[9px] p-0">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-[11px] h-[5px] w-[5px] shrink-0 rounded-full"
                      style={{ background: "var(--acc)" }}
                    />
                    <span className="min-w-0">{inline(item)}</span>
                  </li>
                ))}
              </ul>
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
                    style={{
                      background: "var(--sunk)",
                      borderColor: "var(--line)",
                      color: "var(--ink-3)",
                    }}
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
