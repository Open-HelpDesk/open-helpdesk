"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/i18n/client";

export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No token in the URL: the form cannot succeed, so say so instead of letting
  // the user type a password that will be rejected.
  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[13px]" style={{ color: "var(--dang)" }}>
          {t("app.reset.missing")}
        </p>
        <a href="/forgot-password" className="ohd-link text-center text-[13px]">
          {t("app.forgot.title")}
        </a>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const newPassword = String(new FormData(e.currentTarget).get("password"));
    if (newPassword.length < 8) {
      setError(t("app.reset.tooShort"));
      return;
    }
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    if (error) {
      // The token is single-use and time-bound; the common failure is that it
      // expired or was already spent. Point back to requesting a fresh one.
      setError(t("app.reset.invalid"));
      setPending(false);
      return;
    }
    setDone(true);
    setPending(false);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] font-semibold">{t("app.reset.success")}</p>
        <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
          {t("app.reset.successBody")}
        </p>
        <a
          href="/login"
          className="rounded-md text-center text-sm font-semibold text-white"
          style={{ height: 38, lineHeight: "38px", background: "var(--acc)" }}
        >
          {t("app.reset.signIn")}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" className="flex flex-col gap-3">
      <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
        {t("app.reset.body")}
      </p>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        {t("app.reset.password")}
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={t("app.reset.placeholder")}
          className="border px-3 text-sm font-normal outline-none focus:ring-2"
          style={{
            height: 36,
            borderRadius: 6,
            borderColor: error ? "var(--dang)" : "var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
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
        disabled={pending}
        className="mt-1 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        style={{ height: 38, background: "var(--acc)" }}
      >
        {pending ? t("app.reset.pending") : t("app.reset.submit")}
      </button>
    </form>
  );
}
