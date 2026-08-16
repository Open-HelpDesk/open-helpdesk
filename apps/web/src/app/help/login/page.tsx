import { requestMagicLink } from "../actions";

/**
 * PT-07 — Connexion portail (specs/12) : une seule saisie, l'email. Lien magique par
 * défaut. Reste à venir (v1.1) : découverte par domaine → redirection SSO de
 * l'organisation (Lot 5b), mode mot de passe optionnel (ST-09).
 */
export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">Accéder à mes demandes</h1>
      {sent ? (
        <div
          className="mt-4 rounded-lg border p-4 text-sm"
          style={{ background: "var(--acc-t)", borderColor: "var(--line)" }}
        >
          <p className="font-medium">Consultez votre boîte de réception 📬</p>
          <p className="mt-1" style={{ color: "var(--mute)" }}>
            Si un compte existe pour cette adresse, un lien de connexion (valable
            15 minutes) vient de vous être envoyé.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm" style={{ color: "var(--mute)" }}>
            Saisissez votre email — nous vous envoyons un lien de connexion, sans mot de
            passe.
          </p>
          {error === "expired" && (
            <p
              className="mt-3 rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--dang-t)", color: "var(--dang)" }}
            >
              Ce lien est expiré ou invalide. Demandez-en un nouveau.
            </p>
          )}
          <form action={requestMagicLink} className="mt-4 flex flex-col gap-3">
            <input
              name="email"
              type="email"
              required
              placeholder="vous@entreprise.fr"
              className="rounded-md border px-3 py-2.5 outline-none"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}
            />
            <button
              type="submit"
              className="rounded-md px-4 py-2.5 font-semibold text-white"
              style={{ background: "var(--acc)" }}
            >
              Recevoir mon lien de connexion
            </button>
          </form>
        </>
      )}
    </div>
  );
}
