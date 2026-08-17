"use client";

/**
 * ST-03 — Configuration du fournisseur d'envoi, par workspace.
 * Cartes de fournisseurs (SMTP / Resend / Brevo / Mailjet / aucun envoi), champs
 * adaptés au fournisseur choisi, préréglages SMTP du marché. Les secrets ne sont
 * jamais renvoyés au navigateur : le champ reste vide et un indice « ••••1a2b »
 * indique qu'un secret est déjà enregistré.
 */
import { useState } from "react";
import { PROVIDER_META, SMTP_PRESETS, type MailProvider } from "@openhelpdesk/mail/provider-meta";

const PROVIDERS: MailProvider[] = ["smtp", "resend", "brevo", "mailjet", "console"];

const fieldStyle = {
  height: 36,
  padding: "0 11px",
  border: "1px solid var(--line)",
  borderRadius: 6,
  background: "var(--bg)",
  color: "var(--ink)",
  fontSize: 13.5,
  width: "100%",
} as const;

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <>
      <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
        {children}
      </span>
      {hint && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{hint}</span>}
    </>
  );
}

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

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="provider" value={provider} />

      {/* Choix du fournisseur */}
      <div>
        <p className="mb-2 font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          Fournisseur d'envoi
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 10,
          }}
        >
          {PROVIDERS.map((key) => {
            const active = provider === key;
            return (
              <button
                type="button"
                key={key}
                onClick={() => setProvider(key)}
                className="text-left"
                style={{
                  padding: "13px 15px",
                  borderRadius: 10,
                  border: `1px solid ${active ? "var(--acc)" : "var(--line)"}`,
                  background: active ? "var(--acc-t)" : "var(--panel)",
                }}
              >
                <span
                  className="block font-semibold"
                  style={{ fontSize: 15, color: active ? "var(--acc)" : "var(--ink)" }}
                >
                  {PROVIDER_META[key].label}
                </span>
                <span className="block" style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  {PROVIDER_META[key].hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Identité d'expédition */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 13,
        }}
      >
        <label className="flex flex-col gap-1.5">
          <Label>Nom d'expéditeur</Label>
          <input name="fromName" defaultValue={initial.fromName} placeholder="Acme Support" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label hint="Doit appartenir à un domaine que vous authentifiez ci-dessous.">
            Adresse d'expédition
          </Label>
          <input
            name="fromAddress"
            type="email"
            defaultValue={initial.fromAddress}
            placeholder="support@votre-domaine.fr"
            className="font-mono"
            style={fieldStyle}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label hint="Laisser vide pour utiliser l'adresse d'expédition.">Répondre à</Label>
          <input
            name="replyTo"
            type="email"
            defaultValue={initial.replyTo}
            className="font-mono"
            style={fieldStyle}
          />
        </label>
      </div>

      {/* Champs propres au fournisseur */}
      {provider === "smtp" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5" style={{ maxWidth: 320 }}>
            <Label hint="Remplit l'hôte et le port du relais choisi.">Préréglage</Label>
            <select
              defaultValue="custom"
              onChange={(e) => applyPreset(e.target.value)}
              style={fieldStyle}
            >
              {SMTP_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px,2fr) 110px minmax(160px,1fr)",
              gap: 13,
            }}
          >
            <label className="flex flex-col gap-1.5">
              <Label>Hôte SMTP</Label>
              <input
                name="smtpHost"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.votre-domaine.fr"
                className="font-mono"
                style={fieldStyle}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <Label>Port</Label>
              <input
                name="smtpPort"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                inputMode="numeric"
                className="font-mono tabular-nums"
                style={fieldStyle}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <Label>Chiffrement</Label>
              <select
                name="smtpSecure"
                value={secure ? "true" : "false"}
                onChange={(e) => setSecure(e.target.value === "true")}
                style={fieldStyle}
              >
                <option value="false">STARTTLS (587, 25)</option>
                <option value="true">TLS implicite (465)</option>
              </select>
            </label>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
              gap: 13,
            }}
          >
            <label className="flex flex-col gap-1.5">
              <Label hint="Laisser vide pour un relais sans authentification.">
                Identifiant
              </Label>
              <input
                name="smtpUser"
                defaultValue={initial.smtpUser}
                className="font-mono"
                style={fieldStyle}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <Label
                hint={
                  secretHint
                    ? `Enregistré : ${secretHint}. Laisser vide pour le conserver.`
                    : undefined
                }
              >
                Mot de passe SMTP
              </Label>
              <input
                name="secret"
                type="password"
                autoComplete="new-password"
                placeholder={secretHint ? "•••••••• (inchangé)" : ""}
                style={fieldStyle}
              />
            </label>
          </div>
        </div>
      )}

      {(provider === "resend" || provider === "brevo") && (
        <label className="flex flex-col gap-1.5" style={{ maxWidth: 480 }}>
          <Label
            hint={
              secretHint
                ? `Enregistrée : ${secretHint}. Laisser vide pour la conserver. ${meta.hint}`
                : meta.hint
            }
          >
            {meta.secretLabel}
          </Label>
          <input
            name="secret"
            type="password"
            autoComplete="off"
            placeholder={secretHint ? "•••••••• (inchangée)" : provider === "resend" ? "re_…" : "xkeysib-…"}
            style={fieldStyle}
          />
        </label>
      )}

      {provider === "mailjet" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 13,
          }}
        >
          <label className="flex flex-col gap-1.5">
            <Label hint={secretHint ? `Enregistrée : ${secretHint}.` : meta.hint}>
              Clé d'API (publique)
            </Label>
            <input
              name="secret"
              type="password"
              autoComplete="off"
              placeholder={secretHint ? "•••••••• (inchangée)" : ""}
              style={fieldStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label hint="Laisser les deux champs vides conserve les clés enregistrées.">
              Clé privée (secret)
            </Label>
            <input
              name="secret2"
              type="password"
              autoComplete="off"
              placeholder={secretHint ? "•••••••• (inchangée)" : ""}
              style={fieldStyle}
            />
          </label>
        </div>
      )}

      {provider === "console" && (
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
      )}
    </div>
  );
}
