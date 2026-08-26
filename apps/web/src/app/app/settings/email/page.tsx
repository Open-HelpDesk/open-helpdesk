import { providedMailboxAddress } from "@openhelpdesk/config";
import { requireAgent } from "@/lib/session";
import {
  db,
  emailDeliveries,
  mailboxes,
  rejectedEmails,
  teams,
  ticketForms,
} from "@openhelpdesk/db";
import { asc, desc, eq } from "drizzle-orm";
import {
  PROVIDER_META,
  dnsRecordsFor,
  domainOf,
  getEmailSettings,
  resolveMailConfig,
} from "@openhelpdesk/mail";
import {
  Card,
  Field,
  GridHead,
  PageHeader,
  PageShell,
  SaveBar,
  StatusPill,
  TextInput,
} from "@/components/settings-page";
import { CopyButton, Drawer } from "@/components/settings-overlays";
import { MailboxForm } from "./mailbox-form";
import { ProviderForm } from "./provider-form";
import {
  deleteMailbox,
  saveEmailProvider,
  saveSending,
  sendEmailTest,
  testEmailConnection,
  verifyMailbox,
} from "./actions";
import { getT, type Translate } from "@/i18n/server";

const ADDRESS_GRID = "minmax(200px,1fr) 90px 110px 130px 110px 170px";
const DNS_GRID = "96px 76px 170px 1fr 130px";
const SEND_GRID = "minmax(190px,1fr) minmax(190px,1.4fr) 130px 100px 90px";
const REJECT_GRID = "minmax(200px,1fr) minmax(180px,1.2fr) 150px 110px";

/** Method of a receiving address (Provided / Forwarding / IMAP). */
function kindLabel(kind: string, t: Translate): string {
  switch (kind) {
    case "provided":
      return t("app.settings.email.kindProvided");
    case "forwarding":
      return t("app.settings.email.kindForwarding");
    case "imap":
      return t("app.settings.email.kindImap");
    default:
      return kind;
  }
}

/** Nature of an email in the delivery log. */
function deliveryKindLabel(kind: string, t: Translate): string {
  switch (kind) {
    case "ticket_reply":
      return t("app.settings.email.deliveryTicketReply");
    case "csat":
      return t("app.settings.email.deliveryCsat");
    case "magic_link":
      return t("app.settings.email.deliveryMagicLink");
    case "rule":
      return t("app.settings.email.deliveryRule");
    case "invitation":
      return t("app.settings.email.deliveryInvitation");
    case "test":
      return t("app.settings.email.deliveryTest");
    case "admin":
      return t("app.settings.email.deliveryAdmin");
    case "other":
      return t("app.settings.email.deliveryOther");
    default:
      return kind;
  }
}

const REJECT_TONES: Record<string, "wait" | "dang" | "closed"> = {
  loop: "wait",
  bounce: "closed",
  auto_reply: "wait",
  blocked_sender: "dang",
  empty: "closed",
  spam: "dang",
};

/** Rejection reason for an inbound email. */
function rejectLabel(reason: string, t: Translate): string {
  switch (reason) {
    case "loop":
      return t("app.settings.email.rejectLoop");
    case "bounce":
      return t("app.settings.email.rejectBounce");
    case "auto_reply":
      return t("app.settings.email.rejectAutoReply");
    case "blocked_sender":
      return t("app.settings.email.rejectBlockedSender");
    case "empty":
      return t("app.settings.email.rejectEmpty");
    case "spam":
      return t("app.settings.email.rejectSpam");
    default:
      return reason;
  }
}

/** Neutral chip for an address's method (Provided / Forwarding / IMAP). */
function KindChip({ kind, t }: { kind: string; t: Translate }) {
  return (
    <span
      className="inline-flex items-center rounded border px-1.5 font-medium"
      style={{
        height: 20,
        fontSize: 11,
        borderColor: "var(--line-2)",
        background: "var(--sunk)",
        color: "var(--ink-2)",
      }}
    >
      {kindLabel(kind, t)}
    </span>
  );
}

