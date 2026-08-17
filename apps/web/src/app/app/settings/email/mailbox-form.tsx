"use client";

/**
 * ST-03 — Formulaire d'adresse de réception (drawer) : méthode Transfert ou IMAP,
 * champs adaptés. Le mot de passe IMAP n'est jamais réaffiché (indice « ••••1a2b »).
 */
import { useState } from "react";
import { Field, Select, TextInput } from "@/components/settings-page";
import { saveMailbox } from "./actions";

type Option = { id: string; name: string };

export function MailboxForm({
  mailbox,
  forwardTarget,
  teams,
  forms,
  secretHint,
}: {
  mailbox?: {
    id: string;
    address: string;
    kind: "forwarding" | "imap";
    formId: string | null;
    defaultTeamId: string | null;
    imapHost: string | null;
    imapPort: number | null;
    imapSecure: boolean;
    imapUser: string | null;
  };
  forwardTarget: string;
  teams: Option[];
  forms: Option[];
  secretHint: string | null;
}) {
  const [kind, setKind] = useState<"forwarding" | "imap">(mailbox?.kind ?? "forwarding");

  return (
    <form action={saveMailbox} className="flex h-full flex-col gap-4">
      {mailbox && <input type="hidden" name="mailboxId" value={mailbox.id} />}

      <Field label="Adresse">
        <TextInput
          name="address"
          type="email"
          required
          defaultValue={mailbox?.address ?? ""}
          placeholder="support@votre-domaine.fr"
          className="font-mono"
        />
      </Field>

      <Field label="Méthode">
        <Select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value === "imap" ? "imap" : "forwarding")}
        >
          <option value="forwarding">Transfert vers l'adresse fournie</option>
          <option value="imap">Connexion IMAP</option>
        </Select>
      </Field>

      {kind === "forwarding" ? (
        <Field
          label="Adresse de transfert"
          hint="Configurez cette redirection chez votre fournisseur : l'adresse passera en « Vérifiée » au premier email reçu."
        >
          <TextInput readOnly value={forwardTarget} className="font-mono" />
        </Field>
      ) : (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,2fr) 90px" }}>
            <Field label="Hôte IMAP">
              <TextInput
                name="imapHost"
                defaultValue={mailbox?.imapHost ?? ""}
                placeholder="imap.votre-domaine.fr"
                className="font-mono"
              />
            </Field>
            <Field label="Port">
              <TextInput
                name="imapPort"
                inputMode="numeric"
                defaultValue={String(mailbox?.imapPort ?? 993)}
                className="font-mono tabular-nums"
              />
            </Field>
          </div>
          <Field label="Chiffrement">
            <Select name="imapSecure" defaultValue={mailbox?.imapSecure === false ? "false" : "true"}>
              <option value="true">TLS implicite (993)</option>
              <option value="false">Sans TLS / STARTTLS (143)</option>
            </Select>
          </Field>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Identifiant">
              <TextInput
                name="imapUser"
                defaultValue={mailbox?.imapUser ?? ""}
                placeholder="support@votre-domaine.fr"
                className="font-mono"
              />
            </Field>
            <Field
              label="Mot de passe"
              hint={secretHint ? `Enregistré : ${secretHint}. Laisser vide pour le conserver.` : undefined}
            >
              <TextInput
                name="imapPassword"
                type="password"
                autoComplete="new-password"
                placeholder={secretHint ? "•••••••• (inchangé)" : ""}
              />
            </Field>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
            La boîte est relevée toutes les minutes : les messages non lus deviennent des
            tickets, puis sont marqués comme lus.
          </p>
        </>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Formulaire cible">
          <Select name="formId" defaultValue={mailbox?.formId ?? ""}>
            <option value="">Formulaire par défaut</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Équipe par défaut">
          <Select name="defaultTeamId" defaultValue={mailbox?.defaultTeamId ?? ""}>
            <option value="">Aucune</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-auto flex justify-end border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <button
          type="submit"
          className="rounded-md px-3.5 font-semibold text-white"
          style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
        >
          {mailbox ? "Enregistrer" : "Ajouter"}
        </button>
      </div>
    </form>
  );
}
