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

  return (
    <div
      className="flex flex-col gap-[13px] rounded-xl border p-5"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <p className="text-base font-semibold">Cet article vous a-t-il aidé ?</p>
      <div className="flex gap-[9px]">
        <button
          type="button"
          onClick={() => cast("up")}
          className="flex h-11 items-center gap-2 rounded-[9px] border px-5 text-[15px] font-medium"
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
          className="flex h-11 items-center gap-2 rounded-[9px] border px-5 text-[15px] font-medium"
          style={
            vote === "down"
              ? { borderColor: "var(--wait)", background: "var(--wait-t)", color: "var(--wait)" }
              : { borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }
          }
        >
          👎 Non
        </button>
      </div>
      {vote === "down" && (
        <div
          className="flex flex-col gap-2.5 rounded-[9px] p-[15px]"
          style={{ background: "var(--wait-t)" }}
        >
          <p className="text-[15px]" style={{ color: "var(--ink)" }}>
            Désolé que cet article n'ait pas répondu à votre question. Voulez-vous en parler à
            notre équipe ?
          </p>
          <Link
            href={prefill}
            className="grid h-[42px] w-fit place-items-center rounded-lg px-[17px] text-[14.5px] font-semibold text-white hover:no-underline"
            style={{ background: "var(--acc)" }}
          >
            Créer une demande pré-remplie
          </Link>
        </div>
      )}
      {vote === "up" && (
        <p className="text-[14.5px]" style={{ color: "var(--ok)" }}>
          Merci pour votre retour.
        </p>
      )}
    </div>
  );
}
