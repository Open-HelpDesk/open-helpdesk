import { requireAgent } from "@/lib/session";
import { contacts, db, kbArticles, tickets, users } from "@openhelpdesk/db";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import {
  Card,
  Field,
  PageHeader,
  PageShell,
  SaveBar,
  Select,
  TextInput,
} from "@/components/settings-page";
import { Modal, SlugConfirmField } from "@/components/settings-overlays";
import { AccentPicker } from "@/components/settings-accent";
import { deleteWorkspace, saveGeneral, transferOwnership } from "./actions";

/** Champ de saisie du design : min-height 36, padding 7/11, 13.5px. */
const CONTROL = { minHeight: 36, padding: "7px 11px", fontSize: 13.5 } as const;

/**
 * ST-01 — Général & branding (860 px) : identité du workspace, régionalisation,
 * zone de danger (transfert de propriété, suppression avec confirmation par slug).
 */
export default async function GeneralSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { tenant, agent: me } = await requireAgent();
  const { saved, error } = await searchParams;

  const [admins, [ticketCount], [contactCount], [articleCount]] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(eq(users.tenantId, tenant.id), eq(users.role, "admin"), eq(users.status, "active")),
      )
      .orderBy(asc(users.name)),
    db
      .select({ n: count() })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenant.id), isNull(tickets.deletedAt))),
    db.select({ n: count() }).from(contacts).where(eq(contacts.tenantId, tenant.id)),
    db.select({ n: count() }).from(kbArticles).where(eq(kbArticles.tenantId, tenant.id)),
  ]);

  const branding = (tenant.branding ?? {}) as {
    accentColor?: string;
    firstTicketNumber?: number;
  };
  const nTickets = ticketCount?.n ?? 0;
  const nContacts = contactCount?.n ?? 0;
  const nArticles = articleCount?.n ?? 0;
  const fmtN = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");
  const initial = tenant.name[0]?.toUpperCase() ?? "A";

  return (
    <PageShell maxWidth={860}>
      <PageHeader
        title="Général & branding"
        subtitle="Identité du workspace, langue, fuseau et numérotation des tickets."
      />

      {error === "delete-cloud" && (
        <div
          className="rounded-md border px-3 py-2"
          style={{
            fontSize: 13,
            borderColor: "var(--dang)",
            background: "var(--dang-t)",
            color: "var(--dang)",
          }}
        >
          Suppression refusée — la suppression programmée est disponible en cloud.
        </div>
      )}

      <form action={saveGeneral} className="flex flex-col" style={{ gap: 22 }}>
        <Card title="Identité">
          <div className="flex flex-col" style={{ gap: 13 }}>
            <Field label="Nom du workspace">
              <TextInput name="name" required defaultValue={tenant.name} style={CONTROL} />
            </Field>

            {/* Logo + favicon — grid auto-fit minmax(300px,1fr) gap 13 */}
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
            >
              <div className="flex flex-col gap-1.5">
                <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  Logo
                </span>
                <div className="flex items-center" style={{ gap: 11 }}>
                  <span
                    className="flex items-center justify-center font-bold text-white"
                    style={{
                      width: 46,
                      height: 46,
                      flex: "none",
                      borderRadius: 10,
                      fontSize: 19,
                      background: branding.accentColor ?? "var(--acc)",
                    }}
                  >
                    {initial}
                  </span>
                  <span
                    className="flex flex-1 items-center justify-center rounded-lg border border-dashed"
                    style={{
                      height: 46,
                      borderColor: "var(--line)",
                      fontSize: 12.5,
                      color: "var(--ink-3)",
                      cursor: "pointer",
                    }}
                  >
                    Remplacer · recadrer
                  </span>
                </div>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  PNG ou SVG, 512 px minimum.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  Favicon
                </span>
                <div className="flex items-center" style={{ gap: 11 }}>
                  <span
                    className="flex items-center justify-center border"
                    style={{
                      width: 46,
                      height: 46,
                      flex: "none",
                      borderRadius: 10,
                      fontSize: 15,
                      borderColor: "var(--line)",
                      background: "var(--sunk)",
                      color: "var(--ink)",
                    }}
                  >
                    {initial}
                  </span>
                  <span
                    className="flex flex-1 items-center justify-center rounded-lg border border-dashed"
                    style={{
                      height: 46,
                      borderColor: "var(--line)",
                      fontSize: 12.5,
                      color: "var(--ink-3)",
                      cursor: "pointer",
                    }}
                  >
                    Remplacer
                  </span>
                </div>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>32 × 32 px, ICO ou PNG.</span>
              </div>
            </div>

            <Field
              label="Couleur d'accent"
              hint="Utilisée sur le portail client et dans les emails sortants."
            >
              <AccentPicker name="accentColor" initial={branding.accentColor ?? "#0B5F46"} />
            </Field>
          </div>
        </Card>

        <Card title="Régionalisation">
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
          >
            <Field label="Langue par défaut">
              <Select name="locale" defaultValue={tenant.locale} style={CONTROL}>
                <option value="fr">Français (fr-FR)</option>
                <option value="en">English (en-US)</option>
              </Select>
            </Field>
            <Field label="Fuseau horaire">
              <Select name="timezone" defaultValue={tenant.timezone} style={CONTROL}>
                <option value="Europe/Paris">Europe/Paris (UTC+2)</option>
                <option value="Europe/Brussels">Europe/Brussels (UTC+2)</option>
                <option value="Europe/London">Europe/London (UTC+1)</option>
                <option value="America/Montreal">America/Montreal (UTC−4)</option>
                <option value="UTC">UTC</option>
              </Select>
            </Field>
            <Field label="Format de numérotation">
              <TextInput
                name="ticketNumberFormat"
                defaultValue={tenant.ticketNumberFormat}
                className="font-mono"
                spellCheck={false}
                style={CONTROL}
              />
            </Field>
            <Field label="Premier numéro">
              <TextInput
                name="firstNumber"
                type="number"
                min={1}
                defaultValue={branding.firstTicketNumber ?? 1000}
                className="font-mono"
                style={CONTROL}
              />
            </Field>
          </div>
        </Card>

        <SaveBar saved={saved === "1"} cancelHref="/app/settings/general" />
      </form>

      {/* Zone de danger — cadre --dang, 2 lignes (panel puis --dang-t) */}
      <Card title="Zone de danger" danger style={{ padding: 0 }}>
        <div
          className="flex flex-wrap items-center"
          style={{
            padding: 14,
            gap: 14,
            borderTop: "1px solid var(--line)",
            borderBottom: "1px solid var(--line)",
            background: "var(--panel)",
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold" style={{ fontSize: 13.5, color: "var(--ink)" }}>
              Transférer la propriété
            </p>
            <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              Désigner un autre administrateur comme propriétaire.
            </p>
          </div>
          {me.role === "owner" ? (
            admins.length > 0 ? (
              <form action={transferOwnership} className="flex items-center gap-2">
                <Select
                  name="newOwnerId"
                  defaultValue={admins[0]!.id}
                  style={{ minWidth: 180, height: 32, fontSize: 13 }}
                >
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
                <button
                  type="submit"
                  className="rounded-md border font-semibold"
                  style={{
                    height: 32,
                    padding: "0 13px",
                    fontSize: 13,
                    borderColor: "var(--line)",
                    background: "var(--panel)",
                    color: "var(--ink)",
                  }}
                >
                  Transférer
                </button>
              </form>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                Aucun administrateur actif à promouvoir.
              </span>
            )
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              Réservé au propriétaire du workspace.
            </span>
          )}
        </div>

        <div
          className="flex flex-wrap items-center"
          style={{ padding: 14, gap: 14, background: "var(--dang-t)" }}
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold" style={{ fontSize: 13.5, color: "var(--dang)" }}>
              Supprimer le workspace
            </p>
            <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              Suppression définitive après 30 jours de rétention.
            </p>
          </div>
          <Modal
            title="Supprimer le workspace"
            trigger={<>Supprimer</>}
            triggerClassName="rounded-md border font-semibold"
            triggerStyle={{
              height: 32,
              padding: "0 13px",
              fontSize: 13,
              borderColor: "var(--dang)",
              color: "var(--dang)",
              background: "var(--panel)",
            }}
          >
            <form action={deleteWorkspace} className="flex flex-col gap-3">
              <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                Cette action est irréversible. Les {fmtN(nTickets)} tickets, {fmtN(nContacts)}{" "}
                contacts et {fmtN(nArticles)} articles seront définitivement supprimés après 30
                jours de rétention.
              </p>
              <SlugConfirmField slug={tenant.slug} buttonLabel="Supprimer définitivement" />
            </form>
          </Modal>
        </div>
      </Card>
    </PageShell>
  );
}
