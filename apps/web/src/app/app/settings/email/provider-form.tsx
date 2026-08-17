"use client";

/**
 * ST-03 — Configuration du fournisseur d'envoi, par workspace.
 * Cartes-radio des fournisseurs (pattern du design system), champs adaptés au choix,
 * préréglages SMTP du marché. Les secrets ne sont jamais renvoyés au navigateur :
 * champ vide + indice « ••••1a2b » quand un secret est déjà enregistré.
 */
import { useState } from "react";
import {
  PROVIDER_META,
  SMTP_PRESETS,
  type MailProvider,
} from "@openhelpdesk/mail/provider-meta";
import { Field, Select, TextInput } from "@/components/settings-page";

const PROVIDERS: MailProvider[] = ["smtp", "resend", "brevo", "mailjet", "console"];

export function ProviderForm({
  initial,
  secretHint,
}: {
  initial: {
    provider: MailProvider;
    fromName: string;
    fromAddress: string;
    replyTo: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
  };
  secretHint: string | null;
}) {
  const [provider, setProvider] = useState<MailProvider>(initial.provider);
  const [host, setHost] = useState(initial.smtpHost);
  const [port, setPort] = useState(String(initial.smtpPort || 587));
  const [secure, setSecure] = useState(initial.smtpSecure);

  function applyPreset(id: string) {
    const preset = SMTP_PRESETS.find((p) => p.id === id);
    if (!preset || preset.id === "custom") return;
    setHost(preset.host);
    setPort(String(preset.port));
    setSecure(preset.secure);
  }

  const meta = PROVIDER_META[provider];
  const keptHint = (label: string) =>
    secretHint ? `${label} enregistré : ${secretHint}. Laisser vide pour le conserver.` : undefined;

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="provider" value={provider} />

      {/* Cartes-radio des fournisseurs */}
      <div
        role="radiogroup"
        aria-label="Fournisseur d'envoi"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 10,
        }}
      >
        {PROVIDERS.map((key) => {
          const active = provider === key;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={active}
              key={key}
              onClick={() => setProvider(key)}
              className="text-left"
              style={{
                padding: "13px 15px",
                borderRadius: 10,
                border: `1px solid ${active ? "var(--acc)" : "var(--line)"}`,
                background: active ? "var(--acc-t)" : "var(--panel)",
                cursor: "pointer",
              }}
            >
              <span
                className="block font-semibold"
                style={{ fontSize: 14.5, color: active ? "var(--acc)" : "var(--ink)" }}
              >
                {PROVIDER_META[key].label}
              </span>
              <span
                className="block"
                style={{ fontSize: 12.5, color: "var(--ink-3)", textWrap: "pretty" }}
              >
                {PROVIDER_META[key].hint}
              </span>
            </button>
          );
        })}
      </div>

      {provider === "console" ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--wait)",
            background: "var(--wait-t)",
            borderRadius: 8,
            padding: "10px 13px",
          }}
        >
          Aucun email ne sera envoyé : les messages sont écrits dans les journaux du
          serveur. À réserver au développement.
        </p>
      ) : (
        <>
          {/* Identité d'expédition */}
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
          >
            <Field label="Nom d'expéditeur">
              <TextInput name="fromName" defaultValue={initial.fromName} placeholder="Acme Support" />
            </Field>
            <Field
              label="Adresse d'expédition"
              hint="Doit appartenir à un domaine authentifié (voir DNS ci-dessous)."
            >
              <TextInput
                name="fromAddress"
                type="email"
                defaultValue={initial.fromAddress}
                placeholder="support@votre-domaine.fr"
                className="font-mono"
              />
            </Field>
            <Field label="Répondre à" hint="Vide = adresse d'expédition.">
              <TextInput
                name="replyTo"
                type="email"
                defaultValue={initial.replyTo}
                className="font-mono"
              />
            </Field>
          </div>

          {/* Champs propres au fournisseur */}
          {provider === "smtp" && (
            <div className="flex flex-col gap-3">
              <Field
                label="Préréglage"
                hint="Remplit l'hôte, le port et le chiffrement du relais choisi."
                style={{ maxWidth: 320 }}
              >
                <Select defaultValue="custom" onChange={(e) => applyPreset(e.target.value)}>
                  {SMTP_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "minmax(200px,2fr) 100px minmax(170px,1fr)" }}
              >
                <Field label="Hôte SMTP">
                  <TextInput
                    name="smtpHost"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="smtp.votre-domaine.fr"
                    className="font-mono"
                  />
                </Field>
                <Field label="Port">
                  <TextInput
                    name="smtpPort"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    inputMode="numeric"
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field label="Chiffrement">
                  <Select
                    name="smtpSecure"
                    value={secure ? "true" : "false"}
                    onChange={(e) => setSecure(e.target.value === "true")}
                  >
                    <option value="false">STARTTLS (587, 25)</option>
                    <option value="true">TLS implicite (465)</option>
                  </Select>
                </Field>
              </div>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
              >
                <Field label="Identifiant" hint="Vide = relais sans authentification.">
                  <TextInput name="smtpUser" defaultValue={initial.smtpUser} className="font-mono" />
                </Field>
                <Field label="Mot de passe SMTP" hint={keptHint("Mot de passe")}>
                  <TextInput
                    name="secret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={secretHint ? "•••••••• (inchangé)" : ""}
                  />
                </Field>
              </div>
            </div>
          )}

          {(provider === "resend" || provider === "brevo") && (
            <Field
              label={meta.secretLabel ?? "Clé d'API"}
              hint={keptHint("Clé") ?? meta.hint}
              style={{ maxWidth: 460 }}
            >
              <TextInput
                name="secret"
                type="password"
                autoComplete="off"
                placeholder={
                  secretHint ? "•••••••• (inchangée)" : provider === "resend" ? "re_…" : "xkeysib-…"
                }
                className="font-mono"
              />
            </Field>
          )}

          {provider === "mailjet" && (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
            >
              <Field label="Clé d'API (publique)" hint={keptHint("Clé")}>
                <TextInput
                  name="secret"
                  type="password"
                  autoComplete="off"
                  placeholder={secretHint ? "•••••••• (inchangée)" : ""}
                  className="font-mono"
                />
              </Field>
              <Field label="Clé privée (secret)" hint="Les deux champs vides = clés conservées.">
                <TextInput
                  name="secret2"
                  type="password"
                  autoComplete="off"
                  placeholder={secretHint ? "•••••••• (inchangée)" : ""}
                  className="font-mono"
                />
              </Field>
            </div>
          )}
        </>
      )}
    </div>
  );
}
