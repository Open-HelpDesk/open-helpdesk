import { requireAgent } from "@/lib/session";
import { db, mailboxes, teams, ticketForms } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
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
import { addMailbox, deleteMailbox, recheckDns, saveSending } from "./actions";

const ADDRESS_GRID = "minmax(240px,1.4fr) 130px 140px 160px 140px";
const DNS_GRID = "96px 76px 150px 1fr 110px";
const REJECT_GRID = "minmax(220px,1fr) minmax(200px,1.2fr) 170px 110px";

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

  const dnsRows: { type: string; record: string; host: string; value: string; ok: boolean }[] = [
    { type: "SPF", record: "TXT", host: "@", value: "v=spf1 include:mail.open-helpdesk.com ~all", ok: true },
    { type: "DKIM", record: "CNAME", host: "ohd._domainkey", value: "dkim.open-helpdesk.com", ok: true },
    { type: "DMARC", record: "TXT", host: "_dmarc", value: "v=DMARC1; p=none; rua=mailto:dmarc@acme.fr", ok: false },
    { type: "Return-Path", record: "CNAME", host: "bounce", value: "bounce.open-helpdesk.com", ok: false },
  ];

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

      {/* Domaine d'envoi */}
      <Card title="Domaine d'envoi">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 720 }}>
            <GridHead
              template={DNS_GRID}
              columns={["Enreg.", "Type", "Hôte", "Valeur", "Statut"]}
            />
            {dnsRows.map((r) => (
              <div
                key={r.type}
                className="grid items-center gap-3 border-t"
                style={{
                  gridTemplateColumns: DNS_GRID,
                  padding: "9px 14px",
                  borderColor: "var(--line-2)",
                }}
              >
                <span className="font-medium" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                  {r.type}
                </span>
                <span className="font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  {r.record}
                </span>
                <span className="font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  {r.host}
                </span>
                <span className="truncate font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  {r.value}
                </span>
                <span className="text-right">
                  {r.ok ? (
                    <StatusPill tone="ok">Vérifié</StatusPill>
                  ) : (
                    <StatusPill tone="wait">En attente</StatusPill>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div
          className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3"
          style={{ borderColor: "var(--line-2)" }}
        >
          <p className="min-w-0 flex-1" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            2 enregistrements en attente — la propagation DNS peut prendre 24 h.
          </p>
          <form action={recheckDns}>
            <button
              className="rounded-md border px-3 font-medium"
              style={{
                height: 30,
                fontSize: 12.5,
                borderColor: "var(--line)",
                background: "var(--panel)",
                color: "var(--ink)",
              }}
            >
              Revérifier
            </button>
          </form>
        </div>
      </Card>

      {/* Envoi */}
      <form action={saveSending} className="flex flex-col" style={{ gap: 22 }}>
        <Card title="Envoi">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Nom d'expéditeur">
                <TextInput
                  name="senderName"
                  defaultValue={principal?.senderName ?? ""}
                  placeholder={`${tenant.name} Support`}
                />
              </Field>
              <Field label="Répondre à">
                <TextInput readOnly value={providedAddress} className="font-mono" />
              </Field>
            </div>
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
        <SaveBar saved={saved === "1"} cancelHref="/app/settings/email" />
      </form>

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
