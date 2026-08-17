import { requireAgent } from "@/lib/session";
import { db, emailDeliveries, mailboxes, teams, ticketForms } from "@openhelpdesk/db";
import { asc, desc, eq } from "drizzle-orm";
import {
  PROVIDER_META,
  dnsRecordsFor,
  domainOf,
  getEmailSettings,
  resolveMailConfig,
} from "@openhelpdesk/mail";
import { relativeFr } from "@/lib/format";
import { ProviderForm } from "./provider-form";
import {
  Card,
  Field,
  GridHead,
  PageHeader,
  PageShell,
  SaveBar,
  Select,
  StatusPill,
  TextInput,
} from "@/components/settings-page";
import { Drawer } from "@/components/settings-overlays";
import {
  addMailbox,
  deleteMailbox,
  recheckDns,
  saveEmailProvider,
  saveSending,
  sendEmailTest,
  testEmailConnection,
} from "./actions";

const ADDRESS_GRID = "minmax(240px,1.4fr) 130px 140px 160px 140px";
const DNS_GRID = "96px 76px 150px 1fr 110px";
const REJECT_GRID = "minmax(220px,1fr) minmax(200px,1.2fr) 170px 110px";
const SEND_GRID = "minmax(200px,1fr) minmax(200px,1.4fr) 130px 110px 100px";

const KIND_EMAIL_LABELS: Record<string, string> = {
  ticket_reply: "Réponse ticket",
  csat: "Enquête CSAT",
  magic_link: "Lien de connexion",
  rule: "Automatisation",
  invitation: "Invitation",
  test: "Test",
  other: "Autre",
};

const KIND_LABELS: Record<string, string> = {
  provided: "Fournie",
  forwarding: "Transfert",
  imap: "IMAP",
};

/**
 * ST-03 — Canal email (1040 px) : adresses de réception réelles, domaine d'envoi
 * (tableau DNS informatif), envoi (expéditeur + signature sur la mailbox principale),
 * journal des emails rejetés (état vide honnête).
 */
