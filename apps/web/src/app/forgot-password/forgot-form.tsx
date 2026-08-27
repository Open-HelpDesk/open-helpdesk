"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/i18n/client";

export function ForgotForm() {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = String(new FormData(e.currentTarget).get("email"));
    // The outcome is deliberately the same whether or not the address exists:
    // Better Auth returns success in both cases (timing-attack mitigation), and
    // the UI must not reveal which addresses have an account. So we never read
    // the result — any completion shows the same confirmation.
    await authClient.requestPasswordReset({ email }).catch(() => {});
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
          {t("app.forgot.sent")}
        </p>
        <a href="/login" className="ohd-link text-center text-[13px]">
          {t("app.forgot.back")}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" className="flex flex-col gap-3">
      <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
        {t("app.forgot.body")}
      </p>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        {t("app.login.email")}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("app.login.emailPlaceholder")}
          className="border px-3 text-sm font-normal outline-none focus:ring-2"
          style={{ height: 36, borderRadius: 6, borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        style={{ height: 38, background: "var(--acc)" }}
      >
        {pending ? t("app.forgot.pending") : t("app.forgot.submit")}
      </button>
      <a href="/login" className="ohd-link mt-1 text-center text-[13px]">
        {t("app.forgot.back")}
      </a>
    </form>
  );
}
