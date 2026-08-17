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
    <div className="pt-rise px-8 py-11 max-sm:px-[18px] max-sm:py-7">
      <div className="mx-auto flex max-w-[680px] flex-col items-center gap-[15px] py-11 text-center">
        <div
          className="grid h-14 w-14 place-items-center rounded-full text-[26px]"
          style={{ background: "var(--ok-t)", color: "var(--ok)" }}
        >
          ✓
        </div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Demande enregistrée</h1>
        <p
          className="max-w-[440px] text-base"
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
          className="max-w-[460px] rounded-[10px] px-[18px] py-[15px] text-[14.5px]"
          style={{ background: "var(--wait-t)", color: "var(--wait)", textWrap: "pretty" }}
        >
          Nous vous avons envoyé un lien de vérification{e ? ` à ${e}` : ""} pour accéder au suivi
          de votre demande.
        </div>
        <div className="flex flex-wrap justify-center gap-[9px]">
          {n && (
            <Link
              href={`/help/requests/${n}`}
              className="grid h-[46px] place-items-center rounded-[9px] px-5 text-[15px] font-semibold text-white hover:no-underline"
              style={{ background: "var(--acc)" }}
            >
              Suivre ma demande
            </Link>
          )}
          <Link
            href="/help"
            className="grid h-[46px] place-items-center rounded-[9px] border px-5 text-[15px] hover:no-underline"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            Retour à l'aide
          </Link>
        </div>
      </div>
    </div>
  );
}
