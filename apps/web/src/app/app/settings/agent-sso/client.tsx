"use client";

/**
 * ST-13 — Composants client : radios d'application (avertissement rouge sur
 * « Imposé à tous »), régénération du jeton SCIM (affiché une seule fois),
 * correspondance des groupes éditable.
 */
import { useActionState, useState } from "react";
import { CopyButton } from "@/components/settings-overlays";
import type { ScimTokenState } from "./actions";

const inputStyle = {
  borderColor: "var(--line)",
  background: "var(--bg)",
  color: "var(--ink)",
} as const;

export function EnforcementRadios({
  initial,
}: {
  initial: "optional" | "verified_domains" | "all";
}) {
  const [value, setValue] = useState(initial);
  const options: { value: typeof value; label: string; hint: string }[] = [
    {
      value: "optional",
      label: "Optionnel",
      hint: "Les agents choisissent entre SSO et mot de passe.",
    },
    {
      value: "verified_domains",
      label: "Imposé aux domaines vérifiés",
      hint: "Recommandé — le SSO est obligatoire pour les emails de vos domaines vérifiés.",
    },
    {
      value: "all",
      label: "Imposé à tous",
      hint: "Tous les agents doivent passer par le SSO, sans exception.",
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2.5">
          <input
            type="radio"
            name="enforcement"
            value={o.value}
            checked={value === o.value}
            onChange={() => setValue(o.value)}
            className="mt-0.5"
          />
          <span className="flex flex-col">
            <span className="font-medium" style={{ fontSize: 13, color: "var(--ink)" }}>
              {o.label}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{o.hint}</span>
          </span>
        </label>
      ))}
      {value === "all" && (
        <p
          className="rounded-md border px-3 py-2"
          style={{
            fontSize: 12.5,
            borderColor: "var(--dang)",
            background: "var(--dang-t)",
            color: "var(--dang)",
          }}
        >
          Attention : si votre fournisseur d'identité tombe en panne, plus personne ne
          pourra se connecter — conservez un compte de secours valide.
        </p>
      )}
    </div>
  );
}

export function ScimTokenForm({
  action,
  hint,
}: {
  action: (prev: ScimTokenState, formData: FormData) => Promise<ScimTokenState>;
  hint: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <code
          className="rounded-md border px-2.5 py-1.5 font-mono"
          style={{ fontSize: 12.5, ...inputStyle }}
        >
          {state ? state.token : (hint ?? "Aucun jeton généré")}
        </code>
        {state && <CopyButton text={state.token} />}
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border px-3 font-medium disabled:opacity-50"
            style={{
              height: 30,
              fontSize: 12.5,
              borderColor: "var(--line)",
              background: "var(--panel)",
              color: "var(--ink)",
            }}
          >
            {pending ? "Génération…" : hint || state ? "Régénérer le jeton" : "Générer un jeton"}
          </button>
        </form>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
        Affiché une seule fois — le régénérer interrompt la synchronisation en cours.
      </p>
    </div>
  );
}

type GroupRow = { group: string; team: string; role: string };

export function ScimGroupsField({
  initial,
  teams,
}: {
  initial: GroupRow[];
  teams: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<GroupRow[]>(
    initial.length > 0 ? initial : [{ group: "", team: "", role: "agent" }],
  );

  function update(i: number, next: Partial<GroupRow>) {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...next } : r)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid gap-2 font-mono font-semibold uppercase"
        style={{
          gridTemplateColumns: "1fr 160px 120px 30px",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "var(--ink-3)",
        }}
      >
        <span>Groupe IdP</span>
        <span>Équipe</span>
        <span>Rôle</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr 160px 120px 30px" }}>
          <input
            name="g_group"
            value={r.group}
            onChange={(e) => update(i, { group: e.target.value })}
            placeholder="ohd-agents-n1"
            className="min-w-0 rounded-md border px-2 py-1.5 font-mono text-sm"
            style={inputStyle}
          />
          <select
            name="g_team"
            value={r.team}
            onChange={(e) => update(i, { team: e.target.value })}
            className="min-w-0 rounded-md border px-2 py-1.5 text-sm"
            style={inputStyle}
          >
            <option value="">—</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            name="g_role"
            value={r.role}
            onChange={(e) => update(i, { role: e.target.value })}
            className="min-w-0 rounded-md border px-2 py-1.5 text-sm"
            style={inputStyle}
          >
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="button"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
            title="Retirer"
            style={{ color: "var(--ink-3)" }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, { group: "", team: "", role: "agent" }])}
        className="self-start rounded-md border border-dashed px-2 py-1"
        style={{ fontSize: 12, borderColor: "var(--line)", color: "var(--ink-2)" }}
      >
        + Ajouter une correspondance
      </button>
    </div>
  );
}
