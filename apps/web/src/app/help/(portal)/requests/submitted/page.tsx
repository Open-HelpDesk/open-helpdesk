/** Confirmation de PT-04 pour un visiteur non connecté : numéro + lien de suivi par email. */
export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  const { n } = await searchParams;
  return (
    <div className="mx-auto max-w-md text-center">
      <p className="text-4xl">✅</p>
      <h1 className="mt-2 text-xl font-semibold">Demande envoyée</h1>
      <p className="mt-2" style={{ color: "var(--mute)" }}>
        {n ? (
          <>
            Votre demande <strong>#{n}</strong> a bien été enregistrée.
          </>
        ) : (
          "Votre demande a bien été enregistrée."
        )}{" "}
        Un lien de suivi vient de vous être envoyé par email.
      </p>
    </div>
  );
}
