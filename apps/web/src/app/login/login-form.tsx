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
      // Un refus de quota n'est pas un mauvais mot de passe. Better Auth plafonne
      // /sign-in à quelques appels par dizaine de secondes ; les confondre
      // reprochait à un agent légitime une faute qu'il n'avait pas commise, et
      // l'invitait à corriger un mot de passe correct au lieu de patienter.
      const rateLimited = error.status === 429;
      setError(rateLimited ? t("app.login.rateLimited") : t("app.login.badCredentials"));
      setBadCredentials(!rateLimited);
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
    // `method="post"` alors que la soumission est interceptée en JavaScript : c'est
    // le filet pour la fenêtre d'avant l'hydratation. Sans lui, un formulaire sans
    // méthode part en GET, et l'email comme le mot de passe se retrouvent en
    // paramètres d'URL — donc dans la barre d'adresse, l'historique et les
    // journaux d'accès du serveur.
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
          <a href="#" className="ohd-link font-normal" style={{ fontSize: 12 }}>
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