/** Status of a receiving address, in the design system pill format. */
function mailboxStatus(m: typeof mailboxes.$inferSelect, t: Translate) {
  if (m.kind === "provided")
    return <StatusPill tone="ok">{t("app.settings.email.statusVerified")}</StatusPill>;
  if (m.kind === "forwarding") {
    return m.verified ? (
      <StatusPill tone="ok">{t("app.settings.email.statusVerified")}</StatusPill>
    ) : (
      <span title={t("app.settings.email.forwardingPendingTitle")}>
        <StatusPill tone="wait">{t("app.settings.email.statusPending")}</StatusPill>
      </span>
    );
  }
  if (m.syncError) {
    return (
      <span title={m.syncError}>
        <StatusPill tone="dang">{t("app.settings.email.statusError")}</StatusPill>
      </span>
    );
  }
  return m.verified ? (
    <StatusPill tone="ok">{t("app.settings.email.statusConnected")}</StatusPill>
  ) : (
    <StatusPill tone="wait">{t("app.settings.email.statusToTest")}</StatusPill>
  );
}

const SMALL_BTN = {
  height: 26,
  fontSize: 12,
  borderColor: "var(--line)",
  background: "var(--panel)",
  color: "var(--ink)",
} as const;

/**
 * ST-03 — Email channel (1040 px), two tabs. Sending (default): workspace
 * provider, tests, DNS, delivery log. Reception: forwarding/IMAP addresses,
 * Brevo/Mailjet webhooks, rejected email log (30-day retention).
 */
