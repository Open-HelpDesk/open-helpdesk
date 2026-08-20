import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { LOCALES } from "@/i18n/locales";
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
import { BrandAssetField } from "@/components/settings-brand";
import { deleteWorkspace, saveGeneral, transferOwnership } from "./actions";

/** Champ de saisie du design : min-height 36, padding 7/11, 13.5px. */
const CONTROL = { minHeight: 36, padding: "7px 11px", fontSize: 13.5 } as const;

/**
 * Fuseaux proposés : un par heure légale de l'Union, plus les voisins utiles.
 *
 * La liste suit le registre des langues — un tenant qui règle son logiciel en
 * bulgare doit pouvoir dire qu'il vit à l'heure de Sofia, sans quoi tous ses
 * horodatages et ses horaires ouvrés sont décalés de deux heures. Les
 * identifiants IANA ne se traduisent pas : ce sont des clés, et c'est sous ce
 * nom qu'on les retrouve partout ailleurs.
 */
const TIMEZONES = [
  "Europe/Lisbon", "Europe/Dublin", "Europe/London",
  "Europe/Madrid", "Europe/Paris", "Europe/Brussels", "Europe/Amsterdam",
  "Europe/Luxembourg", "Europe/Berlin", "Europe/Copenhagen", "Europe/Oslo",
  "Europe/Stockholm", "Europe/Vienna", "Europe/Prague", "Europe/Bratislava",
  "Europe/Budapest", "Europe/Ljubljana", "Europe/Zagreb", "Europe/Warsaw",
  "Europe/Rome", "Europe/Malta", "Europe/Athens", "Europe/Bucharest",
  "Europe/Sofia", "Europe/Helsinki", "Europe/Tallinn", "Europe/Riga",
  "Europe/Vilnius", "Europe/Nicosia",
  "America/Montreal", "UTC",
] as const;

/**
 * Décalage du fuseau à cet instant — « UTC+2 ».
 *
 * Il est calculé, pas écrit : l'heure d'été le décale de soixante minutes deux
 * fois par an, et une étiquette figée est donc fausse la moitié de l'année.
 */
function utcOffset(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date());
  // `shortOffset` dit « GMT+2 » ; l'écran disait « UTC+2 » et c'est le terme
  // que le produit emploie partout ailleurs.
  const brut = parts.find((p) => p.type === "timeZoneName")?.value ?? "UTC";
  return brut.replace("GMT", "UTC");
}

/**
 * ST-01 — Général & branding (860 px) : identité du workspace, régionalisation,
 * zone de danger (transfert de propriété, suppression avec confirmation par slug).
 */
