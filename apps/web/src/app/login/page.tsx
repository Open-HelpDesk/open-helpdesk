import { db, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { getTenantSlug } from "@/lib/tenant";
import { LoginForm } from "./login-form";

/**
 * AG-01 — Connexion (design espace-agent) : logo A 40×40 + nom du workspace au-dessus,
 * carte 400 px padding 24 radius 10, email + mot de passe (lien « Mot de passe
 * oublié ? »), erreur bordure --dang, séparateur « OU », SSO Google/Microsoft,
 * pied « Propulsé par Open HelpDesk ».
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const slug = await getTenantSlug();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  const workspaceName = tenant?.name ?? "Open HelpDesk";
  const branding = (tenant?.branding ?? {}) as { accentColor?: string };
  const accent = branding.accentColor || "var(--acc)";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="ohd-rise-slow w-full" style={{ maxWidth: 400 }}>
        {/* Logo + nom du workspace */}
        <div className="mb-5 flex flex-col items-center gap-2.5">
          <div
            className="flex items-center justify-center font-bold text-white"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: accent,
              fontSize: 18,
            }}
            aria-hidden
          >
            {workspaceName[0]?.toUpperCase()}
          </div>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{workspaceName}</p>
        </div>

        <div
          className="border shadow-sm"
          style={{
            background: "var(--panel)",
            borderColor: "var(--line)",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <LoginForm initialError={error} />
        </div>

        <p className="mt-4 text-center" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Propulsé par Open HelpDesk
        </p>
      </div>
    </main>
  );
}
