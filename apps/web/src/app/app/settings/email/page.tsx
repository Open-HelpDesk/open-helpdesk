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
import { relativeFr } from "@/lib/format";
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

const ADDRESS_GRID = "minmax(200px,1fr) 90px 110px 130px 110px 170px";
const DNS_GRID = "96px 76px 170px 1fr 130px";
const SEND_GRID = "minmax(190px,1fr) minmax(190px,1.4fr) 130px 100px 90px";
const REJECT_GRID = "minmax(200px,1fr) minmax(180px,1.2fr) 150px 110px";

const KIND_LABELS: Record<string, string> = {
  provided: "Fournie",
  forwarding: "Transfert",
  imap: "IMAP",
};

const KIND_EMAIL_LABELS: Record<string, string> = {
  ticket_reply: "Réponse ticket",
  csat: "Enquête CSAT",
  magic_link: "Lien de connexion",
  rule: "Automatisation",
  invitation: "Invitation",
  test: "Test",
  other: "Autre",
};

const REJECT_REASONS: Record<string, { label: string; tone: "wait" | "dang" | "closed" }> = {
  loop: { label: "Boucle détectée", tone: "wait" },
  bounce: { label: "Bounce automatique", tone: "closed" },
  auto_reply: { label: "Réponse automatique", tone: "wait" },
  blocked_sender: { label: "Expéditeur bloqué", tone: "dang" },
  empty: { label: "Message vide", tone: "closed" },
  spam: { label: "Spam", tone: "dang" },
};

/** Chip neutre pour la méthode d'une adresse (Fournie / Transfert / IMAP). */
function KindChip({ kind }: { kind: string }) {
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
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}

