"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    initialError === "not-a-member"
      ? "Cette identité n'est pas membre de ce workspace."
      : null,
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
      setError("Identifiants incorrects.");
      setBadCredentials(true);
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
    if (error) {
      setError("Ce fournisseur n'est pas configuré sur cette instance.");
    }
  }

  const inputStyle = {
    height: 36,
    borderRadius: 6,
    borderColor: badCredentials ? "var(--dang)" : "var(--line)",
    background: "var(--bg)",
    color: "var(--ink)",
  } as const;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="vous@entreprise.fr"
          className="border px-3 text-sm font-normal outline-none focus:ring-2"
          style={inputStyle}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        <span className="flex items-baseline justify-between">
          Mot de passe
          <a
            href="#"
            className="font-normal"
            style={{ color: "var(--acc-2)", fontSize: 12 }}
          >
            Mot de passe oublié ?
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
        {pending ? "Connexion…" : "Se connecter"}
      </button>

      <div
        className="my-1 flex items-center gap-3 text-[11px] font-semibold"
        style={{ color: "var(--ink-3)" }}
      >
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        OU
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      <button
        type="button"
        onClick={() => onSocial("google")}
        className="rounded-md border text-[13px] font-medium"
        style={{ height: 36, borderColor: "var(--line)", background: "var(--bg)" }}
      >
        Continuer avec Google
      </button>
      <button
        type="button"
        onClick={() => onSocial("microsoft")}
        className="rounded-md border text-[13px] font-medium"
        style={{ height: 36, borderColor: "var(--line)", background: "var(--bg)" }}
      >
        Continuer avec Microsoft
      </button>
    </form>
  );
}
