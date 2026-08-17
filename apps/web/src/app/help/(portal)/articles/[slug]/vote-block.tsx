"use client";

/**
 * PT-03 — « Cet article vous a-t-il aidé ? » : états votés (👍 ok / 👎 wait),
 * panneau « Créer une demande pré-remplie » après un 👎. Le vote est compté
 * côté serveur par l'action voteArticle (une fois par session de page).
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { voteArticle } from "../../../actions";

export function VoteBlock({ slug, title }: { slug: string; title: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [, startTransition] = useTransition();

  function cast(next: "up" | "down") {
    if (vote === next) return;
    setVote(next);
    const data = new FormData();
    data.set("slug", slug);
    data.set("vote", next);
    startTransition(() => voteArticle(data));
  }

  const prefill = `/help/requests/new?subject=${encodeURIComponent(`Au sujet de l'article « ${title} »`)}`;

  // La maquette n'encadre plus le bloc : un filet horizontal le sépare du corps,
  // et la question tient sur la même ligne que les deux boutons en pilule.
  return (
    <div
      className="mt-2.5 flex flex-col gap-[15px] border-t pt-6"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-[16.5px] font-semibold tracking-[-0.01em]">
          Cet article vous a-t-il aidé ?
        </p>
        <span className="flex-1" />
        <div className="flex gap-[9px]">
          <button
            type="button"
            onClick={() => cast("up")}
            className="flex h-11 items-center gap-2 rounded-full border px-5 text-[14.5px] font-medium transition-all duration-150"
            style={
              vote === "up"
                ? { borderColor: "var(--ok)", background: "var(--ok-t)", color: "var(--ok)" }
                : { borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }
            }
          >
            👍 Oui
          </button>
          <button
            type="button"
            onClick={() => cast("down")}
            className="flex h-11 items-center gap-2 rounded-full border px-5 text-[14.5px] font-medium transition-all duration-150"
            style={
              vote === "down"
                ? { borderColor: "var(--wait)", background: "var(--wait-t)", color: "var(--wait)" }
                : { borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }
            }
          >
            👎 Non
          </button>
        </div>
      </div>
      {vote === "down" && (
        <div
          className="flex flex-col gap-3 rounded-[14px] border px-[19px] py-[17px]"
          style={{ background: "var(--wait-t)", borderColor: "var(--wait-t)" }}
        >
          <p className="text-[15px]" style={{ color: "var(--ink)", textWrap: "pretty" }}>
            Désolé que cet article n'ait pas répondu à votre question. Voulez-vous en parler à
            notre équipe ?
          </p>
          <Link
            href={prefill}
            className="grid h-11 w-fit place-items-center rounded-[10px] px-[18px] text-[14.5px] font-semibold text-white hover:no-underline"
            style={{ background: "var(--cta-a)" }}
          >
            Créer une demande pré-remplie
          </Link>
        </div>
      )}
      {vote === "up" && (
        <p className="text-[14.5px] font-medium" style={{ color: "var(--ok)" }}>
          Merci pour votre retour.
        </p>
      )}
    </div>
  );
}
