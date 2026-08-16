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
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError("Identifiants incorrects. Vérifiez votre email et votre mot de passe.");
      setPending(false);
      return;
    }
    router.push("/app/tickets");
    router.refresh();
  }

  async function onSocial(provider: "google" | "microsoft") {
    setError(null);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: "/app/tickets",
    });
    if (error) {
      setError("Ce fournisseur n'est pas configuré sur cette instance.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Mot de passe
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        />
      </label>

      {error && (
        <p className="rounded-md px-3 py-2 text-sm" style={{ background: "var(--dang-t)", color: "var(--dang)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--acc)" }}
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>

      <div className="my-1 flex items-center gap-3 text-xs" style={{ color: "var(--mute)" }}>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        ou
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSocial("google")}
          className="flex-1 rounded-md border px-3 py-2 text-sm font-medium"
          style={{ borderColor: "var(--line)" }}
        >
          Continuer avec Google
        </button>
        <button
          type="button"
          onClick={() => onSocial("microsoft")}
          className="flex-1 rounded-md border px-3 py-2 text-sm font-medium"
          style={{ borderColor: "var(--line)" }}
        >
          Microsoft
        </button>
      </div>

      <a href="#" className="text-center text-xs underline" style={{ color: "var(--mute)" }}>
        Mot de passe oublié ?
      </a>
    </form>
  );
}
