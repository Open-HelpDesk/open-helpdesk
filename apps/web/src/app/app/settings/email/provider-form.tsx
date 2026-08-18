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
import { useT } from "@/i18n/client";

const PROVIDERS: MailProvider[] = ["smtp", "resend", "brevo", "mailjet", "console"];

/** Monogramme décoratif de chaque fournisseur (teintes du design system). */
const MONOGRAMS: Record<MailProvider, { glyph: string; bg: string; color: string }> = {
  smtp: { glyph: "@", bg: "var(--open-t)", color: "var(--open)" },
  resend: { glyph: "R", bg: "var(--new-t)", color: "var(--new)" },
  brevo: { glyph: "B", bg: "var(--ok-t)", color: "var(--ok)" },
  mailjet: { glyph: "M", bg: "var(--wait-t)", color: "var(--wait)" },
  console: { glyph: ">_", bg: "var(--sunk)", color: "var(--ink-3)" },
};

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
  const t = useT();
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
  // Un secret déjà enregistré n'est jamais réaffiché : l'indice le rappelle.
  const keptPasswordHint = secretHint
    ? t("app.settings.email.secretKeptPassword", { hint: secretHint })
    : undefined;
  const keptKeyHint = secretHint
    ? t("app.settings.email.secretKeptKey", { hint: secretHint })
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="provider" value={provider} />

      {/* Cartes-radio des fournisseurs */}
      <div
        role="radiogroup"
        aria-label={t("app.settings.email.providerTitle")}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 10,
        }}
      >
        {PROVIDERS.map((key) => {
          const active = provider === key;
          const mono = MONOGRAMS[key];
          return (
            <button
              type="button"
              role="radio"
              aria-checked={active}
              key={key}
              onClick={() => setProvider(key)}
              className="text-left"
              style={{
                padding: "12px 13px",
                borderRadius: 10,
                border: `1px solid ${active ? "var(--acc)" : "var(--line)"}`,
                background: active ? "var(--acc-t)" : "var(--panel)",
                boxShadow: active ? "inset 0 0 0 1px var(--acc)" : "none",
                cursor: "pointer",
              }}
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center rounded-md font-mono font-bold"
                  style={{ width: 28, height: 28, fontSize: 13, background: mono.bg, color: mono.color }}
                >
                  {mono.glyph}
                </span>
                <span
                  className="min-w-0 flex-1 truncate font-semibold"
                  style={{ fontSize: 14, color: active ? "var(--acc)" : "var(--ink)" }}
                >
                  {PROVIDER_META[key].label}
                </span>
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center rounded-full"
                  style={{
                    width: 15,
                    height: 15,
                    border: `1.5px solid ${active ? "var(--acc)" : "var(--line)"}`,
                    background: "var(--panel)",
                  }}
                >
                  {active && (
                    <span
                      className="rounded-full"
                      style={{ width: 7, height: 7, background: "var(--acc)" }}
                    />
                  )}
                </span>
              </span>
              <span
                className="mt-1.5 block"
                style={{ fontSize: 12, lineHeight: 1.45, color: "var(--ink-3)", textWrap: "pretty" }}
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
            color: "var(--ink-2)",
            background: "var(--sunk)",
            borderRadius: 8,
            padding: "10px 13px",
          }}
        >
          {t("app.settings.email.consoleNotice")}
        </p>
      ) : (
        <>
          {/* Identité d'expédition */}
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
          >
            <Field label={t("app.settings.email.fromNameLabel")}>
              <TextInput name="fromName" defaultValue={initial.fromName} placeholder="Acme Support" />
            </Field>
            <Field
              label={t("app.settings.email.fromAddressLabel")}
              hint={t("app.settings.email.fromAddressHint")}
            >
              <TextInput
                name="fromAddress"
                type="email"
                defaultValue={initial.fromAddress}
                placeholder={t("app.settings.email.placeholderEmail")}
                className="font-mono"
              />
            </Field>
            <Field
              label={t("app.settings.email.replyToLabel")}
              hint={t("app.settings.email.replyToHint")}
            >
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
                label={t("app.settings.email.presetLabel")}
                hint={t("app.settings.email.presetHint")}
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
                <Field label={t("app.settings.email.smtpHostLabel")}>
                  <TextInput
                    name="smtpHost"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder={t("app.settings.email.placeholderSmtpHost")}
                    className="font-mono"
                  />
                </Field>
                <Field label={t("app.settings.email.port")}>
                  <TextInput
                    name="smtpPort"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    inputMode="numeric"
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field label={t("app.settings.email.encryption")}>
                  <Select
                    name="smtpSecure"
                    value={secure ? "true" : "false"}
                    onChange={(e) => setSecure(e.target.value === "true")}
                  >
                    <option value="false">{t("app.settings.email.smtpStarttls")}</option>
                    <option value="true">{t("app.settings.email.smtpTlsImplicit")}</option>
                  </Select>
                </Field>
              </div>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
              >
                <Field
                  label={t("app.settings.email.username")}
                  hint={t("app.settings.email.smtpUserHint")}
                >
                  <TextInput name="smtpUser" defaultValue={initial.smtpUser} className="font-mono" />
                </Field>
                <Field label={t("app.settings.email.smtpPasswordLabel")} hint={keptPasswordHint}>
                  <TextInput
                    name="secret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={secretHint ? t("app.settings.email.passwordUnchanged") : ""}
                  />
                </Field>
              </div>
            </div>
          )}

          {(provider === "resend" || provider === "brevo") && (
            <Field
              label={meta.secretLabel ?? t("app.settings.email.apiKeyLabel")}
              hint={keptKeyHint ?? meta.hint}
              style={{ maxWidth: 460 }}
            >
              <TextInput
                name="secret"
                type="password"
                autoComplete="off"
                placeholder={
                  secretHint
                    ? t("app.settings.email.keyUnchanged")
                    : provider === "resend"
                      ? "re_…"
                      : "xkeysib-…"
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
              <Field label={t("app.settings.email.mailjetPublicKeyLabel")} hint={keptKeyHint}>
                <TextInput
                  name="secret"
                  type="password"
                  autoComplete="off"
                  placeholder={secretHint ? t("app.settings.email.keyUnchanged") : ""}
                  className="font-mono"
                />
              </Field>
              <Field
                label={t("app.settings.email.mailjetPrivateKeyLabel")}
                hint={t("app.settings.email.mailjetKeysHint")}
              >
                <TextInput
                  name="secret2"
                  type="password"
                  autoComplete="off"
                  placeholder={secretHint ? t("app.settings.email.keyUnchanged") : ""}
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