export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { saved } = await searchParams;

  const [boxes, teamRows, forms] = await Promise.all([
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
  ]);

  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));
  const providedAddress =
    boxes.find((m) => m.kind === "provided")?.address ??
    `support@${tenant.slug}.open-helpdesk.com`;
  const principal = boxes.find((m) => m.kind === "provided") ?? boxes[0];

  // Configuration d'envoi du workspace + repli d'instance effectivement utilisé.
  const [settingsRow, resolved, deliveries] = await Promise.all([
    getEmailSettings(tenant.id),
    resolveMailConfig(tenant.id),
    db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.tenantId, tenant.id))
      .orderBy(desc(emailDeliveries.createdAt))
      .limit(8),
  ]);

  const sendingDomain = domainOf(settingsRow?.fromAddress ?? resolved.from);
  const dnsRecords = dnsRecordsFor({
    provider: resolved.provider,
    domain: sendingDomain,
    smtpHost: settingsRow?.smtpHost,
  });

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        code="ST-03"
        title="Canal email"
        subtitle="Adresses de réception, délivrabilité et journal des emails rejetés."
        actions={
          <Drawer
            title="Ajouter une adresse"
            trigger={<>Ajouter une adresse</>}
            triggerClassName="rounded-md px-3.5 font-semibold text-white"
            triggerStyle={{ height: 32, fontSize: 13, background: "var(--acc)" }}
          >
            <form action={addMailbox} className="flex h-full flex-col gap-4">
              <Field label="Adresse">
                <TextInput
                  name="address"
                  type="email"
                  required
                  placeholder="support@votre-domaine.fr"
                />
              </Field>
              <Field label="Méthode">
                <Select name="kind" defaultValue="forwarding">
                  <option value="forwarding">Transfert vers l'adresse fournie</option>
                  <option value="imap">Connexion IMAP</option>
                </Select>
              </Field>
              <Field
                label="Adresse de transfert"
                hint="Configurez cette redirection chez votre fournisseur, puis envoyez un email de test."
              >
                <TextInput readOnly value={providedAddress} className="font-mono" />
              </Field>
              <Field label="Formulaire cible">
                <Select name="formId" defaultValue="">
                  <option value="">Formulaire par défaut</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Équipe par défaut">
                <Select name="defaultTeamId" defaultValue="">
                  <option value="">Aucune</option>
                  {teamRows.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="mt-auto flex justify-end border-t pt-3" style={{ borderColor: "var(--line)" }}>
                <button
                  type="submit"
                  className="rounded-md px-3.5 font-semibold text-white"
                  style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
                >
                  Ajouter
                </button>
              </div>
            </form>
          </Drawer>
        }
      />

      {saved === "1" && <p style={{ fontSize: 12.5, color: "var(--ok)" }}>✓ Enregistré</p>}

      {/* Adresses */}
      <div
        className="overflow-x-auto rounded-[10px] border"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div style={{ minWidth: 840 }}>
          <GridHead
            template={ADDRESS_GRID}
            columns={["Adresse", "Type", "Vérification", "Formulaire", "Équipe"]}
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
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono" style={{ fontSize: 13, color: "var(--ink)" }}>
                  {m.address}
                </span>
                {m.kind !== "provided" && (
                  <form action={deleteMailbox} className="inline">
                    <input type="hidden" name="mailboxId" value={m.id} />
                    <button
                      title="Supprimer l'adresse"
                      style={{ fontSize: 12, color: "var(--ink-3)" }}
                    >
                      ✕
                    </button>
                  </form>
                )}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{KIND_LABELS[m.kind]}</span>
              <span>
                {m.verified ? (
                  <StatusPill tone="ok">Vérifiée</StatusPill>
                ) : (
                  <StatusPill tone="wait">En attente</StatusPill>
                )}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>—</span>
              <span
                style={{
                  fontSize: 12.5,
                  color: m.defaultTeamId ? "var(--ink)" : "var(--ink-3)",
                }}
              >
                {m.defaultTeamId ? (teamNameById.get(m.defaultTeamId) ?? "—") : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Envoi des emails — fournisseur du workspace */}
      <Card
        title="Envoi des emails"
        action={
          <span className="flex items-center gap-2">
            {settingsRow?.testStatus === "ok" ? (
              <StatusPill tone="ok">Testé avec succès</StatusPill>
            ) : settingsRow?.testStatus === "failed" ? (
              <StatusPill tone="dang">Test en échec</StatusPill>
            ) : resolved.provider === "console" ? (
              <StatusPill tone="wait">Aucun envoi</StatusPill>
            ) : (
              <StatusPill tone="closed">Non testé</StatusPill>
            )}
          </span>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Ce qui est réellement utilisé aujourd'hui */}
          <p
            style={{
              fontSize: 12.5,
              color: resolved.provider === "console" ? "var(--wait)" : "var(--ink-2)",
              background: resolved.provider === "console" ? "var(--wait-t)" : "var(--sunk)",
              borderRadius: 8,
              padding: "10px 13px",
            }}
          >
            {resolved.source === "tenant" && (
              <>
                Ce workspace envoie via <strong>{PROVIDER_META[resolved.provider].label}</strong>{" "}
                depuis <span className="font-mono">{resolved.from}</span>.
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
            <SaveBar saved={saved === "1"} cancelHref="/app/settings/email" />
          </form>

          {/* Tests */}
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
                background: settingsRow.testStatus === "ok" ? "var(--ok-t)" : "var(--dang-t)",
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

      {/* Signature appliquée aux réponses */}
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
                style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
              />
            </Field>
          </div>
        </Card>
        <SaveBar saved={saved === "2"} cancelHref="/app/settings/email" />
      </form>

      {/* Domaine d'envoi — enregistrements générés pour le domaine configuré */}
      <Card title="Authentifier votre domaine d'envoi">
        {!sendingDomain ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
            Renseignez une adresse d'expédition ci-dessus pour obtenir les enregistrements
            DNS à publier.
          </p>
        ) : (
          <>
            <p className="mb-3" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              À publier sur la zone DNS de <span className="font-mono">{sendingDomain}</span> pour
              que vos emails ne partent pas en indésirable.
            </p>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 720 }}>
                <GridHead template={DNS_GRID} columns={["Enreg.", "Type", "Hôte", "Valeur", ""]} />
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
                    <span className="font-medium" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                      {r.label}
                    </span>
                    <span className="font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      {r.type}
                    </span>
                    <span className="truncate font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      {r.host}
                    </span>
                    <span className="truncate font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
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
            <ul className="mt-3 flex flex-col gap-1 border-t pt-3" style={{ borderColor: "var(--line-2)" }}>
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

      {/* Journal d'envoi */}
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
                  <span className="truncate font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
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
            Les envois en échec sont réessayés automatiquement par le worker (5 tentatives,
            délai croissant). Le motif exact s'affiche au survol du statut.
          </p>
        )}
      </Card>

      {/* Emails rejetés */}
      <Card title="Emails rejetés">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 700 }}>
            <GridHead
              template={REJECT_GRID}
              columns={["Expéditeur", "Sujet", "Motif", "Date"]}
            />
            <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
              Aucun email rejeté sur les 30 derniers jours.
            </p>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
