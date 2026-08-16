import { getPortalContact } from "@/lib/portal-auth";
import { submitRequest } from "../../actions";
import { SubjectWithDeflection } from "./subject-field";

/**
 * PT-04 — Soumettre une demande (specs/12) : email pré-rempli si connecté, suggestion
 * d'articles KB en direct pendant la saisie du sujet (déflexion). Reste à venir :
 * formulaires dynamiques (ST-04), pièces jointes.
 */
export default async function NewRequestPage() {
  const session = await getPortalContact();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold">Soumettre une demande</h1>
      <form action={submitRequest} className="mt-5 flex flex-col gap-4">
        {session ? (
          <p className="text-sm" style={{ color: "var(--mute)" }}>
            Connecté en tant que <strong>{session.contact.email}</strong>
          </p>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Votre email *
            <input
              name="email"
              type="email"
              required
              className="rounded-md border px-3 py-2.5 font-normal outline-none"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}
            />
          </label>
        )}

        <SubjectWithDeflection />

        <label className="flex flex-col gap-1 text-sm font-medium">
          Description *
          <textarea
            name="body"
            required
            rows={6}
            placeholder="Décrivez votre demande — étapes suivies, message d'erreur…"
            className="resize-y rounded-md border px-3 py-2.5 font-normal outline-none"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Pièces jointes <span className="font-normal text-xs" style={{ color: "var(--mute)" }}>(10 Mo max par fichier)</span>
          <input name="files" type="file" multiple className="text-sm" />
        </label>

        <button
          type="submit"
          className="self-start rounded-md px-5 py-2.5 font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Envoyer la demande
        </button>
        {!session && (
          <p className="text-xs" style={{ color: "var(--mute)" }}>
            Un lien de suivi vous sera envoyé par email.
          </p>
        )}
      </form>
    </div>
  );
}
