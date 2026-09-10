import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, teams } from "@openhelpdesk/db";
import { getWhatsappSettings } from "@openhelpdesk/whatsapp";
import { requireAgent } from "@/lib/session";
import {
  Card,
  Field,
  PageHeader,
  PageShell,
  SaveBar,
  Select,
  TextInput,
} from "@/components/settings-page";
import { getT } from "@/i18n/server";
import { saveWhatsapp, toggleWhatsapp } from "./actions";

/**
 * ST — the WhatsApp channel.
 *
 * The screen is organised around the one thing an operator gets wrong: Meta
 * delivers every event of a business account to ONE callback URL, and the
 * `phone_number_id` is what tells us which workspace an event belongs to. So
 * the URL to paste into Meta's console carries that id, and it is displayed
 * ready to copy rather than described in prose.
 *
 * Three secrets, and the form treats them alike: a blank field keeps the
 * stored value, and none is ever sent back in clear — the masked hint is what
 * tells an operator whether a token was replaced.
 */
export const dynamic = "force-dynamic";

export default async function WhatsappSettingsPage() {
  const { tenant } = await requireAgent();
  const t = await getT();

  const [settings, teamRows] = await Promise.all([
    getWhatsappSettings(tenant.id),
    db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.tenantId, tenant.id)),
  ]);

  const configured = Boolean(settings?.encryptedSecrets);

  /*
   * The callback URL is built from the REQUEST's own host, not from an
   * environment variable.
   *
   * It used to read `APP_URL`, and that was wrong twice over. On staging the
   * variable is not set at all, so the screen displayed the literal
   * `https://<votre-domaine>/api/ingress/whatsapp?...` — a placeholder an
   * operator pastes into Meta's console, where it fails with an error that says
   * nothing about the cause. And even when set, one instance-wide value cannot
   * be right for every workspace: each one is served on its own host
   * (`acme.example.com`), and the route only answers there — the showcase host
   * returns an HTML 404.
   *
   * The host that served this page is, by construction, the host that will
   * serve the webhook. `x-forwarded-proto` because the app sits behind Caddy.
   */
  const head = await headers();
  const host = head.get("host");
  const proto = head.get("x-forwarded-proto") ?? "https";
  const callbackUrl =
    settings?.phoneNumberId && host
      ? `${proto}://${host}/api/ingress/whatsapp?phone_number_id=${settings.phoneNumberId}`
      : null;

  return (
    <PageShell>
      <PageHeader
        title={t("app.settings.whatsapp.title")}
        subtitle={t("app.settings.whatsapp.subtitle")}
      />

      <form action={saveWhatsapp} className="flex flex-col" style={{ gap: 18 }}>
        <Card title={t("app.settings.whatsapp.numberCard")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Phone number ID"
              hint={t("app.settings.whatsapp.phoneNumberIdHint")}
            >
              <TextInput
                name="phoneNumberId"
                defaultValue={settings?.phoneNumberId ?? ""}
                required
                autoComplete="off"
                placeholder="123456789012345"
              />
            </Field>
            <Field label={t("app.settings.whatsapp.displayPhone")}>
              <TextInput
                name="displayPhone"
                defaultValue={settings?.displayPhone ?? ""}
                autoComplete="off"
                placeholder="+33 1 23 45 67 89"
              />
            </Field>
            <Field label="WhatsApp Business Account ID">
              <TextInput name="wabaId" defaultValue={settings?.wabaId ?? ""} autoComplete="off" />
            </Field>
            <Field
              label={t("app.settings.whatsapp.defaultTeam")}
            >
              <Select name="defaultTeamId" defaultValue={settings?.defaultTeamId ?? ""}>
                <option value="">{t("app.settings.whatsapp.noTeam")}</option>
                {teamRows.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card title={t("app.settings.whatsapp.secretsCard")}>
          {/* Le repère masqué, seule information qu'on rende sur un secret :
              elle suffit à dire si le jeton a été remplacé, et elle ne le
              divulgue pas. */}
          {configured && settings?.secretHint ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-2)", marginBottom: 12 }}>
              {t("app.settings.whatsapp.storedHint", { hint: settings.secretHint })}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Access token"
              hint={t("app.settings.whatsapp.keepBlank")}
            >
              <TextInput name="accessToken" type="password" autoComplete="new-password" />
            </Field>
            <Field
              label="App secret"
            >
              <TextInput name="appSecret" type="password" autoComplete="new-password" />
            </Field>
            <Field
              label="Verify token"
            >
              <TextInput name="verifyToken" type="password" autoComplete="new-password" />
            </Field>
          </div>
        </Card>

        {/* Le gabarit, dans sa propre carte : c'est ce qui décide si une
            réponse hors fenêtre est conservée ou refusée, et un opérateur doit
            pouvoir lire cette conséquence avant de remplir les champs. */}
        <Card title={t("app.settings.whatsapp.templateCard")}>
          <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, marginBottom: 12 }}>
            {t("app.settings.whatsapp.templateHelp")}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label={t("app.settings.whatsapp.templateName")}
              hint={t("app.settings.whatsapp.templateNameHint")}
            >
              <TextInput
                name="templateName"
                defaultValue={settings?.templateName ?? ""}
                autoComplete="off"
                placeholder="ticket_update"
              />
            </Field>
            <Field
              label={t("app.settings.whatsapp.templateLang")}
              hint={t("app.settings.whatsapp.templateLangHint")}
            >
              <TextInput
                name="templateLang"
                defaultValue={settings?.templateLang ?? ""}
                autoComplete="off"
                placeholder="fr"
              />
            </Field>
          </div>
        </Card>

        <SaveBar cancelHref="/app/settings/whatsapp" />
      </form>

      <Card title={t("app.settings.whatsapp.webhookCard")}>
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {t("app.settings.whatsapp.webhookHelp")}
        </p>
        {callbackUrl ? (
          <pre
            className="mt-3 overflow-x-auto border"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              borderColor: "var(--line)",
              background: "var(--canvas)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          >
            {callbackUrl}
          </pre>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 10 }}>
            {t("app.settings.whatsapp.webhookNeedsNumber")}
          </p>
        )}
      </Card>

      <Card title={t("app.settings.whatsapp.stateCard")}>
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {settings?.active
            ? t("app.settings.whatsapp.stateOn")
            : configured
              ? t("app.settings.whatsapp.stateOffConfigured")
              : t("app.settings.whatsapp.stateNotConfigured")}
        </p>
        {configured ? (
          <form action={toggleWhatsapp} className="mt-3">
            <input type="hidden" name="active" value={settings?.active ? "false" : "true"} />
            <button
              type="submit"
              className="border"
              style={{
                minHeight: 34,
                padding: "0 14px",
                borderRadius: 7,
                borderColor: settings?.active ? "var(--dang)" : "var(--line)",
                color: settings?.active ? "var(--dang)" : "var(--ink)",
                background: "var(--panel)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {settings?.active
                ? t("app.settings.whatsapp.turnOff")
                : t("app.settings.whatsapp.turnOn")}
            </button>
          </form>
        ) : null}
      </Card>

      {/* Ce que le canal ne sait pas encore faire, dit ici plutôt que découvert
          en production : hors fenêtre de 24 h on refuse et on l'écrit dans le
          fil, on n'envoie pas de gabarit. */}
      <Card title={t("app.settings.whatsapp.limitsCard")}>
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {t("app.settings.whatsapp.limitsBody")}
        </p>
      </Card>
    </PageShell>
  );
}
