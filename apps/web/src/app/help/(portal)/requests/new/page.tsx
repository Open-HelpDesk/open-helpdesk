import { getPortalContact, getPortalTenant } from "@/lib/portal-auth";
import { getModuleOptions } from "@/lib/portal-data";
import { submitRequest } from "../../../actions";
import { DropZone } from "../attach";
import { SubjectWithDeflection } from "./subject-field";

const REQUEST_TYPES = [
  ["Support technique", "Un dysfonctionnement à signaler"],
  ["Question facturation", "Factures, paiements, abonnement"],
  ["Demande d'évolution", "Suggérer une amélioration"],
] as const;

const URGENCIES = ["Basse", "Normale", "Haute"] as const;

/**
 * PT-04 — Soumettre une demande : type de demande (cartes), email (lecture seule si
 * connecté), sujet avec déflexion KB, module réel (ticketFields key=module), urgence,
 * description, dropzone, bouton pleine largeur.
 */
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const tenant = await getPortalTenant();
  const session = await getPortalContact();
  const { subject } = await searchParams;
  const modules = tenant ? await getModuleOptions(tenant.id) : [];

  return (
    <div className="pt-rise px-9 pb-[60px] pt-12 max-sm:px-[18px] max-sm:py-[30px]">
      <div className="mx-auto flex max-w-[700px] flex-col gap-[26px]">
        <header className="flex flex-col gap-2.5">
          <h1 className="pt-title text-4xl leading-[1.1] tracking-[-0.02em] max-sm:text-[27px]">
            Soumettre une demande
          </h1>
          <p
            className="text-[16.5px] leading-[1.6]"
            style={{ color: "var(--ink-2)", textWrap: "pretty" }}
          >
            Décrivez votre situation. Nous répondons sous 4 heures ouvrées.
          </p>
        </header>

        <form action={submitRequest} className="flex flex-col gap-5">
          {/* Type de demande */}
          <fieldset className="flex flex-col gap-[9px]">
            <legend className="pt-label pb-[9px]">Type de demande</legend>
            <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
              {REQUEST_TYPES.map(([name, desc], i) => (
                <label
                  key={name}
                  className="pt-choice relative flex flex-col gap-1 rounded-xl px-4 py-[15px]"
                >
                  <input type="radio" name="type" value={name} defaultChecked={i === 0} />
                  <span className="pt-choice-name text-[15px] font-semibold">{name}</span>
                  <span className="text-[13.5px] leading-[1.45]" style={{ color: "var(--ink-3)" }}>
                    {desc}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Email */}
          <div className="flex flex-col gap-[9px]">
            <label htmlFor="pt-email" className="pt-label">
              Votre email
            </label>
            {session ? (
              <div
                className="flex h-[50px] items-center rounded-[11px] border px-[15px] text-[15.5px]"
                style={{
                  background: "var(--sunk)",
                  borderColor: "var(--line)",
                  color: "var(--ink-2)",
                }}
              >
                {session.contact.email}
              </div>
            ) : (
              <input
                id="pt-email"
                name="email"
                type="email"
                required
                className="pt-input h-[50px] px-[15px] text-[15.5px]"
              />
            )}
          </div>

          {/* Sujet + déflexion */}
          <SubjectWithDeflection defaultSubject={subject ?? ""} />

          {/* Module concerné / Urgence — une seule colonne si le tenant n'a pas de modules. */}
          <div
            className={`grid gap-3.5 max-sm:grid-cols-1 ${modules.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}
          >
            {modules.length > 0 && (
              <div className="flex flex-col gap-[9px]">
                <label htmlFor="pt-module" className="pt-label">
                  Module concerné
                </label>
                <div className="relative">
                  <select
                    id="pt-module"
                    name="module"
                    className="pt-input h-[50px] w-full appearance-none px-[15px] text-[15.5px]"
                  >
                    {modules.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-[15px] top-1/2 -translate-y-1/2 text-[10px] opacity-40">
                    ▾
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-[9px]">
              <label htmlFor="pt-urgency" className="pt-label">
                Urgence
              </label>
              <div className="relative">
                <select
                  id="pt-urgency"
                  name="urgency"
                  defaultValue="Normale"
                  className="pt-input h-[50px] w-full appearance-none px-[15px] text-[15.5px]"
                >
                  {URGENCIES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-[15px] top-1/2 -translate-y-1/2 text-[10px] opacity-40">
                  ▾
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-[9px]">
            <label htmlFor="pt-body" className="pt-label">
              Description
            </label>
            <textarea
              id="pt-body"
              name="body"
              required
              className="pt-input min-h-[140px] resize-y p-[15px] text-[15.5px] leading-[1.65]"
            />
          </div>

          {/* Pièces jointes */}
          <DropZone />

          <button
            type="submit"
            className="grid h-[52px] w-full place-items-center rounded-[11px] text-base font-semibold text-white"
            style={{ background: "var(--cta-a)", boxShadow: "var(--sh-2)" }}
          >
            Envoyer la demande
          </button>
        </form>
      </div>
    </div>
  );
}