export default async function GeneralSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const t = await getT();
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
    logoUrl?: string;
    faviconUrl?: string;
  };
  const nTickets = ticketCount?.n ?? 0;
  const nContacts = contactCount?.n ?? 0;
  const nArticles = articleCount?.n ?? 0;
  const initial = tenant.name[0]?.toUpperCase() ?? "A";

  return (
    <PageShell maxWidth={860}>
      <PageHeader
        title={t("app.settings.workspace.generalTitle")}
        subtitle={t("app.settings.workspace.generalSubtitle")}
      />

      {/* Un dépôt refusé le dit. Le format et le poids sont vérifiés côté
          serveur, et l'enregistrement est interrompu AVANT d'écrire : rien
          d'autre n'a été enregistré non plus, et le message ne mentirait pas
          en laissant croire le contraire. */}
      {(error === "delete-cloud" ||
        error === "logo-format" ||
        error === "favicon-format" ||
        error === "logo-size" ||
        error === "favicon-size") && (
        <div
          className="rounded-md border px-3 py-2"
          style={{
            fontSize: 13,
            borderColor: "var(--dang)",
            background: "var(--dang-t)",
            color: "var(--dang)",
          }}
        >
          {error === "delete-cloud"
            ? t("app.settings.workspace.generalDeleteCloudError")
            : error.endsWith("-size")
              ? t("app.settings.workspace.generalAssetSizeError")
              : t("app.settings.workspace.generalAssetFormatError")}
        </div>
      )}

      <form action={saveGeneral} className="flex flex-col" style={{ gap: 22 }}>
        <Card title={t("app.settings.workspace.generalIdentity")}>
          <div className="flex flex-col" style={{ gap: 13 }}>
            <Field label={t("app.settings.workspace.generalNameLabel")}>
              <TextInput name="name" required defaultValue={tenant.name} style={CONTROL} />
            </Field>

            {/* Logo + favicon — grid auto-fit minmax(300px,1fr) gap 13 */}
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
            >
              <BrandAssetField
                name="logo"
                current={branding.logoUrl ?? null}
                initial={initial}
                background={branding.accentColor ?? "var(--acc)"}
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                label={t("app.settings.workspace.generalLogoLabel")}
                replaceLabel={t("app.settings.workspace.generalLogoReplace")}
                removeLabel={t("app.settings.workspace.generalLogoRemove")}
                hint={t("app.settings.workspace.generalLogoHint")}
              />
              <BrandAssetField
                name="favicon"
                current={branding.faviconUrl ?? null}
                initial={initial}
                background="var(--sunk)"
                accept="image/png,image/svg+xml,image/x-icon,.ico"
                label={t("app.settings.workspace.generalFaviconLabel")}
                replaceLabel={t("app.settings.workspace.generalFaviconReplace")}
                removeLabel={t("app.settings.workspace.generalFaviconRemove")}
                hint={t("app.settings.workspace.generalFaviconHint")}
              />
            </div>

            <Field
              label={t("app.settings.workspace.generalAccentLabel")}
              hint={t("app.settings.workspace.generalAccentHint")}
            >
              <AccentPicker name="accentColor" initial={branding.accentColor ?? "#0B5F46"} />
            </Field>
          </div>
        </Card>

        <Card title={t("app.settings.workspace.generalRegion")}>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
          >
            <Field label={t("app.settings.workspace.generalLocaleLabel")}>
              {/* Une langue par tenant : agents et clients lisent la même.
                  Chaque langue s'affiche dans sa propre langue — un menu de
                  langues traduit est illisible pour qui cherche la sienne. */}
              <Select name="locale" defaultValue={tenant.locale} style={CONTROL}>
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeName} ({l.tag})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("app.settings.workspace.generalTimezoneLabel")}>
              {/* Le fuseau du tenant est ajouté s'il sort de la liste : sans
                  cela le menu afficherait la première option et le premier
                  enregistrement déplacerait le workspace à son insu. */}
              <Select name="timezone" defaultValue={tenant.timezone} style={CONTROL}>
                {(TIMEZONES.includes(tenant.timezone as (typeof TIMEZONES)[number])
                  ? TIMEZONES
                  : [tenant.timezone, ...TIMEZONES]
                ).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz === "UTC" ? "UTC" : `${tz} (${utcOffset(tz)})`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("app.settings.workspace.generalNumberFormatLabel")}>
              <TextInput
                name="ticketNumberFormat"
                defaultValue={tenant.ticketNumberFormat}
                className="font-mono"
                spellCheck={false}
                style={CONTROL}
              />
            </Field>
            <Field label={t("app.settings.workspace.generalFirstNumberLabel")}>
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
      <Card title={t("app.settings.workspace.dangerZone")} danger style={{ padding: 0 }}>
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
              {t("app.settings.workspace.transferTitle")}
            </p>
            <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              {t("app.settings.workspace.transferHint")}
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
                  {t("app.settings.workspace.transferAction")}
                </button>
              </form>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {t("app.settings.workspace.transferNoAdmin")}
              </span>
            )
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              {t("app.settings.workspace.transferOwnerOnly")}
            </span>
          )}
        </div>

        <div
          className="flex flex-wrap items-center"
          style={{ padding: 14, gap: 14, background: "var(--dang-t)" }}
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold" style={{ fontSize: 13.5, color: "var(--dang)" }}>
              {t("app.settings.workspace.deleteWorkspaceTitle")}
            </p>
            <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              {t("app.settings.workspace.deleteWorkspaceHint")}
            </p>
          </div>
          <Modal
            title={t("app.settings.workspace.deleteWorkspaceTitle")}
            trigger={<>{t("app.settings.workspace.delete")}</>}
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
                {t("app.settings.workspace.deleteWorkspaceConfirm")}
              </p>
              {/* Les trois effectifs sont sortis de la phrase : elle en comptait
                  trois, indépendants, là où une clé ne porte qu'une dimension de
                  pluriel — à un ticket, elle écrivait « Les 1 tickets ». Chacun
                  décline maintenant son nom, et rien ne les relie qu'un
                  séparateur typographique, qui n'a de cas dans aucune langue. */}
              <p className="font-semibold" style={{ fontSize: 13.5, color: "var(--dang)" }}>
                {[
                  t("app.settings.workspace.generalDeleteTicketCount", { count: nTickets }),
                  t("app.settings.workspace.generalDeleteContactCount", { count: nContacts }),
                  t("app.settings.workspace.generalDeleteArticleCount", { count: nArticles }),
                ].join(" · ")}
              </p>
              <SlugConfirmField
                slug={tenant.slug}
                prompt={t("app.settings.workspace.generalDeleteSlugPrompt", {
                  slug: tenant.slug,
                })}
                buttonLabel={t("app.settings.workspace.deleteWorkspaceButton")}
              />
            </form>
          </Modal>
        </div>
      </Card>
    </PageShell>
  );
}
