import Link from "next/link";

/**
 * PT-04 (confirmation) — visiteur non connecté : ✓, référence mono, bandeau
 * « lien de vérification », boutons « Suivre ma demande » / « Retour à l'aide ».
 */
export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ n?: string; e?: string }>;
}) {
  const { n, e } = await searchParams;

  return (
    <div className="pt-rise px-9 pb-[60px] pt-12 max-sm:px-[18px] max-sm:py-[30px]">
      <div className="mx-auto flex max-w-[700px] flex-col items-center gap-4 py-[52px] text-center">
        <div
          className="grid h-[62px] w-[62px] place-items-center rounded-full text-[28px]"
          style={{ background: "var(--ok-t)", color: "var(--ok)" }}
        >
          ✓
        </div>
        <h1 className="pt-title text-[30px] tracking-[-0.02em]">Demande enregistrée</h1>
        <p
          className="max-w-[46ch] text-[16.5px] leading-[1.6]"
          style={{ color: "var(--ink-2)", textWrap: "pretty" }}
        >
          {n ? (
            <>
              Votre demande porte la référence{" "}
              <span className="font-mono font-semibold" style={{ color: "var(--ink)" }}>
                #{n}
              </span>
              .{" "}
            </>
          ) : (
            <>Votre demande a bien été enregistrée. </>
          )}
          Vous recevrez chaque réponse par email.
        </p>
        <div
          className="max-w-[48ch] rounded-[14px] px-[19px] py-4 text-[14.5px] leading-[1.6]"
          style={{ background: "var(--wait-t)", color: "var(--wait)", textWrap: "pretty" }}
        >
          Nous vous avons envoyé un lien de vérification{e ? ` à ${e}` : ""} pour accéder au suivi
          de votre demande.
        </div>
        <div className="mt-1 flex flex-wrap justify-center gap-2.5">
          {n && (
            <Link
              href={`/help/requests/${n}`}
              className="grid h-12 place-items-center rounded-[10px] px-[22px] text-[15px] font-semibold text-white hover:no-underline"
              style={{ background: "var(--cta-a)", boxShadow: "var(--sh-2)" }}
            >
              Suivre ma demande
            </Link>
          )}
          <Link
            href="/help"
            className="grid h-12 place-items-center rounded-[10px] border px-[22px] text-[15px] hover:no-underline"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            Retour à l'aide
          </Link>
        </div>
      </div>
    </div>
  );
}