export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { tab, saved } = await searchParams;
  const activeTab = tab === "reception" ? "reception" : "sending";

  const [boxes, teamRows, forms, settingsRow, resolved, deliveries, rejected] =
    await Promise.all([
      db
        .select()
        .from(mailboxes)
        .where(eq(mailboxes.tenantId, tenant.id))
        .orderBy(asc(mailboxes.createdAt)),
      db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(eq(teams.tenantId, tenant.id))
        .orderBy(asc(teams.name)),
      db
        .select({ id: ticketForms.id, name: ticketForms.name })
        .from(ticketForms)
        .where(eq(ticketForms.tenantId, tenant.id))
        .orderBy(asc(ticketForms.position)),
      getEmailSettings(tenant.id),
      resolveMailConfig(tenant.id),
      db
        .select()
        .from(emailDeliveries)
        .where(eq(emailDeliveries.tenantId, tenant.id))
        .orderBy(desc(emailDeliveries.createdAt))
        .limit(8),
      db
        .select()
        .from(rejectedEmails)
        .where(eq(rejectedEmails.tenantId, tenant.id))
        .orderBy(desc(rejectedEmails.createdAt))
        .limit(10),
    ]);

  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));
  const formNameById = new Map(forms.map((f) => [f.id, f.name]));
  const providedAddress =
    boxes.find((m) => m.kind === "provided")?.address ?? providedMailboxAddress(tenant.slug);
  const primary = boxes.find((m) => m.kind === "provided") ?? boxes[0];

  const sendingDomain = domainOf(settingsRow?.fromAddress ?? resolved.from);
  const dnsRecords = dnsRecordsFor({
    provider: resolved.provider,
    domain: sendingDomain,
    smtpHost: settingsRow?.smtpHost,
  });

  // Inbound webhooks: URL displayed with the secret masked, copied with the real one.
  const baseDomain = process.env.BASE_DOMAIN ?? "localhost:3000";
  const protocol = baseDomain.includes("localhost") ? "http" : "https";
  const ingressBase = `${protocol}://${tenant.slug}.${baseDomain}/api/ingress`;
  const ingressSecret = process.env.MAIL_INGRESS_SECRET ?? "dev-ingress-secret";
  const webhooks = [
    {
      name: "Brevo — Inbound parsing",
      hint: t("app.settings.email.webhookBrevoHint"),
      path: "brevo",
    },
    {
      name: "Mailjet — Parse API",
      hint: t("app.settings.email.webhookMailjetHint"),
      path: "mailjet",
    },
    {
      name: t("app.settings.email.webhookGenericName"),
      hint: t("app.settings.email.webhookGenericHint"),
      path: "email",
    },
  ];

  const tabs = [
    {
      label: t("app.settings.email.tabSending"),
      href: "/app/settings/email",
      active: activeTab === "sending",
    },
    {
      label: t("app.settings.email.tabReception"),
      href: "/app/settings/email?tab=reception",
      active: activeTab === "reception",
    },
  ];

  // Sending status banner — the color carries the diagnosis.
  const banner =
    resolved.source === "tenant"
      ? { bg: "var(--ok-t)", color: "var(--ok)" }
      : resolved.source === "instance"
        ? { bg: "var(--open-t)", color: "var(--open)" }
        : { bg: "var(--wait-t)", color: "var(--wait)" };

  // Two sentences wrap a value in JSX: we split around the address.
  const [bannerBefore, bannerAfter] = t.parts(
    resolved.source === "tenant"
      ? "app.settings.email.bannerTenant"
      : "app.settings.email.bannerInstance",
    "from",
    { provider: PROVIDER_META[resolved.provider].label },
  );
  const [dnsBefore, dnsAfter] = t.parts("app.settings.email.dnsIntro", "domain");

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        title={t("app.settings.email.title")}
        subtitle={t("app.settings.email.subtitle")}
        tabs={tabs}
      />

      {activeTab === "reception" ? (
        <>
          {/* Receiving addresses */}
          <Card
            title={t("app.settings.email.addressesTitle")}
            style={{ padding: 0 }}
            action={
              <Drawer
                title={t("app.settings.email.addAddress")}
                trigger={<>{t("app.settings.email.addAddressCta")}</>}
                triggerClassName="rounded-md px-3 font-semibold text-white"
                triggerStyle={{ height: 28, fontSize: 12.5, background: "var(--acc)" }}
              >
                <MailboxForm
                  forwardTarget={providedAddress}
                  teams={teamRows}
                  forms={forms}
                  secretHint={null}
                />
              </Drawer>
            }
          >
            <div className="overflow-x-auto">
              <div style={{ minWidth: 880 }}>
                <GridHead
                  template={ADDRESS_GRID}
                  columns={[
                    t("app.settings.email.address"),
                    t("app.settings.email.method"),
                    t("app.settings.email.status"),
                    t("app.settings.email.form"),
                    t("app.settings.email.team"),
                    "",
                  ]}
                />
                {boxes.length === 0 && (
                  <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                    {t("app.settings.email.addressesEmpty", { address: providedAddress })}
                  </p>
                )}
                {boxes.map((m) => (
                  <div
                    key={m.id}
                    className="grid items-center gap-3 border-t"
                    style={{
                      gridTemplateColumns: ADDRESS_GRID,
                      padding: "10px 14px",
                      borderColor: "var(--line-2)",
                    }}
                  >
                    <span className="min-w-0">
                      <span
                        className="block truncate font-mono"
                        style={{ fontSize: 13, color: "var(--ink)" }}
                      >
                        {m.address}
                      </span>
                      {m.kind === "imap" && m.lastSyncAt && (
                        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                          {t("app.settings.email.lastSync", {
                            time: t.fmt.relative(m.lastSyncAt),
                          })}
                        </span>
                      )}
                    </span>
                    <span>
                      <KindChip kind={m.kind} t={t} />
                    </span>
                    <span>{mailboxStatus(m, t)}</span>
                    <span className="truncate" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      {m.formId
                        ? (formNameById.get(m.formId) ?? "—")
                        : t("app.settings.email.formDefault")}
                    </span>
                    <span className="truncate" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      {m.defaultTeamId ? (teamNameById.get(m.defaultTeamId) ?? "—") : "—"}
                    </span>
                    <span className="flex items-center justify-end gap-1.5">
                      {m.kind === "imap" && (
                        <form action={verifyMailbox}>
                          <input type="hidden" name="mailboxId" value={m.id} />
                          <button className="rounded-md border px-2 font-medium" style={SMALL_BTN}>
                            {t("app.settings.email.test")}
                          </button>
                        </form>
                      )}
                      {m.kind !== "provided" && (
                        <>
                          <Drawer
                            title={t("app.settings.email.editAddress", { address: m.address })}
                            trigger={<>{t("app.settings.email.edit")}</>}
                            triggerClassName="rounded-md border px-2 font-medium"
                            triggerStyle={SMALL_BTN}
                          >
                            <MailboxForm
                              mailbox={{
                                id: m.id,
                                address: m.address,
                                kind: m.kind as "forwarding" | "imap",
                                formId: m.formId,
                                defaultTeamId: m.defaultTeamId,
                                imapHost: m.imapHost,
                                imapPort: m.imapPort,
                                imapSecure: m.imapSecure,
                                imapUser: m.imapUser,
                              }}
                              forwardTarget={providedAddress}
                              teams={teamRows}
                              forms={forms}
                              secretHint={m.encryptedSecrets ? "••••••••" : null}
                            />
                          </Drawer>
                          <form action={deleteMailbox}>
                            <input type="hidden" name="mailboxId" value={m.id} />
                            <button
                              title={t("app.settings.email.deleteAddress")}
                              className="rounded-md border px-2 font-medium"
                              style={{ ...SMALL_BTN, borderColor: "var(--dang)", color: "var(--dang)" }}
                            >
                              ✕
                            </button>
                          </form>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Provider inbound webhooks */}
          <Card title={t("app.settings.email.providerReceiveTitle")}>
            <p className="mb-1" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              {t("app.settings.email.providerReceiveIntro")}
            </p>
            <div className="flex flex-col">
              {webhooks.map((w, index) => (
                <div
                  key={w.path}
                  className="grid items-center gap-3 border-t"
                  style={{
                    gridTemplateColumns: "minmax(230px,1fr) minmax(240px,1.5fr) auto",
                    paddingBlock: 10,
                    borderColor: index === 0 ? "transparent" : "var(--line-2)",
                  }}
                >
                  <div className="min-w-0">
                    <p className="font-medium" style={{ fontSize: 13, color: "var(--ink)" }}>
                      {w.name}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--ink-3)", textWrap: "pretty" }}>
                      {w.hint}
                    </p>
                  </div>
                  <code
                    className="min-w-0 truncate rounded-md border px-2.5 py-1.5 font-mono"
                    style={{
                      fontSize: 12,
                      borderColor: "var(--line)",
                      background: "var(--sunk)",
                      color: "var(--ink-2)",
                    }}
                  >
                    {ingressBase}/{w.path}?secret=••••••••
                  </code>
                  <CopyButton
                    text={`${ingressBase}/${w.path}?secret=${ingressSecret}`}
                    label={t("app.settings.email.copyUrl")}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Rejected emails */}
          <Card title={t("app.settings.email.rejectedTitle")} style={{ padding: 0 }}>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 700 }}>
                <GridHead
                  template={REJECT_GRID}
                  columns={[
                    t("app.settings.email.sender"),
                    t("app.settings.email.subject"),
                    t("app.settings.email.reason"),
                    t("app.settings.email.date"),
                  ]}
                />
                {rejected.length === 0 && (
                  <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                    {t("app.settings.email.rejectedEmpty")}
                  </p>
                )}
                {rejected.map((r) => {
                  const tone = REJECT_TONES[r.reason] ?? ("closed" as const);
                  return (
                    <div
                      key={r.id}
                      className="grid items-center gap-3 border-t"
                      style={{
                        gridTemplateColumns: REJECT_GRID,
                        padding: "9px 14px",
                        borderColor: "var(--line-2)",
                      }}
                    >
                      <span
                        className="truncate font-mono"
                        style={{ fontSize: 12, color: "var(--ink-2)" }}
                      >
                        {r.fromAddress}
                      </span>
                      <span className="truncate" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                        {r.subject ?? t("app.settings.email.noSubject")}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <StatusPill tone={tone}>{rejectLabel(r.reason, t)}</StatusPill>
                        {r.detail && (
                          <span className="truncate" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                            ({r.detail})
                          </span>
                        )}
                      </span>
                      <span
                        className="text-right tabular-nums"
                        style={{ fontSize: 12, color: "var(--ink-3)" }}
                      >
                        {t.fmt.relative(r.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {rejected.length > 0 && (
              <p
                className="border-t"
                style={{
                  padding: "9px 14px",
                  fontSize: 12,
                  color: "var(--ink-3)",
                  borderColor: "var(--line-2)",
                }}
              >
                {t("app.settings.email.rejectedRetention")}
              </p>
            )}
          </Card>
        </>
      ) : (
        <>
          {/* Sending provider */}
          <Card
            title={t("app.settings.email.providerTitle")}
            action={
              settingsRow?.testStatus === "ok" ? (
                <StatusPill tone="ok">{t("app.settings.email.testOk")}</StatusPill>
              ) : settingsRow?.testStatus === "failed" ? (
                <StatusPill tone="dang">{t("app.settings.email.testFailed")}</StatusPill>
              ) : resolved.provider === "console" ? (
                <StatusPill tone="wait">{t("app.settings.email.testNone")}</StatusPill>
              ) : (
                <StatusPill tone="closed">{t("app.settings.email.testUntested")}</StatusPill>
              )
            }
          >
            <div className="flex flex-col gap-4">
              <p
                className="flex items-baseline gap-2"
                style={{
                  fontSize: 12.5,
                  color: banner.color,
                  background: banner.bg,
                  borderRadius: 8,
                  padding: "10px 13px",
                }}
              >
                <span aria-hidden style={{ fontSize: 9 }}>
                  ●
                </span>
                <span>
                  {resolved.source === "default" ? (
                    t("app.settings.email.bannerDefault")
                  ) : (
                    <>
                      {bannerBefore}
                      <span className="font-mono">{resolved.from}</span>
                      {bannerAfter}
                    </>
                  )}
                </span>
              </p>

              <form action={saveEmailProvider} className="flex flex-col gap-4">
                <ProviderForm
                  secretHint={settingsRow?.secretHint ?? null}
                  initial={{
                    provider: settingsRow?.provider ?? "console",
                    fromName: settingsRow?.fromName ?? primary?.senderName ?? "",
                    fromAddress: settingsRow?.fromAddress ?? "",
                    replyTo: settingsRow?.replyTo ?? "",
                    smtpHost: settingsRow?.smtpHost ?? "",
                    smtpPort: settingsRow?.smtpPort ?? 587,
                    smtpSecure: settingsRow?.smtpSecure ?? false,
                    smtpUser: settingsRow?.smtpUser ?? "",
                  }}
                />
                <SaveBar saved={saved === "1"} cancelHref="/app/settings/email" surface="panel" />
              </form>

              <div
                className="flex flex-wrap items-center gap-2 border-t pt-3"
                style={{ borderColor: "var(--line-2)" }}
              >
                <form action={testEmailConnection}>
                  <button
                    className="ohd-hover-edge-ink rounded-md border px-3 font-medium"
                    style={{
                      height: 32,
                      fontSize: 12.5,
                      borderColor: "var(--line)",
                      background: "var(--panel)",
                      color: "var(--ink)",
                    }}
                  >
                    {t("app.settings.email.testConnection")}
                  </button>
                </form>
                <form action={sendEmailTest}>
                  <button
                    className="rounded-md px-3.5 font-semibold text-white"
                    style={{ height: 32, fontSize: 12.5, background: "var(--acc)" }}
                  >
                    {t("app.settings.email.sendTest")}
                  </button>
                </form>
                {settingsRow?.lastTestedAt && (
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {t("app.settings.email.lastTest", {
                      time: t.fmt.relative(settingsRow.lastTestedAt),
                    })}
                  </span>
                )}
              </div>

              {settingsRow?.testStatus !== "untested" && settingsRow?.lastTestedAt && (
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 8,
                    padding: "11px 13px",
                    background:
                      settingsRow.testStatus === "ok" ? "var(--ok-t)" : "var(--dang-t)",
                    color: settingsRow.testStatus === "ok" ? "var(--ok)" : "var(--dang)",
                  }}
                >
                  {settingsRow.testStatus === "ok"
                    ? t("app.settings.email.testOkDetail")
                    : settingsRow.testError}
                </p>
              )}
            </div>
          </Card>

          {/* Signature */}
          <form action={saveSending} className="flex flex-col" style={{ gap: 22 }}>
            <Card title={t("app.settings.email.signatureTitle")}>
              <div className="flex flex-col gap-4">
                <Field
                  label={t("app.settings.email.senderNameLabel")}
                  hint={providedAddress}
                >
                  <TextInput
                    name="senderName"
                    defaultValue={primary?.senderName ?? ""}
                    placeholder={t("app.settings.email.senderNamePlaceholder", {
                      name: tenant.name,
                    })}
                  />
                </Field>
                <Field label={t("app.settings.email.signatureLabel")}>
                  <textarea
                    name="signatureHtml"
                    rows={3}
                    defaultValue={primary?.signatureHtml ?? ""}
                    placeholder={t("app.settings.email.signaturePlaceholder", {
                      name: tenant.name,
                    })}
                    className="rounded-md border px-2.5 py-[7px] text-[13px]"
                    style={{
                      borderColor: "var(--line)",
                      background: "var(--bg)",
                      color: "var(--ink)",
                    }}
                  />
                </Field>
              </div>
            </Card>
            <SaveBar saved={saved === "2"} cancelHref="/app/settings/email" />
          </form>

          {/* DNS */}
          <Card title={t("app.settings.email.dnsTitle")}>
            {!sendingDomain ? (
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {t("app.settings.email.dnsNoDomain")}
              </p>
            ) : (
              <>
                <p className="mb-3" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {dnsBefore}
                  <span className="font-mono">{sendingDomain}</span>
                  {dnsAfter}
                </p>
                <div className="overflow-x-auto">
                  <div style={{ minWidth: 720 }}>
                    <GridHead
                      template={DNS_GRID}
                      columns={[
                        t("app.settings.email.dnsRecord"),
                        t("app.settings.email.dnsType"),
                        t("app.settings.email.dnsHost"),
                        t("app.settings.email.dnsValue"),
                        "",
                      ]}
                    />
                    {dnsRecords.map((r) => (
                      <div
                        key={r.label}
                        className="grid items-center gap-3 border-t"
                        style={{
                          gridTemplateColumns: DNS_GRID,
                          padding: "9px 14px",
                          borderColor: "var(--line-2)",
                        }}
                      >
                        <span
                          className="font-medium"
                          style={{ fontSize: 12.5, color: "var(--ink)" }}
                        >
                          {r.label}
                        </span>
                        <span className="font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                          {r.type}
                        </span>
                        <span
                          className="truncate font-mono"
                          style={{ fontSize: 12, color: "var(--ink-2)" }}
                        >
                          {r.host}
                        </span>
                        <span
                          className="truncate font-mono"
                          style={{ fontSize: 12, color: "var(--ink-2)" }}
                        >
                          {r.value || "—"}
                        </span>
                        <span className="text-right">
                          {r.fromProvider ? (
                            <StatusPill tone="wait">
                              {t("app.settings.email.dnsAtProvider")}
                            </StatusPill>
                          ) : (
                            <StatusPill tone="closed">{t("app.settings.email.dnsToPublish")}</StatusPill>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <ul
                  className="mt-3 flex flex-col gap-1 border-t pt-3"
                  style={{ borderColor: "var(--line-2)" }}
                >
                  {dnsRecords
                    .filter((r) => r.hint)
                    .map((r) => (
                      <li key={r.label} style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        <strong>{r.label}</strong> — {r.hint}
                      </li>
                    ))}
                </ul>
              </>
            )}
          </Card>

          {/* Log */}
          <Card title={t("app.settings.email.deliveriesTitle")}>
            {deliveries.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {t("app.settings.email.deliveriesEmpty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: 720 }}>
                  <GridHead
                    template={SEND_GRID}
                    columns={[
                      t("app.settings.email.recipient"),
                      t("app.settings.email.subject"),
                      t("app.settings.email.deliveryKind"),
                      t("app.settings.email.status"),
                      t("app.settings.email.date"),
                    ]}
                  />
                  {deliveries.map((d) => (
                    <div
                      key={d.id}
                      className="grid items-center gap-3 border-t"
                      style={{
                        gridTemplateColumns: SEND_GRID,
                        padding: "9px 14px",
                        borderColor: "var(--line-2)",
                      }}
                    >
                      <span
                        className="truncate font-mono"
                        style={{ fontSize: 12, color: "var(--ink-2)" }}
                      >
                        {d.toAddress}
                      </span>
                      <span className="truncate" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                        {d.subject}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        {deliveryKindLabel(d.kind, t)}
                      </span>
                      <span title={d.error ?? undefined}>
                        {d.status === "sent" ? (
                          <StatusPill tone="ok">{t("app.settings.email.deliverySent")}</StatusPill>
                        ) : d.status === "failed" ? (
                          <StatusPill tone="dang">{t("app.settings.email.deliveryFailed")}</StatusPill>
                        ) : (
                          <StatusPill tone="wait">{t("app.settings.email.deliveryQueued")}</StatusPill>
                        )}
                      </span>
                      <span
                        className="text-right tabular-nums"
                        style={{ fontSize: 12, color: "var(--ink-3)" }}
                      >
                        {t.fmt.relative(d.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {deliveries.some((d) => d.status === "failed") && (
              <p className="mt-3" style={{ fontSize: 12, color: "var(--dang)" }}>
                {t("app.settings.email.deliveriesRetryNote")}
              </p>
            )}
          </Card>
        </>
      )}
    </PageShell>
  );
}
