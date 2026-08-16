import { requireAgent } from "@/lib/session";
import { PRIORITY_LABELS_FR } from "@/lib/format";
import { createTicket } from "../actions";

/**
 * AG-05 — Nouveau ticket (specs/10) : création au nom d'un client, contact créé à la
 * volée, rattachement automatique à l'organisation par domaine email.
 * Restent à venir : combobox de recherche de contact, sélecteur de formulaire,
 * corps riche, envoi email au contact.
 */
export default async function NewTicketPage() {
  await requireAgent();
  return (
    <div className="mx-auto max-w-2xl p-8">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider" style={{ color: "var(--acc)" }}>
        AG-05 · Nouveau ticket
      </p>
      <h1 className="mb-5 text-lg font-semibold">Créer un ticket</h1>

      <form
        action={createTicket}
        className="flex flex-col gap-4 rounded-xl border p-6"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email du contact *
            <input
              name="email"
              type="email"
              required
              placeholder="julien.lambert@nordfil.example"
              className="rounded-md border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--line)", background: "var(--bg)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nom (si nouveau contact)
            <input
              name="name"
              type="text"
              className="rounded-md border px-3 py-2 text-sm font-normal"
              style={{ borderColor: "var(--line)", background: "var(--bg)" }}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Sujet *
          <input
            name="subject"
            type="text"
            required
            className="rounded-md border px-3 py-2 text-sm font-normal"
            style={{ borderColor: "var(--line)", background: "var(--bg)" }}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Description
          <textarea
            name="body"
            rows={5}
            className="resize-y rounded-md border px-3 py-2 text-sm font-normal"
            style={{ borderColor: "var(--line)", background: "var(--bg)" }}
          />
        </label>

        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm font-medium">
            Priorité
            <select
              name="priority"
              defaultValue="normal"
              className="rounded-md border px-2 py-1.5 text-sm font-normal"
              style={{ borderColor: "var(--line)", background: "var(--bg)" }}
            >
              {Object.entries(PRIORITY_LABELS_FR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--acc)" }}
          >
            Créer le ticket
          </button>
        </div>
      </form>
    </div>
  );
}
