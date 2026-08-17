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
    <div className="pt-rise px-8 py-11 max-sm:px-[18px] max-sm:py-7">
      <div className="mx-auto flex max-w-[680px] flex-col gap-[22px]">
        <header className="flex flex-col gap-2">
          <h1 className="text-[30px] font-semibold tracking-[-0.025em]">Soumettre une demande</h1>
          <p className="text-base" style={{ color: "var(--ink-2)", textWrap: "pretty" }}>
            Décrivez votre situation. Nous répondons sous 4 heures ouvrées.
          </p>
        </header>

        <form action={submitRequest} className="flex flex-col gap-[17px]">
          {/* Type de demande */}
          <fieldset className="flex flex-col gap-[7px]">
            <legend className="pb-[7px] text-sm font-semibold">Type de demande</legend>
            <div className="grid grid-cols-2 gap-[9px] max-sm:grid-cols-1">
              {REQUEST_TYPES.map(([name, desc], i) => (
                <label
                  key={name}
                  className="pt-choice relative flex flex-col gap-[3px] rounded-[10px] px-[15px] py-[13px]"
                >
                  <input type="radio" name="type" value={name} defaultChecked={i === 0} />
                  <span className="pt-choice-name text-[15px] font-semibold">{name}</span>
                  <span className="text-[13.5px]" style={{ color: "var(--ink-3)" }}>
                    {desc}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Email */}
          <div className="flex flex-col gap-[7px]">
            <label htmlFor="pt-email" className="text-sm font-semibold">
              Votre email
            </label>
            {session ? (
              <div
                className="flex h-[46px] items-center rounded-[9px] border px-[13px] text-[15.5px]"
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
                className="pt-input h-[46px] px-[13px] text-[15.5px]"
              />
            )}
          </div>

          {/* Sujet + déflexion */}
          <SubjectWithDeflection defaultSubject={subject ?? ""} />

          {/* Module concerné / Urgence */}
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="pt-module" className="text-sm font-semibold">
                Module concerné
              </label>
              <div className="relative">
                <select
                  id="pt-module"
                  name="module"
                  className="pt-input h-[46px] w-full appearance-none px-[13px] text-[15.5px]"
                >
                  {modules.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-[13px] top-1/2 -translate-y-1/2 text-[10px] opacity-45">
                  ▾
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="pt-urgency" className="text-sm font-semibold">
                Urgence
              </label>
              <div className="relative">
                <select
                  id="pt-urgency"
                  name="urgency"
                  defaultValue="Normale"
                  className="pt-input h-[46px] w-full appearance-none px-[13px] text-[15.5px]"
                >
                  {URGENCIES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-[13px] top-1/2 -translate-y-1/2 text-[10px] opacity-45">
                  ▾
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-[7px]">
            <label htmlFor="pt-body" className="text-sm font-semibold">
              Description
            </label>
            <textarea
              id="pt-body"
              name="body"
              required
              className="pt-input min-h-[130px] resize-y p-[13px] text-[15.5px] leading-[1.6]"
            />
          </div>

          {/* Pièces jointes */}
          <DropZone />

          <button
            type="submit"
            className="grid h-[50px] w-full place-items-center rounded-[10px] text-base font-semibold text-white"
            style={{ background: "var(--acc)" }}
          >
            Envoyer la demande
          </button>
        </form>
      </div>
    </div>
  );
}
