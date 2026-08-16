import { LoginForm } from "./login-form";

/**
 * AG-01 — Connexion (specs/10). Branding du tenant, carte centrée 400 px,
 * email + mot de passe, SSO Google/Microsoft, mention « propulsé par » en pied.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full" style={{ maxWidth: 400 }}>
        <div
          className="rounded-xl border p-8 shadow-sm"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <h1 className="mb-1 text-lg font-semibold">Se connecter</h1>
          <p className="mb-5 text-sm" style={{ color: "var(--mute)" }}>
            Accédez à votre espace de travail.
          </p>
          <LoginForm initialError={error} />
        </div>
        <p className="mt-4 text-center text-xs" style={{ color: "var(--mute)" }}>
          Propulsé par Open HelpDesk
        </p>
      </div>
    </main>
  );
}
