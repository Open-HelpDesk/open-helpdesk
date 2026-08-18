"use client";

/**
 * ST-03 — Formulaire d'adresse de réception (drawer) : méthode Transfert ou IMAP,
 * champs adaptés. Le mot de passe IMAP n'est jamais réaffiché (indice « ••••1a2b »).
 */
import { useState } from "react";
import { Field, Select, TextInput } from "@/components/settings-page";
import { useT } from "@/i18n/client";
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
  const t = useT();
  const [kind, setKind] = useState<"forwarding" | "imap">(mailbox?.kind ?? "forwarding");

  return (
    <form action={saveMailbox} className="flex h-full flex-col gap-4">
      {mailbox && <input type="hidden" name="mailboxId" value={mailbox.id} />}

      <Field label={t("app.settings.email.address")}>
        <TextInput
          name="address"
          type="email"
          required
          defaultValue={mailbox?.address ?? ""}
          placeholder={t("app.settings.email.placeholderEmail")}
          className="font-mono"
        />
      </Field>

      <Field label={t("app.settings.email.method")}>
        <Select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value === "imap" ? "imap" : "forwarding")}
        >
          <option value="forwarding">{t("app.settings.email.methodForwarding")}</option>
          <option value="imap">{t("app.settings.email.methodImap")}</option>
        </Select>
      </Field>

      {kind === "forwarding" ? (
        <Field
          label={t("app.settings.email.forwardAddressLabel")}
          hint={t("app.settings.email.forwardAddressHint")}
        >
          <TextInput readOnly value={forwardTarget} className="font-mono" />
        </Field>
      ) : (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,2fr) 90px" }}>
            <Field label={t("app.settings.email.imapHostLabel")}>
              <TextInput
                name="imapHost"
                defaultValue={mailbox?.imapHost ?? ""}
                placeholder={t("app.settings.email.placeholderImapHost")}
                className="font-mono"
              />
            </Field>
            <Field label={t("app.settings.email.port")}>
              <TextInput
                name="imapPort"
                inputMode="numeric"
                defaultValue={String(mailbox?.imapPort ?? 993)}
                className="font-mono tabular-nums"
              />
            </Field>
          </div>
          <Field label={t("app.settings.email.encryption")}>
            <Select name="imapSecure" defaultValue={mailbox?.imapSecure === false ? "false" : "true"}>
              <option value="true">{t("app.settings.email.imapTlsImplicit")}</option>
              <option value="false">{t("app.settings.email.imapNoTls")}</option>
            </Select>
          </Field>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label={t("app.settings.email.username")}>
              <TextInput
                name="imapUser"
                defaultValue={mailbox?.imapUser ?? ""}
                placeholder={t("app.settings.email.placeholderEmail")}
                className="font-mono"
              />
            </Field>
            <Field
              label={t("app.settings.email.passwordLabel")}
              hint={
                secretHint
                  ? t("app.settings.email.secretKept", { hint: secretHint })
                  : undefined
              }
            >
              <TextInput
                name="imapPassword"
                type="password"
                autoComplete="new-password"
                placeholder={secretHint ? t("app.settings.email.passwordUnchanged") : ""}
              />
            </Field>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {t("app.settings.email.imapNote")}
          </p>
        </>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label={t("app.settings.email.targetFormLabel")}>
          <Select name="formId" defaultValue={mailbox?.formId ?? ""}>
            <option value="">{t("app.settings.email.formDefaultOption")}</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("app.settings.email.defaultTeamLabel")}>
          <Select name="defaultTeamId" defaultValue={mailbox?.defaultTeamId ?? ""}>
            <option value="">{t("app.settings.email.teamNone")}</option>
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
          {mailbox ? t("app.settings.email.save") : t("app.settings.email.add")}
        </button>
      </div>
    </form>
  );
}
