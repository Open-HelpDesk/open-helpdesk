import { requireAgent } from "@/lib/session";
import {
  Field,
  PageHeader,
  PageShell,
  SaveBar,
  Select,
  Toggle,
} from "@/components/settings-page";
import { getT } from "@/i18n/server";
import { ExclusionsField } from "./exclusions-field";
import { saveCsatConfig } from "./actions";

type CsatConfig = {
  enabled?: boolean;
  question?: string;
  delayHours?: number;
  reminderDays?: number;
  exclusions?: string[];
};

const CONTROL: React.CSSProperties = {
  minHeight: 36,
  padding: "7px 11px",
  borderRadius: 6,
  fontSize: 13.5,
};

/**
 * ST-08 — Satisfaction (900 px, 2 columns minmax(340px,1fr) gap 20): framed
 * enablement panel, send time / reminder in a minmax(300px,1fr) grid,
 * question, exclusions as chips + 😊/😕 email preview on the right.
 */
export default async function CsatPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { saved } = await searchParams;
  const config = (tenant.csatConfig ?? {}) as CsatConfig;
  const question = config.question ?? t("app.settings.portal.csatQuestionDefault");
  const branding = (tenant.branding ?? {}) as { accentColor?: string };
  const accent = branding.accentColor ?? "#0B5F46";

  return (
    <PageShell maxWidth={900}>
      <PageHeader
        title={t("app.settings.portal.csatTitle")}
        subtitle={t("app.settings.portal.csatSubtitle")}
      />

      <form action={saveCsatConfig} className="flex flex-col" style={{ gap: 22 }}>
        <div
          className="st-rise grid items-start"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}
        >
          {/* Settings column */}
          <div className="flex flex-col" style={{ gap: 20 }}>
            <div
              className="border"
              style={{
                padding: "13px 14px",
                borderRadius: 9,
                borderColor: "var(--line)",
                background: "var(--panel)",
              }}
            >
              <Toggle
                name="enabled"
                defaultChecked={config.enabled === true}
                label={t("app.settings.portal.csatEnabledLabel")}
                hint={t("app.settings.portal.csatEnabledHint")}
              />
            </div>

            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
            >
              <Field label={t("app.settings.portal.csatDelayLabel")}>
                <Select name="delayHours" defaultValue={String(config.delayHours ?? 2)} style={CONTROL}>
                  <option value="0">{t("app.settings.portal.csatDelayImmediate")}</option>
                  <option value="1">{t("app.settings.portal.csatDelayHours", { count: 1 })}</option>
                  <option value="2">{t("app.settings.portal.csatDelayHours", { count: 2 })}</option>
                  <option value="24">{t("app.settings.portal.csatDelayHours", { count: 24 })}</option>
                </Select>
              </Field>
              <Field label={t("app.settings.portal.csatReminderLabel")}>
                <Select name="reminderDays" defaultValue={String(config.reminderDays ?? 0)} style={CONTROL}>
                  <option value="0">{t("app.settings.portal.csatReminderNone")}</option>
                  <option value="3">{t("app.settings.portal.csatReminderDays", { count: 3 })}</option>
                  <option value="7">{t("app.settings.portal.csatReminderDays", { count: 7 })}</option>
                </Select>
              </Field>
            </div>

            <Field label={t("app.settings.portal.csatQuestionLabel")}>
              <input
                name="question"
                defaultValue={question}
                maxLength={500}
                className="border"
                style={{
                  ...CONTROL,
                  borderColor: "var(--line)",
                  background: "var(--bg)",
                  color: "var(--ink)",
                }}
              />
            </Field>

            <div className="flex flex-col" style={{ gap: 6 }}>
              <span className="font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                {t("app.settings.portal.csatExclusionsLabel")}
              </span>
              <ExclusionsField initial={config.exclusions ?? []} />
            </div>
          </div>

          {/* Preview column — preview of the email sent to the contact */}
          <div
            className="overflow-hidden border"
            style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <div
              className="border-b"
              style={{
                padding: "9px 13px",
                background: "var(--sunk)",
                borderColor: "var(--line)",
                fontSize: 11.5,
                color: "var(--ink-3)",
              }}
            >
              {t("app.settings.portal.csatPreviewTitle")}
            </div>
            <div
              className="flex flex-col items-center text-center"
              style={{ padding: "24px 20px", gap: 16 }}
            >
              <span
                className="grid place-items-center font-bold text-white"
                style={{ width: 32, height: 32, borderRadius: 9, fontSize: 14, background: accent }}
              >
                {tenant.name[0]?.toUpperCase()}
              </span>
              <p className="font-semibold" style={{ fontSize: 15, color: "var(--ink)", textWrap: "balance" }}>
                {question}
              </p>
              <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {t("app.settings.portal.csatPreviewTicket")}
              </p>
              <div className="flex w-full" style={{ gap: 10 }}>
                <span
                  className="flex flex-1 flex-col items-center justify-center border font-semibold"
                  style={{
                    height: 52,
                    borderRadius: 9,
                    borderColor: "var(--ok)",
                    color: "var(--ok)",
                    fontSize: 12.5,
                  }}
                >
                  😊<span>{t("app.settings.portal.csatSatisfied")}</span>
                </span>
                <span
                  className="flex flex-1 flex-col items-center justify-center border font-semibold"
                  style={{
                    height: 52,
                    borderRadius: 9,
                    borderColor: "var(--line)",
                    color: "var(--ink-2)",
                    fontSize: 12.5,
                  }}
                >
                  😕<span>{t("app.settings.portal.csatDissatisfied")}</span>
                </span>
              </div>
              <span
                className="w-full border text-left"
                style={{
                  minHeight: 56,
                  padding: 10,
                  borderRadius: 9,
                  borderColor: "var(--line)",
                  background: "var(--bg)",
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                }}
              >
                {t("app.settings.portal.csatCommentPlaceholder")}
              </span>
              <p style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                {t("app.settings.portal.csatPoweredBy")}
              </p>
            </div>
          </div>
        </div>

        <SaveBar saved={saved === "1"} cancelHref="/app/settings/csat" />
      </form>
    </PageShell>
  );
}
