"use client";

/**
 * PT-03 — "Did this article help you?": voted states (👍 ok / 👎 wait),
 * "Create a pre-filled request" panel after a 👎. The vote is counted
 * server-side by the voteArticle action (once per page session).
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { voteArticle } from "../../../actions";
import { useT } from "@/i18n/client";

export function VoteBlock({ slug, title }: { slug: string; title: string }) {
  const t = useT();
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

  const subject = t("vote.prefillSubject", { title });
  const prefill = `/help/requests/new?subject=${encodeURIComponent(subject)}`;

  // The mockup no longer boxes the block: a horizontal rule separates it from the
  // body, and the question sits on the same line as the two pill buttons.
  return (
    <div
      className="mt-2.5 flex flex-col gap-[15px] border-t pt-6"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-[16.5px] font-semibold tracking-[-0.01em]">
          {t("vote.question")}
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
            👍 {t("vote.yes")}
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
            👎 {t("vote.no")}
          </button>
        </div>
      </div>
      {vote === "down" && (
        <div
          className="flex flex-col gap-3 rounded-[14px] border px-[19px] py-[17px]"
          style={{ background: "var(--wait-t)", borderColor: "var(--wait-t)" }}
        >
          <p className="text-[15px]" style={{ color: "var(--ink)", textWrap: "pretty" }}>
            {t("vote.sorry")}
          </p>
          <Link
            href={prefill}
            className="grid h-11 w-fit place-items-center rounded-[10px] px-[18px] text-[14.5px] font-semibold text-white hover:no-underline"
            style={{ background: "var(--cta-a)" }}
          >
            {t("vote.prefill")}
          </Link>
        </div>
      )}
      {vote === "up" && (
        <p className="text-[14.5px] font-medium" style={{ color: "var(--ok)" }}>
          {t("vote.thanks")}
        </p>
      )}
    </div>
  );
}
