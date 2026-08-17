import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db, mailboxes, tickets, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { CopyButton, IdentityForm, TeamInviteForm } from "./onboarding-client";

/**
 * AG-02 — Onboarding (design espace-agent) : colonne gauche 320 px fond canvas avec
 * stepper 4 étapes, colonne droite kicker + titre 26 px + CTA h38 « Passer cette étape ».
 * Navigation par ?step=1..4.
 */

const STEPS = [
  { n: 1, label: "Identité", hint: "Nom, logo, couleur" },
  { n: 2, label: "Email", hint: "Adresse de réception" },
  { n: 3, label: "Équipe", hint: "Inviter les agents" },
  { n: 4, label: "Essai", hint: "Premier ticket" },
] as const;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { step: stepParam } = await searchParams;
  const step = Math.min(4, Math.max(1, Number(stepParam) || 1));

  const branding = (tenant.branding ?? {}) as { accentColor?: string };

  const [mailboxRows, [userCount], [ticketCount]] = await Promise.all([
    db.select().from(mailboxes).where(eq(mailboxes.tenantId, tenant.id)),
    db.select({ n: count() }).from(users).where(eq(users.tenantId, tenant.id)),
    db.select({ n: count() }).from(tickets).where(eq(tickets.tenantId, tenant.id)),
  ]);
  const mailbox = mailboxRows.find((m) => m.kind === "provided") ?? mailboxRows[0];
  const mailboxAddress = mailbox?.address ?? `support@${tenant.slug}.open-helpdesk.email`;

  const checklist = [
    { label: "Identité définie", done: Boolean(branding.accentColor) },
    { label: "Adresse email configurée", done: Boolean(mailbox?.verified) },
    { label: "Équipe invitée", done: (userCount?.n ?? 0) > 1 },
    { label: "Premier ticket reçu", done: (ticketCount?.n ?? 0) > 0 },
    { label: "Politique SLA vérifiée", done: true },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Colonne gauche — stepper 320 px */}
      <aside
        className="hidden w-[320px] shrink-0 flex-col border-r p-8 md:flex"
        style={{ background: "var(--canvas)", borderColor: "var(--line)" }}
      >
        <div className="mb-10 flex items-center gap-2.5">
          <span
            className="flex items-center justify-center font-bold text-white"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: branding.accentColor || "var(--acc)",
            }}
            aria-hidden
          >
            {tenant.name[0]?.toUpperCase()}
          </span>
          <span className="text-sm font-semibold">Configuration</span>
        </div>

        <ol className="flex flex-col gap-6">
          {STEPS.map((s) => {
            const done = s.n < step;
            const current = s.n === step;
            return (
              <li key={s.n} className="flex items-start gap-3">
                <span
                  className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{
                    width: 22,
                    height: 22,
                    marginTop: 1,
                    background: done ? "var(--acc)" : "transparent",
                    color: done ? "#fff" : current ? "var(--acc)" : "var(--ink-3)",
                    border: done
                      ? "1px solid var(--acc)"
                      : current
                        ? "2px solid var(--acc)"
                        : "1px solid var(--line)",
                  }}
                >
                  {done ? "✓" : s.n}
                </span>
                <span className="flex flex-col">
                  <Link
                    href={`/onboarding?step=${s.n}`}
                    className="text-[13.5px]"
                    style={{ fontWeight: current ? 600 : 500, color: "var(--ink)" }}
                  >
                    {s.label}
                  </Link>
                  <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {s.hint}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-auto pt-8 text-[12px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
          Vous pourrez modifier tous ces réglages plus tard dans les paramètres.
        </p>
      </aside>

      {/* Colonne droite */}
      <main
        className="ohd-rise min-w-0 flex-1 overflow-y-auto"
        style={{ background: "var(--bg)", padding: "48px 56px" }}
      >
        <div style={{ maxWidth: 640 }}>
          <p
            className="mb-2 uppercase tracking-wider"
            style={{ fontSize: 12, fontWeight: 600, color: "var(--acc-2)" }}
          >
            Étape {step} sur 4
          </p>

          {step === 1 && (
            <>
              <h1 className="mb-2" style={{ fontSize: 26, fontWeight: 600 }}>
                Identité de votre workspace
              </h1>
              <p className="mb-7 text-sm" style={{ color: "var(--ink-2)" }}>
                Ces éléments apparaîtront sur votre portail client et dans les emails envoyés à
                vos clients.
              </p>
              <IdentityForm
                initialName={tenant.name}
                initialAccent={branding.accentColor ?? "#0B5F46"}
              />
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="mb-2" style={{ fontSize: 26, fontWeight: 600 }}>
                Recevoir vos emails
              </h1>
              <p className="mb-7 text-sm" style={{ color: "var(--ink-2)" }}>
                Toutes les demandes reçues à cette adresse deviennent automatiquement des
                tickets.
              </p>

              <div
                className="flex items-center gap-2 border p-3"
                style={{
                  borderRadius: 8,
                  borderColor: "var(--line)",
                  background: "var(--sunk)",
                  maxWidth: 460,
                }}
              >
                <code
                  className="min-w-0 flex-1 truncate text-[13px]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {mailboxAddress}
                </code>
                <CopyButton value={mailboxAddress} />
              </div>

              <div
                className="my-5 flex items-center gap-3 text-[11px] font-semibold"
                style={{ color: "var(--ink-3)", maxWidth: 460 }}
              >
                <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                OU
                <span className="h-px flex-1" style={{ background: "var(--line)" }} />
              </div>

              <div
                className="border p-4"
                style={{ borderRadius: 8, borderColor: "var(--line)", maxWidth: 460 }}
              >
                <p className="mb-1 text-[13.5px] font-semibold">Connecter ma propre adresse</p>
                <p className="mb-3 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                  Transférez votre adresse existante (support@votre-domaine.fr) vers l'adresse
                  fournie ci-dessus. Configuration détaillée dans les paramètres.
                </p>
                <label className="flex flex-col gap-1 text-[12.5px] font-medium">
                  Adresse à transférer
                  <input
                    disabled
                    placeholder="support@votre-domaine.fr"
                    className="border px-3 text-sm font-normal"
                    style={{
                      height: 34,
                      borderRadius: 6,
                      borderColor: "var(--line)",
                      background: "var(--sunk)",
                      color: "var(--ink-3)",
                    }}
                  />
                </label>
              </div>

              <div className="mt-7 flex items-center gap-4">
                <Link
                  href="/onboarding?step=3"
                  className="inline-flex items-center rounded-md px-5 text-sm font-semibold text-white"
                  style={{ height: 38, background: "var(--acc)" }}
                >
                  Continuer
                </Link>
                <Link href="/onboarding?step=3" className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                  Passer cette étape
                </Link>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="mb-2" style={{ fontSize: 26, fontWeight: 600 }}>
                Inviter votre équipe
              </h1>
              <p className="mb-7 text-sm" style={{ color: "var(--ink-2)" }}>
                Invitez vos agents maintenant, ou partagez le lien d'invitation. Les sièges
                Viewer sont gratuits.
              </p>
              <TeamInviteForm />
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="mb-2" style={{ fontSize: 26, fontWeight: 600 }}>
                Envoyer un premier ticket
              </h1>
              <p className="mb-7 text-sm" style={{ color: "var(--ink-2)" }}>
                Vérifiez la chaîne complète avant d'ouvrir le service à vos clients.
              </p>

              <div
                className="mb-6 flex items-center gap-3 border p-4"
                style={{
                  borderRadius: 10,
                  background: "var(--ok-t)",
                  borderColor: "var(--acc-b)",
                  maxWidth: 460,
                }}
              >
                <span
                  className="flex shrink-0 items-center justify-center rounded-full text-white"
                  style={{ width: 26, height: 26, background: "var(--acc)" }}
                >
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">Votre workspace est prêt</p>
                  <p className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                    Envoyez un email à{" "}
                    <span style={{ fontFamily: "var(--font-mono)" }}>{mailboxAddress}</span>{" "}
                    pour créer un ticket de test.
                  </p>
                </div>
              </div>

              <ul className="mb-8 flex flex-col gap-2.5" style={{ maxWidth: 460 }}>
                {checklist.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5 text-[13.5px]">
                    <span
                      className="flex shrink-0 items-center justify-center rounded-full text-[10px]"
                      style={{
                        width: 18,
                        height: 18,
                        background: item.done ? "var(--acc)" : "transparent",
                        color: item.done ? "#fff" : "var(--ink-3)",
                        border: item.done ? "none" : "1.5px solid var(--line)",
                      }}
                    >
                      {item.done ? "✓" : ""}
                    </span>
                    <span style={{ color: item.done ? "var(--ink)" : "var(--ink-2)" }}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/app/tickets"
                className="inline-flex items-center rounded-md px-5 text-sm font-semibold text-white"
                style={{ height: 38, background: "var(--acc)" }}
              >
                Ouvrir l'inbox
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
