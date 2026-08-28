"use client";

/**
 * Invitation acceptance form: password (server action) or OAuth — the provider
 * comes back to the invitation page, which then activates the session already
 * open.
 */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";
import { acceptInvite } from "../actions";

export function AcceptInviteForm({
  token,
  defaultName,
  initialError,
}: {
  token: string;
  defaultName: string;
  initialError?: string;
}) {
  const t = useT();
  const [socialError, setSocialError] = useState<string | null>(null);

  const error =
    socialError ??
    (initialError === "password"
      ? t("app.invite.passwordTooShort")
      : initialError
        ? t("app.invite.failed")
        : null);

  async function onSocial(provider: "google" | "microsoft") {
    setSocialError(null);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: `/invite/${encodeURIComponent(token)}`,
    });
    if (error) setSocialError(t("app.login.providerMissing"));
  }

  const inputStyle = {
    height: 36,
    borderRadius: 6,
    borderColor: "var(--line)",
    background: "var(--bg)",
    color: "var(--ink)",
  } as const;

  return (
    <div
      className="rounded-[10px] border p-6"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <form action={acceptInvite} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          {t("app.invite.nameLabel")}
          <input
            name="name"
            type="text"
            defaultValue={defaultName}
            autoComplete="name"
            className="border px-3 text-sm font-normal outline-none focus:ring-2"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          {t("app.invite.passwordLabel")}
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="border px-3 text-sm font-normal outline-none focus:ring-2"
            style={inputStyle}
          />
        </label>

        {error && (
          <p
            className="rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--dang-t)", borderColor: "var(--dang)", color: "var(--dang)" }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          className="rounded-md font-semibold"
          style={{ color: "var(--on-brand)", height: 38, fontSize: 13.5, background: "var(--acc)" }}
        >
          {t("app.invite.submit")}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3" style={{ color: "var(--ink-3)", fontSize: 11 }}>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        {t("app.login.or")}
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onSocial("google")}
          className="ohd-hover-edge-ink rounded-md border font-medium"
          style={{ height: 36, fontSize: 13, borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
        >
          {t("app.login.google")}
        </button>
        <button
          type="button"
          onClick={() => onSocial("microsoft")}
          className="ohd-hover-edge-ink rounded-md border font-medium"
          style={{ height: 36, fontSize: 13, borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
        >
          {t("app.login.microsoft")}
        </button>
      </div>
    </div>
  );
}
