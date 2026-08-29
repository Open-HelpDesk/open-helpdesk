import { providedMailboxAddress } from "@openhelpdesk/config";
import Link from "next/link";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { businessHours, db, kbArticles, mailboxes, users } from "@openhelpdesk/db";
import { redirect } from "next/navigation";
import { isManager, requireAgent } from "@/lib/session";
import { requireTenant } from "@/lib/tenant";
import { firstName } from "@/i18n/format";
import { getT } from "@/i18n/server";
// This route lives outside /app, whose layout mounts the provider: a client
// component that calls useT() has to be given the dictionary here.
import { I18nProvider } from "@/i18n/client";
import { CopyButton } from "@/components/settings-overlays";

/**
 * AG-02 — Onboarding (V2): a checklist, not a wizard.
 *
 * The four-step wizard it replaces carried its own copies of screens the
 * administration already owns — identity (ST-01), receiving address (ST-03),
 * invitations (ST-02) — and its stepper let an owner walk past a step without
 * doing it. The checklist keeps only what the wizard actually added: telling the
 * owner what is still missing, and where to go and do it. Nothing is lost; the
 * forms live at their one real address.
 *
 * Each item reads the workspace, never the URL: a step is done because the state
 * says so. Of the four, "business hours" is the subtle one — provisioning seeds
 * every workspace with a "Main office 9–18" calendar in UTC while the workspace
 * itself has its own timezone, so SLA targets are counted in the wrong day
 * until someone looks. That mismatch IS the item, which is why the description
 * names both zones instead of repeating the mockup's generic sentence.
 */

const CARD: React.CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  padding: "17px 18px",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  boxShadow: "0 1px 2px rgba(13,28,23,.03)",
};

/** Item CTA — h34, radius 8, filled for the first thing left to do. */
function ctaStyle(primary: boolean): React.CSSProperties {
  return {
    height: 34,
    padding: "0 14px",
    borderRadius: 8,
    background: primary ? "var(--brand)" : "var(--panel)",
    color: primary ? "var(--on-brand)" : "var(--ink-2)",
    border: `1px solid ${primary ? "var(--brand)" : "var(--line)"}`,
    display: "flex",
    alignItems: "center",
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    flex: "none",
  };
}

