"use client";

/** Morceaux interactifs de AG-02 — Onboarding. */
import { useState } from "react";
import { saveIdentity, inviteTeam } from "./actions";

/** Pastilles de couleur d'accent du design (étape 1). */
export const ACCENT_SWATCHES = ["#0B5F46", "#1D4ED8", "#6D28D9", "#C0342B", "#B45309"];

/* ---------- Étape 1 — Identité ---------- */

export function IdentityForm({
  initialName,
  initialAccent,
}: {
  initialName: string;
  initialAccent: string;
}) {
  const [name, setName] = useState(initialName);
  const [accent, setAccent] = useState(
    ACCENT_SWATCHES.includes(initialAccent) ? initialAccent : ACCENT_SWATCHES[0]!,
  );

  return (
    <form action={saveIdentity} className="flex flex-col gap-5">
      <input type="hidden" name="accentColor" value={accent} />

      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Nom du workspace
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border px-3 text-sm font-normal outline-none"
          style={{
            height: 36,
            borderRadius: 6,
            borderColor: "var(--line)",
            background: "var(--bg)",
            maxWidth: 360,
          }}
        />
      </label>

      {/* Logo — dropzone informative */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center font-bold text-white"
          style={{ width: 52, height: 52, borderRadius: 12, background: accent, fontSize: 22 }}
          aria-hidden
        >
          {name[0]?.toUpperCase() ?? "A"}
        </div>
        <div
          className="flex flex-1 items-center justify-center border border-dashed px-4 text-[12.5px]"
          style={{
            height: 52,
            borderRadius: 8,
            borderColor: "var(--line)",
            color: "var(--ink-3)",
            maxWidth: 300,
          }}
        >
          Déposer un fichier PNG ou SVG
        </div>
      </div>

      {/* Pastilles accent */}
      <div>
        <p className="mb-2 text-[13px] font-medium">Couleur d'accent</p>
        <div className="flex items-center gap-2.5">
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAccent(c)}
              title={c}
              aria-pressed={accent === c}
              className="rounded-full"
              style={{
                width: 26,
                height: 26,
                background: c,
                border: "2px solid var(--bg)",
                outline: accent === c ? `2px solid ${c}` : "2px solid transparent",
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
      </div>

      {/* Aperçu portail factice */}
      <div
        className="overflow-hidden border"
        style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--bg)" }}
      >
        <div
          className="flex flex-col items-center gap-2.5 px-6 py-7 text-center"
          style={{ background: accent }}
        >
          <p className="text-[15px] font-semibold text-white">
            Comment pouvons-nous vous aider ?
          </p>
          <div
            className="w-full rounded-md bg-white px-3 py-2 text-left text-[12.5px]"
            style={{ maxWidth: 320, color: "var(--ink-3)" }}
          >
            Rechercher un article…
          </div>
        </div>
        <p className="px-4 py-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          Aperçu de votre portail client
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="rounded-md px-5 text-sm font-semibold text-white"
          style={{ height: 38, background: "var(--acc)" }}
        >
          Continuer
        </button>
        <a href="/onboarding?step=2" className="text-[13px]" style={{ color: "var(--ink-3)" }}>
          Passer cette étape
        </a>
      </div>
    </form>
  );
}

/* ---------- Étape 2 — Copier l'adresse ---------- */

export function CopyButton({ value, label = "Copier" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* presse-papiers indisponible */
        }
      }}
      className="shrink-0 rounded-md border px-3 text-[12.5px] font-medium"
      style={{
        height: 30,
        borderColor: "var(--line)",
        background: "var(--bg)",
        color: copied ? "var(--acc-2)" : "var(--ink)",
      }}
    >
      {copied ? "Copié ✓" : label}
    </button>
  );
}

/* ---------- Étape 3 — Équipe ---------- */

export function TeamInviteForm() {
  const [rows, setRows] = useState([0, 1]);

  return (
    <form action={inviteTeam} className="flex flex-col gap-3" style={{ maxWidth: 460 }}>
      {rows.map((id) => (
        <div key={id} className="flex items-center gap-2">
          <input
            name="email"
            type="email"
            placeholder="collegue@entreprise.fr"
            className="min-w-0 flex-1 border px-3 text-sm outline-none"
            style={{
              height: 36,
              borderRadius: 6,
              borderColor: "var(--line)",
              background: "var(--bg)",
            }}
          />
          <select
            name="role"
            defaultValue="agent"
            className="shrink-0 border px-2 text-[13px]"
            style={{
              height: 36,
              width: 110,
              borderRadius: 6,
              borderColor: "var(--line)",
              background: "var(--bg)",
            }}
          >
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((r) => [...r, (r[r.length - 1] ?? 0) + 1])}
        className="self-start rounded-md border border-dashed px-3 py-1.5 text-[13px]"
        style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
      >
        + Ajouter une ligne
      </button>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="submit"
          className="rounded-md px-5 text-sm font-semibold text-white"
          style={{ height: 38, background: "var(--acc)" }}
        >
          Envoyer les invitations
        </button>
        <a href="/onboarding?step=4" className="text-[13px]" style={{ color: "var(--ink-3)" }}>
          Passer cette étape
        </a>
      </div>
    </form>
  );
}
