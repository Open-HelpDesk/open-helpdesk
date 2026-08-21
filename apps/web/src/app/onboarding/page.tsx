import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db, mailboxes, tickets, users } from "@openhelpdesk/db";
import { redirect } from "next/navigation";
import { isManager, requireAgent } from "@/lib/session";
import { CopyButton, IdentityForm, TeamInviteForm } from "./onboarding-client";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/fr";

/**
 * AG-02 — Onboarding (design espace-agent) : colonne gauche 320 px fond canvas avec
 * stepper 4 étapes, colonne droite kicker + titre 26 px + CTA h38 « Passer cette étape ».
 * Navigation par ?step=1..4.
 */

/** Le stepper est une constante de module : il porte des CLÉS, pas des mots. */
const STEPS: readonly { n: number; label: MessageKey; hint: MessageKey }[] = [
  { n: 1, label: "app.onboarding.stepIdentity", hint: "app.onboarding.stepIdentityHint" },
  { n: 2, label: "app.onboarding.stepEmail", hint: "app.onboarding.stepEmailHint" },
  { n: 3, label: "app.onboarding.stepTeam", hint: "app.onboarding.stepTeamHint" },
  { n: 4, label: "app.onboarding.stepTest", hint: "app.onboarding.stepTestHint" },
];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const t = await getT();
  const { tenant, agent } = await requireAgent();
  // L'écran de configuration initiale n'est pas un écran de travail : un agent
  // n'a rien à y faire, et ses formulaires portent des pouvoirs d'administration.
  if (!isManager(agent.role)) redirect("/app/tickets");
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

  const checklist: { label: MessageKey; done: boolean }[] = [
    { label: "app.onboarding.checklistIdentity", done: Boolean(branding.accentColor) },
    { label: "app.onboarding.checklistEmail", done: Boolean(mailbox?.verified) },
    { label: "app.onboarding.checklistTeam", done: (userCount?.n ?? 0) > 1 },
    { label: "app.onboarding.checklistTicket", done: (ticketCount?.n ?? 0) > 0 },
    { label: "app.onboarding.checklistSla", done: true },
  ];
  // La phrase de fin insère l'adresse en police à chasse fixe : elle est
  // découpée autour du paramètre pour garder l'ordre des mots de chaque langue.
  const [readyBefore, readyAfter] = t.parts("app.onboarding.readyBody", "address");

  return (
    <div className="ohd flex min-h-screen">
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
          <span className="text-sm font-semibold">{t("app.onboarding.asideTitle")}</span>
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
                    {t(s.label)}
                  </Link>
                  <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {t(s.hint)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-auto pt-8 text-[12px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
          {t("app.onboarding.asideFooter")}
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
            {t("app.onboarding.stepCounter", { step, total: 4 })}
          </p>

          {step === 1 && (
            <>
              <h1 className="mb-2" style={{ fontSize: 26, fontWeight: 600 }}>
                {t("app.onboarding.identityTitle")}
              </h1>
              <p className="mb-7 text-sm" style={{ color: "var(--ink-2)" }}>
                {t("app.onboarding.identityBody")}
              </p>
              <I18nProvider locale={t.locale} dict={t.dict}>
                <IdentityForm
                  initialName={tenant.name}
                  initialAccent={branding.accentColor ?? "#0B5F46"}
                />
              </I18nProvider>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="mb-2" style={{ fontSize: 26, fontWeight: 600 }}>
                {t("app.onboarding.emailTitle")}
              </h1>
              <p className="mb-7 text-sm" style={{ color: "var(--ink-2)" }}>
                {t("app.onboarding.emailBody")}
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
                <I18nProvider locale={t.locale} dict={t.dict}>
                  <CopyButton value={mailboxAddress} />
                </I18nProvider>
              </div>

              <div
                className="my-5 flex items-center gap-3 text-[11px] font-semibold"
                style={{ color: "var(--ink-3)", maxWidth: 460 }}
              >
                <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                {t("app.onboarding.or")}
                <span className="h-px flex-1" style={{ background: "var(--line)" }} />
              </div>

              <div
                className="border p-4"
                style={{ borderRadius: 8, borderColor: "var(--line)", maxWidth: 460 }}
              >
                <p className="mb-1 text-[13.5px] font-semibold">
                  {t("app.onboarding.ownAddressTitle")}
                </p>
                <p className="mb-3 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                  {t("app.onboarding.ownAddressBody", {
                    example: t("app.onboarding.forwardPlaceholder"),
                  })}
                </p>
                <label className="flex flex-col gap-1 text-[12.5px] font-medium">
                  {t("app.onboarding.forwardLabel")}
                  <input
                    disabled
                    placeholder={t("app.onboarding.forwardPlaceholder")}
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
                  {t("app.onboarding.continue")}
                </Link>
                <Link href="/onboarding?step=3" className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {t("app.onboarding.skip")}
                </Link>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="mb-2" style={{ fontSize: 26, fontWeight: 600 }}>
                {t("app.onboarding.teamTitle")}
              </h1>
              <p className="mb-7 text-sm" style={{ color: "var(--ink-2)" }}>
                {t("app.onboarding.teamBody")}
              </p>
              <I18nProvider locale={t.locale} dict={t.dict}>
                <TeamInviteForm />
              </I18nProvider>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="mb-2" style={{ fontSize: 26, fontWeight: 600 }}>
                {t("app.onboarding.testTitle")}
              </h1>
              <p className="mb-7 text-sm" style={{ color: "var(--ink-2)" }}>
                {t("app.onboarding.testBody")}
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
                  <p className="text-[13.5px] font-semibold">
                    {t("app.onboarding.readyTitle")}
                  </p>
                  <p className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                    {readyBefore}
                    <span style={{ fontFamily: "var(--font-mono)" }}>{mailboxAddress}</span>
                    {readyAfter}
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
                      {t(item.label)}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/app/tickets"
                className="inline-flex items-center rounded-md px-5 text-sm font-semibold text-white"
                style={{ height: 38, background: "var(--acc)" }}
              >
                {t("app.onboarding.openInbox")}
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
