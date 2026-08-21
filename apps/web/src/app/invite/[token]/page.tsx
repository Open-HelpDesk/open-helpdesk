import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@openhelpdesk/auth";
import { db, users } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { getTenantFromHeaders } from "@/lib/tenant";
import { verifyInviteToken } from "@/lib/invite-token";
import { getT } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import { activateFromSession } from "../actions";
import { AcceptInviteForm } from "./accept-form";

/**
 * Acceptation d'invitation (ST-02) : le lien reçu par email atterrit ici, sur
 * le sous-domaine du workspace. Sans session : formulaire mot de passe (+ OAuth,
 * qui revient sur cette page une fois connecté). Avec session sur la bonne
 * adresse : activation immédiate.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getT();
  const { token } = await params;
  const { error } = await searchParams;
  const tenant = await getTenantFromHeaders();
  if (!tenant) redirect("/login");

  const userId = verifyInviteToken(tenant.id, token);
  const [invited] = userId
    ? await db
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenant.id), eq(users.id, userId)))
    : [undefined];

  const branding = (tenant.branding ?? {}) as { accentColor?: string };
  const accent = branding.accentColor || "var(--acc)";

  if (!invited || invited.status === "disabled") {
    return (
      <main className="ohd flex min-h-screen items-center justify-center p-4">
        <div className="w-full text-center" style={{ maxWidth: 400 }}>
          <h1 className="font-bold" style={{ fontSize: 20, color: "var(--ink)" }}>
            {t("app.invite.invalidTitle")}
          </h1>
          <p className="mt-3" style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
            {t("app.invite.invalidText")}
          </p>
        </div>
      </main>
    );
  }

  if (invited.status === "active") redirect("/login?accepted=1");

  // Session déjà ouverte (retour d'OAuth) sur la bonne adresse : activer et entrer.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session && session.user.email === invited.email) {
    await activateFromSession(token);
    redirect("/app/tickets");
  }

  return (
    <main className="ohd flex min-h-screen items-center justify-center p-4">
      <div className="ohd-rise-slow w-full" style={{ maxWidth: 400 }}>
        <div className="mb-5 flex flex-col items-center gap-2.5">
          <div
            className="flex items-center justify-center font-bold text-white"
            style={{ width: 40, height: 40, borderRadius: 10, background: accent, fontSize: 18 }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="font-bold" style={{ fontSize: 18, color: "var(--ink)" }}>
            {t("app.invite.title", { workspace: tenant.name })}
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {t("app.invite.subtitle", { email: invited.email })}
          </p>
        </div>
        <I18nProvider locale={t.locale} dict={t.dict}>
          <AcceptInviteForm token={token} defaultName={invited.name} initialError={error} />
        </I18nProvider>
      </div>
    </main>
  );
}
