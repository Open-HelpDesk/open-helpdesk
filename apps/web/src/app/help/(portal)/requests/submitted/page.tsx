import Link from "next/link";
import { getT } from "@/i18n/server";

/**
 * PT-04 (confirmation) — visitor not signed in: ✓, monospace reference,
 * "verification link" banner, "Track my request" / "Back to help" buttons.
 */
export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ n?: string; e?: string }>;
}) {
  const t = await getT();
  const { n, e } = await searchParams;

  const [refBefore, refAfter] = t.parts("submitted.reference", "ref");

  return (
    <div className="pt-rise px-9 pb-[60px] pt-12 max-sm:px-[18px] max-sm:py-[30px]">
      <div className="mx-auto flex max-w-[700px] flex-col items-center gap-4 py-[52px] text-center">
        <div
          className="grid h-[62px] w-[62px] place-items-center rounded-full text-[28px]"
          style={{ background: "var(--ok-t)", color: "var(--ok)" }}
        >
          ✓
        </div>
        <h1 className="pt-title text-[30px] tracking-[-0.02em]">{t("submitted.title")}</h1>
        <p
          className="max-w-[46ch] text-[16.5px] leading-[1.6]"
          style={{ color: "var(--ink-2)", textWrap: "pretty" }}
        >
          {/* The reference is in bold: the sentence is split around it rather
              than recomposed, otherwise the word order would be frozen. */}
          {n ? (
            <>
              {refBefore}
              <span className="font-mono font-semibold" style={{ color: "var(--ink)" }}>
                #{n}
              </span>
              {refAfter}
            </>
          ) : (
            t("submitted.referenceUnknown")
          )}
        </p>
        <div
          className="max-w-[48ch] rounded-[14px] px-[19px] py-4 text-[14.5px] leading-[1.6]"
          style={{ background: "var(--wait-t)", color: "var(--wait)", textWrap: "pretty" }}
        >
          {e ? t("submitted.verify", { email: e }) : t("submitted.verifyNoEmail")}
        </div>
        <div className="mt-1 flex flex-wrap justify-center gap-2.5">
          {n && (
            <Link
              href={`/help/requests/${n}`}
              className="grid h-12 place-items-center rounded-[10px] px-[22px] text-[15px] font-semibold text-white hover:no-underline"
              style={{ background: "var(--cta-a)", boxShadow: "var(--sh-2)" }}
            >
              {t("submitted.track")}
            </Link>
          )}
          <Link
            href="/help"
            className="grid h-12 place-items-center rounded-[10px] border px-[22px] text-[15px] hover:no-underline"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            {t("submitted.backToHelp")}
          </Link>
        </div>
      </div>
    </div>
  );
}