/** Statut d'une adresse de réception, au format pilule du design system. */
function mailboxStatus(m: typeof mailboxes.$inferSelect) {
  if (m.kind === "provided") return <StatusPill tone="ok">Vérifiée</StatusPill>;
  if (m.kind === "forwarding") {
    return m.verified ? (
      <StatusPill tone="ok">Vérifiée</StatusPill>
    ) : (
      <span title="Passe en « Vérifiée » au premier email reçu.">
        <StatusPill tone="wait">En attente</StatusPill>
      </span>
    );
  }
  if (m.syncError) {
    return (
      <span title={m.syncError}>
        <StatusPill tone="dang">Erreur</StatusPill>
      </span>
    );
  }
  return m.verified ? (
    <StatusPill tone="ok">Connectée</StatusPill>
  ) : (
    <StatusPill tone="wait">À tester</StatusPill>
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
 * ST-03 — Canal email (1040 px), deux onglets. Envoi (par défaut) : fournisseur du
 * workspace, tests, DNS, journal des envois. Réception : adresses transfert/IMAP,
 * webhooks Brevo/Mailjet, journal des emails rejetés (rétention 30 j).
 */
export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { tab, saved } = await searchParams;
  const activeTab = tab === "reception" ? "reception" : "envoi";

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
    boxes.find((m) => m.kind === "provided")?.address ??
    `support@${tenant.slug}.open-helpdesk.com`;
  const principal = boxes.find((m) => m.kind === "provided") ?? boxes[0];

  const sendingDomain = domainOf(settingsRow?.fromAddress ?? resolved.from);
  const dnsRecords = dnsRecordsFor({
    provider: resolved.provider,
    domain: sendingDomain,
    smtpHost: settingsRow?.smtpHost,
  });

  // Webhooks de réception : URL affichée avec le secret masqué, copiée avec le vrai.
  const baseDomain = process.env.BASE_DOMAIN ?? "localhost:3000";
  const protocol = baseDomain.includes("localhost") ? "http" : "https";
  const ingressBase = `${protocol}://${tenant.slug}.${baseDomain}/api/ingress`;
  const ingressSecret = process.env.MAIL_INGRESS_SECRET ?? "dev-ingress-secret";
  const webhooks = [
    {
      name: "Brevo — Inbound parsing",
      hint: "Brevo → Transactionnel → Paramètres → Inbound parsing : collez cette URL.",
      path: "brevo",
    },
    {
      name: "Mailjet — Parse API",
      hint: "Mailjet → Email API → Parse API : créez une route vers cette URL.",
      path: "mailjet",
    },
    {
      name: "Webhook générique (JSON normalisé)",
      hint: "Pour vos intégrations : POST avec l'en-tête x-ingress-secret.",
      path: "email",
    },
  ];

  const tabs = [
    { label: "Envoi", href: "/app/settings/email", active: activeTab === "envoi" },
    {
      label: "Réception",
      href: "/app/settings/email?tab=reception",
      active: activeTab === "reception",
    },
  ];

  // Bandeau d'état de l'envoi — la couleur porte le diagnostic.
  const banner =
    resolved.source === "tenant"
      ? { bg: "var(--ok-t)", color: "var(--ok)" }
      : resolved.source === "instance"
        ? { bg: "var(--open-t)", color: "var(--open)" }
        : { bg: "var(--wait-t)", color: "var(--wait)" };

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        title="Canal email"
        subtitle="Fournisseur d'envoi, adresses de réception, délivrabilité et journaux."
        tabs={tabs}
      />

      {activeTab === "reception" ? (
        <>
          {/* Adresses de réception */}
          <Card
            title="Adresses de réception"
            style={{ padding: 0 }}
            action={
              <Drawer
                title="Ajouter une adresse"
                trigger={<>+ Ajouter une adresse</>}
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
                  columns={["Adresse", "Méthode", "Statut", "Formulaire", "Équipe", ""]}
                />
                {boxes.length === 0 && (
                  <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                    Aucune adresse. L'adresse fournie {providedAddress} sera créée au premier envoi.
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
                          relevée {relativeFr(m.lastSyncAt)}
                        </span>
                      )}
                    </span>
                    <span>
                      <KindChip kind={m.kind} />
                    </span>
                    <span>{mailboxStatus(m)}</span>
                    <span className="truncate" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      {m.formId ? (formNameById.get(m.formId) ?? "—") : "Par défaut"}
                    </span>
                    <span className="truncate" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      {m.defaultTeamId ? (teamNameById.get(m.defaultTeamId) ?? "—") : "—"}
                    </span>
                    <span className="flex items-center justify-end gap-1.5">
                      {m.kind === "imap" && (
                        <form action={verifyMailbox}>
                          <input type="hidden" name="mailboxId" value={m.id} />
                          <button className="rounded-md border px-2 font-medium" style={SMALL_BTN}>
                            Tester
                          </button>
                        </form>
                      )}
                      {m.kind !== "provided" && (
                        <>
                          <Drawer
                            title={`Modifier ${m.address}`}
                            trigger={<>Modifier</>}
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
                              title="Supprimer l'adresse"
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

          {/* Webhooks de réception fournisseurs */}
          <Card title="Recevoir via un fournisseur">
            <p className="mb-1" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              Si votre domaine est géré par Brevo ou Mailjet, leur webhook de réception
              transforme chaque email entrant en ticket — sans transfert ni IMAP.
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
                    label="Copier l'URL"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Emails rejetés */}
          <Card title="Emails rejetés" style={{ padding: 0 }}>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 700 }}>
                <GridHead
                  template={REJECT_GRID}
                  columns={["Expéditeur", "Sujet", "Motif", "Date"]}
                />
                {rejected.length === 0 && (
                  <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                    Aucun email rejeté sur les 30 derniers jours.
                  </p>
                )}
                {rejected.map((r) => {
                  const reason = REJECT_REASONS[r.reason] ?? {
                    label: r.reason,
                    tone: "closed" as const,
                  };
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
                        {r.subject ?? "(sans objet)"}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <StatusPill tone={reason.tone}>{reason.label}</StatusPill>
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
                        {relativeFr(r.createdAt)}
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
                Journal conservé 30 jours, puis purgé automatiquement.
              </p>
            )}
          </Card>
        </>
      ) : (
        <>
          {/* Fournisseur d'envoi */}
          <Card
            title="Fournisseur d'envoi"
            action={
              settingsRow?.testStatus === "ok" ? (
                <StatusPill tone="ok">Testé avec succès</StatusPill>
              ) : settingsRow?.testStatus === "failed" ? (
                <StatusPill tone="dang">Test en échec</StatusPill>
              ) : resolved.provider === "console" ? (
                <StatusPill tone="wait">Aucun envoi</StatusPill>
              ) : (
                <StatusPill tone="closed">Non testé</StatusPill>
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
                  {resolved.source === "tenant" && (
                    <>
                      Ce workspace envoie via{" "}
                      <strong>{PROVIDER_META[resolved.provider].label}</strong> depuis{" "}
                      <span className="font-mono">{resolved.from}</span>.
                    </>
                  )}
                  {resolved.source === "instance" && (
                    <>
                      Aucun fournisseur propre à ce workspace : envoi via la configuration de
                      l'instance (<strong>{PROVIDER_META[resolved.provider].label}</strong>) depuis{" "}
                      <span className="font-mono">{resolved.from}</span>.
                    </>
                  )}
                  {resolved.source === "default" && (
                    <>
                      Aucun envoi réel : les emails sont écrits dans les journaux du serveur.
                      Choisissez un fournisseur ci-dessous pour que vos clients reçoivent
                      vraiment les réponses.
                    </>
                  )}
                </span>
              </p>

              <form action={saveEmailProvider} className="flex flex-col gap-4">
                <ProviderForm
                  secretHint={settingsRow?.secretHint ?? null}
                  initial={{
                    provider: settingsRow?.provider ?? "console",
                    fromName: settingsRow?.fromName ?? principal?.senderName ?? "",
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
                    className="rounded-md border px-3 font-medium"
                    style={{
                      height: 32,
                      fontSize: 12.5,
                      borderColor: "var(--line)",
                      background: "var(--panel)",
                      color: "var(--ink)",
                    }}
                  >
                    Tester la connexion
                  </button>
                </form>
                <form action={sendEmailTest}>
                  <button
                    className="rounded-md px-3.5 font-semibold text-white"
                    style={{ height: 32, fontSize: 12.5, background: "var(--acc)" }}
                  >
                    Envoyer un email de test
                  </button>
                </form>
                {settingsRow?.lastTestedAt && (
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    Dernier test {relativeFr(settingsRow.lastTestedAt)}
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
                    ? "Configuration valide — l'envoi fonctionne pour ce workspace."
                    : settingsRow.testError}
                </p>
              )}
            </div>
          </Card>

          {/* Signature */}
          <form action={saveSending} className="flex flex-col" style={{ gap: 22 }}>
            <Card title="Signature des réponses">
              <div className="flex flex-col gap-4">
                <Field label="Nom affiché sur l'adresse de réception" hint={providedAddress}>
                  <TextInput
                    name="senderName"
                    defaultValue={principal?.senderName ?? ""}
                    placeholder={`${tenant.name} Support`}
                  />
                </Field>
                <Field label="Signature globale">
                  <textarea
                    name="signatureHtml"
                    rows={3}
                    defaultValue={principal?.signatureHtml ?? ""}
                    placeholder={`— L'équipe ${tenant.name} Support`}
                    className="rounded-md border px-2.5 py-1.5 text-sm"
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
          <Card title="Authentifier votre domaine d'envoi">
            {!sendingDomain ? (
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Renseignez une adresse d'expédition ci-dessus pour obtenir les
                enregistrements DNS à publier.
              </p>
            ) : (
              <>
                <p className="mb-3" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  À publier sur la zone DNS de{" "}
                  <span className="font-mono">{sendingDomain}</span> pour que vos emails ne
                  partent pas en indésirable.
                </p>
                <div className="overflow-x-auto">
                  <div style={{ minWidth: 720 }}>
                    <GridHead
                      template={DNS_GRID}
                      columns={["Enreg.", "Type", "Hôte", "Valeur", ""]}
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
                            <StatusPill tone="wait">Chez le fournisseur</StatusPill>
                          ) : (
                            <StatusPill tone="closed">À publier</StatusPill>
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

          {/* Journal */}
          <Card title="Derniers envois">
            {deliveries.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Aucun email envoyé depuis ce workspace pour l'instant.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: 720 }}>
                  <GridHead
                    template={SEND_GRID}
                    columns={["Destinataire", "Sujet", "Nature", "Statut", "Date"]}
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
                        {KIND_EMAIL_LABELS[d.kind] ?? d.kind}
                      </span>
                      <span title={d.error ?? undefined}>
                        {d.status === "sent" ? (
                          <StatusPill tone="ok">Envoyé</StatusPill>
                        ) : d.status === "failed" ? (
                          <StatusPill tone="dang">Échec</StatusPill>
                        ) : (
                          <StatusPill tone="wait">En file</StatusPill>
                        )}
                      </span>
                      <span
                        className="text-right tabular-nums"
                        style={{ fontSize: 12, color: "var(--ink-3)" }}
                      >
                        {relativeFr(d.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {deliveries.some((d) => d.status === "failed") && (
              <p className="mt-3" style={{ fontSize: 12, color: "var(--dang)" }}>
                Les envois en échec sont réessayés automatiquement par le worker (5
                tentatives, délai croissant). Le motif exact s'affiche au survol du statut.
              </p>
            )}
          </Card>
        </>
      )}
    </PageShell>
  );
}