export default async function OnboardingPage() {
  const t = await getT();
  // Ahead of requireAgent, for the same reason as the agent layout: a 404 for an
  // invented subdomain rather than a detour through /login (see requireTenant).
  await requireTenant();
  const { tenant, agent } = await requireAgent();
  // The initial setup screen is not a work screen, and every item on it links
  // into the administration: an agent has no business here.
  if (!isManager(agent.role)) redirect("/app/tickets");

  const [mailboxRows, colleagues, [publishedCount], calendars] = await Promise.all([
    db.select().from(mailboxes).where(eq(mailboxes.tenantId, tenant.id)),
    db
      .select({ name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), ne(users.id, agent.id)))
      .orderBy(asc(users.name)),
    db
      .select({ n: count() })
      .from(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.status, "published"))),
    db
      .select({ name: businessHours.name, timezone: businessHours.timezone })
      .from(businessHours)
      .where(eq(businessHours.tenantId, tenant.id))
      .orderBy(asc(businessHours.position), asc(businessHours.name)),
  ]);

  const verifiedMailbox = mailboxRows.find((m) => m.verified);
  const mailboxAddress =
    verifiedMailbox?.address ?? mailboxRows[0]?.address ?? providedMailboxAddress(tenant.slug);
  /*
   * The provided address is created verified at provisioning, so this item is
   * ticked before the owner has seen the screen — and a ticked item drops its
   * CTA. That is how the second option disappeared: a workspace can also
   * receive on its OWN address (support@theircompany.com forwarded here, or
   * IMAP), and nothing on the checklist ever said so.
   *
   * It stays done, because it genuinely is — mail arrives. But while the only
   * address is the one we handed out, the item carries the choice and a way to
   * act on it. Once the workspace receives on an address of its own, there is
   * nothing left to offer and the note goes away.
   */
  const onlyProvidedAddress =
    Boolean(verifiedMailbox) && mailboxRows.every((m) => m.kind === "provided");
  const mainCalendar = calendars[0];
  // No calendar at all is also "not set": there is nothing for a policy to point
  // at, and the SLA screen is where one gets created.
  const hoursAligned = mainCalendar ? mainCalendar.timezone === tenant.timezone : false;

  const items: {
    title: string;
    desc: string;
    done: boolean;
    cta: string;
    href: string;
    /**
     * Shown even when the item is done — an option still open, not a task.
     * Carries the gestures, not a summary: this is the majority path, and a
     * sentence saying "you can also forward your own address" leaves the reader
     * to guess the one thing they need, which is where to forward it TO.
     */
    howTo?: { title: string; lede: string; steps: string[]; copy: string };
  }[] = [
    {
      title: t("app.onboarding.emailTitle"),
      done: Boolean(verifiedMailbox),
      desc: verifiedMailbox
        ? t("app.onboarding.itemEmailDone", { address: mailboxAddress })
        : t("app.onboarding.itemEmailTodo"),
      howTo: onlyProvidedAddress
        ? {
            title: t("app.onboarding.ownAddressTitle"),
            lede: t("app.onboarding.ownAddressLede"),
            steps: [
              t("app.onboarding.ownAddressStep1"),
              t("app.onboarding.ownAddressStep2"),
              t("app.onboarding.ownAddressStep3"),
            ],
            copy: mailboxAddress,
          }
        : undefined,
      cta: t("app.onboarding.setUp"),
      href: "/app/settings/email",
    },
    {
      title: t("app.onboarding.stepTeamHint"),
      done: colleagues.length > 0,
      desc:
        colleagues.length > 0
          ? t("app.onboarding.itemTeamDone", {
              names: colleagues.slice(0, 3).map((c) => firstName(c.name)).join(", "),
            })
          : t("app.onboarding.itemTeamTodo"),
      cta: t("app.settings.workspace.inviteAction"),
      href: "/app/settings/team",
    },
    {
      title: t("app.onboarding.itemHours"),
      done: hoursAligned,
      desc: hoursAligned
        ? t("app.onboarding.itemHoursDone", { timezone: mainCalendar!.timezone })
        : mainCalendar
          ? t("app.onboarding.itemHoursTodo", {
              calendar: mainCalendar.name,
              calendarZone: mainCalendar.timezone,
              tenantZone: tenant.timezone,
            })
          : t("app.onboarding.itemHoursDone", { timezone: tenant.timezone }),
      cta: t("app.onboarding.setUp"),
      href: "/app/settings/sla",
    },
    {
      title: t("app.onboarding.itemArticle"),
      done: (publishedCount?.n ?? 0) > 0,
      desc:
        (publishedCount?.n ?? 0) > 0
          ? t("app.onboarding.itemArticleDone")
          : t("app.onboarding.itemArticleTodo"),
      cta: t("app.kb.newArticle"),
      href: "/app/kb",
    },
  ];

  const done = items.filter((i) => i.done).length;
  const firstTodo = items.findIndex((i) => !i.done);

  return (
    <div
      className="ohd min-h-screen overflow-auto"
      style={{
        padding: "44px 24px",
        background: "linear-gradient(180deg,var(--brand-t) 0%,var(--canvas) 45%)",
      }}
    >
      <div
        className="ohd-rise flex flex-col"
        style={{ width: 640, maxWidth: "100%", margin: "0 auto", gap: 18 }}
      >
        <div className="flex flex-col" style={{ gap: 8 }}>
          <h1
            style={{
              fontFamily: "var(--font-title)",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-.015em",
            }}
          >
            {t("app.onboarding.welcome", { name: firstName(agent.name) })}
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {t("app.onboarding.checklistBody")}
          </p>
        </div>

        <div className="flex items-center" style={{ gap: 14 }}>
          <div
            style={{
              flex: 1,
              height: 7,
              borderRadius: 4,
              background: "var(--sunk)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(done / items.length) * 100}%`,
                height: "100%",
                background: "var(--brand)",
                borderRadius: 4,
              }}
            />
          </div>
          <span
            className="tabular-nums"
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand)" }}
          >
            {done} / {items.length}
          </span>
        </div>

        <div className="flex flex-col" style={{ gap: 10 }}>
          {items.map((item, i) => (
            <div key={item.title} style={CARD}>
              <div
                className="grid place-items-center"
                style={{
                  width: 30,
                  height: 30,
                  flex: "none",
                  borderRadius: "50%",
                  fontSize: 13,
                  fontWeight: 700,
                  background: item.done ? "var(--brand-t)" : "var(--sunk)",
                  color: item.done ? "var(--brand)" : "var(--ink-3)",
                }}
                aria-hidden
              >
                {item.done ? "✓" : "○"}
              </div>
              <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 3 }}>
                <p
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: item.done ? "var(--ink-3)" : "var(--ink)",
                  }}
                >
                  {item.title}
                </p>
                <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>{item.desc}</p>

                {item.howTo && (
                  <div
                    className="flex flex-col"
                    style={{
                      marginTop: 6,
                      padding: "14px 16px",
                      gap: 10,
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      background: "var(--canvas)",
                    }}
                  >
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                      {item.howTo.title}
                    </p>
                    <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
                      {item.howTo.lede}
                    </p>

                    <ol className="flex flex-col" style={{ gap: 8, margin: 0, padding: 0 }}>
                      {item.howTo.steps.map((step, n) => (
                        <li key={step} className="flex" style={{ gap: 9, listStyle: "none" }}>
                          <span
                            className="grid flex-none place-items-center"
                            style={{
                              width: 19,
                              height: 19,
                              marginTop: 1,
                              borderRadius: "50%",
                              background: "var(--brand-t)",
                              color: "var(--brand)",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                            aria-hidden
                          >
                            {n + 1}
                          </span>
                          <span
                            className="min-w-0 flex-1"
                            style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}
                          >
                            {step}
                            {/* The address goes under the step that asks for it,
                                not in a corner: it is the single value the
                                reader has to carry to another product, and
                                retyping it is how a forward silently fails. */}
                            {n === 1 && (
                              <span
                                className="mt-2 flex items-center"
                                style={{
                                  gap: 8,
                                  padding: "7px 10px",
                                  borderRadius: 8,
                                  border: "1px solid var(--line)",
                                  background: "var(--panel)",
                                }}
                              >
                                <code
                                  className="min-w-0 flex-1 truncate"
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 12.5,
                                    color: "var(--ink)",
                                  }}
                                >
                                  {item.howTo!.copy}
                                </code>
                                <I18nProvider locale={t.locale} dict={t.dict}>
                                  <CopyButton text={item.howTo!.copy} />
                                </I18nProvider>
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>

                    <Link
                      href={item.href}
                      className="self-start hover:underline"
                      style={{ fontSize: 13, color: "var(--brand-2)", fontWeight: 500 }}
                    >
                      {item.cta} →
                    </Link>
                  </div>
                )}
              </div>
              {/* A done item keeps no CTA — the mockup drops it, and the screen
                  it led to is one click away in the administration anyway. An
                  item carrying a note is the exception: its link lives in the
                  sentence, where the option is explained. */}
              {!item.done && (
                <Link href={item.href} style={ctaStyle(i === firstTodo)}>
                  {item.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        <Link
          href="/app/tickets"
          className="ohd-hover-edge-ink self-center"
          style={{ fontSize: 13.5, color: "var(--ink-3)", padding: 8 }}
        >
          {t("app.onboarding.openInbox")} →
        </Link>
      </div>
    </div>
  );
}
