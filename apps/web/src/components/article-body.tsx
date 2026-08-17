import type { ReactNode } from "react";
import { parseInline, type ArticleBlock } from "@/lib/article-format";

/**
 * Rendu d'un corps d'article (PT-03) — mesures de la maquette : 66ch, 17/1.75.
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
      className="flex max-w-[66ch] flex-col gap-[18px] text-[17px] leading-[1.75]"
      style={{ textWrap: "pretty" }}
    >
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={i}
                id={block.id}
                className="pt-h2 pt-title mt-3.5 text-[25px] leading-[1.2] tracking-[-0.015em]"
              >
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} id={block.id} className="mt-1 text-[18px] font-semibold">
                {block.text}
              </h3>
            );
          case "callout":
            // La maquette a troqué le filet latéral pour une carte teintée à icône :
            // l'encadré se lit comme un aparté, plus comme une citation.
            return (
              <div
                key={i}
                className="flex items-start gap-[13px] rounded-[14px] border px-[19px] py-[17px]"
                style={{ background: "var(--acc-t)", borderColor: "var(--acc-b)" }}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="var(--acc)"
                  strokeWidth="1.9"
                  className="mt-[3px] flex-none"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8h.01M11 12h1v5h1" />
                </svg>
                <span className="text-[15.5px] leading-[1.6]" style={{ color: "var(--ink)" }}>
                  {inline(block.text)}
                </span>
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
          case "image":
            return (
              // Dimensions inconnues à l'écriture : le ratio est porté par l'image.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={block.src}
                alt={block.alt}
                className="h-auto max-w-full rounded-[14px] border"
                style={{ borderColor: "var(--line)" }}
              />
            );
          case "code":
            return (
              <div
                key={i}
                className="overflow-hidden rounded-xl border"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                {block.title && (
                  <div
                    className="border-b px-[15px] py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.09em]"
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
                  className="overflow-x-auto whitespace-pre p-[15px] font-mono text-sm"
                  style={{ color: "var(--ink)" }}
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
