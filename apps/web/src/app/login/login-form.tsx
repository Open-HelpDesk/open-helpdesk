"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/i18n/client";

export function LoginForm({ initialError }: { initialError?: string }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    initialError === "not-a-member" ? t("app.login.notAMember") : null,
  );
  const [badCredentials, setBadCredentials] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setBadCredentials(false);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      // A rate-limit refusal is not a wrong password. Better Auth caps /sign-in
      // at a few calls per ten seconds; conflating the two blamed a legitimate
      // agent for a fault they had not committed, and invited them to fix a
      // correct password instead of waiting.
      // Same logic for an unverified email (cloud signup): the password IS
      // correct — telling the user otherwise sends them to reset a password
      // that works instead of opening the verification email.
      const rateLimited = error.status === 429;
      const unverified = error.code === "EMAIL_NOT_VERIFIED";
      setError(
        rateLimited
          ? t("app.login.rateLimited")
          : unverified
            ? t("app.login.emailNotVerified")
            : t("app.login.badCredentials"),
      );
      setBadCredentials(!rateLimited && !unverified);
      setPending(false);
      return;
    }
    router.push("/app/tickets");
    router.refresh();
  }

  async function onSocial(provider: "google" | "microsoft") {
    setError(null);
    setBadCredentials(false);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: "/app/tickets",
    });
    if (error) setError(t("app.login.providerMissing"));
  }

  const inputStyle = {
    height: 36,
    borderRadius: 6,
    borderColor: badCredentials ? "var(--dang)" : "var(--line)",
    background: "var(--bg)",
    color: "var(--ink)",
  } as const;

  return (
    // `method="post"` even though submission is intercepted in JavaScript: this
    // is the safety net for the window before hydration. Without it, a form with
    // no method goes out as GET, and both the email and the password end up in
    // URL parameters — hence in the address bar, the history and the server
    // access logs.
    <form onSubmit={onSubmit} method="post" className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        {t("app.login.email")}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("app.login.emailPlaceholder")}
          className="border px-3 text-sm font-normal outline-none focus:ring-2"
          style={inputStyle}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        <span className="flex items-baseline justify-between">
          {t("app.login.password")}
          <a href="/forgot-password" className="ohd-link font-normal" style={{ fontSize: 12 }}>
            {t("app.login.forgot")}
          </a>
        </span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="border px-3 text-sm font-normal outline-none focus:ring-2"
          style={inputStyle}
        />
      </label>

      {error && (
        <p
          className="rounded-md border px-3 py-2 text-[13px]"
          style={{
            background: "var(--dang-t)",
            borderColor: "var(--dang)",
            color: "var(--dang)",
          }}
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
        {pending ? t("app.login.pending") : t("app.login.submit")}
      </button>

      <div
        className="my-1 flex items-center gap-3 text-[11px] font-semibold"
        style={{ color: "var(--ink-3)" }}
      >
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        {t("app.login.or")}
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      <button
        type="button"
        onClick={() => onSocial("google")}
        className="rounded-md border text-[13px] font-medium"
        style={{ height: 36, borderColor: "var(--line)", background: "var(--bg)" }}
      >
        {t("app.login.google")}
      </button>
      <button
        type="button"
        onClick={() => onSocial("microsoft")}
        className="rounded-md border text-[13px] font-medium"
        style={{ height: 36, borderColor: "var(--line)", background: "var(--bg)" }}
      >
        {t("app.login.microsoft")}
      </button>
    </form>
  );
}
