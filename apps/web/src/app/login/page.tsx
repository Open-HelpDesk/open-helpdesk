/**
 * AG-01 — Connexion. Squelette Lot 0 ; le branchement Better Auth
 * (email + mot de passe, Google/Microsoft, 2FA) arrive en fin de Lot 0.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div
        className="w-full rounded-lg border p-8"
        style={{ maxWidth: 400, background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <p
          className="mb-2 font-mono text-xs uppercase tracking-wider"
          style={{ color: "var(--acc)" }}
        >
          AG-01 · Connexion
        </p>
        <h1 className="text-lg font-semibold">Se connecter</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--mute)" }}>
          Auth (Better Auth) branchée en fin de Lot 0 : email + mot de passe,
          Google/Microsoft, 2FA.
        </p>
      </div>
    </main>
  );
}
