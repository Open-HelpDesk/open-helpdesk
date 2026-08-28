import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { businessHours, db } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import {
  Card,
  Field,
  PageHeader,
  PageShell,
  Select,
  SubCrumb,
} from "@/components/settings-page";
import { ConditionsBuilder } from "@/components/rule-builders";
import { createSlaPolicy } from "../actions";

/**
 * ST-07b — New SLA policy.
 *
 * V2 gives it a page with its own breadcrumb rather than the 420 px drawer it
 * used to be: the conditions builder is a three-column grid, and it spent its
 * life folded into a column half its width.
 */
export default async function NewSlaPolicyPage() {
  const t = await getT();
  const { tenant } = await requireAgent();

  const calendars = await db
    .select({ id: businessHours.id, name: businessHours.name })
    .from(businessHours)
    .where(eq(businessHours.tenantId, tenant.id))
    .orderBy(asc(businessHours.position), asc(businessHours.name));

  return (
    <PageShell>
      <SubCrumb
        parent={t("app.settings.sla.title")}
        href="/app/settings/sla"
        current={t("app.settings.sla.newPolicyTitle")}
      />
      <PageHeader
        title={t("app.settings.sla.newPolicyTitle")}
        subtitle={t("app.settings.sla.newPolicySubtitle")}
      />

      <form action={createSlaPolicy} className="st-rise flex flex-col" style={{ gap: 16 }}>
        <Card>
          <Field label={t("app.settings.sla.policyName")}>
            <input
              className="ohd-field outline-none"
              name="name"
              required
              placeholder={t("app.settings.sla.policyNamePlaceholder")}
              style={{
                height: 40,
                padding: "0 12px",
                border: "1px solid var(--line)",
                borderRadius: 9,
                background: "var(--panel)",
                color: "var(--ink)",
                fontSize: 13.5,
              }}
            />
          </Field>
          <ConditionsBuilder
            name="conditions"
            label={t("app.settings.sla.conditionsLabelNew")}
            initial={[]}
          />
          <Field label={t("app.settings.sla.calendarApplied")}>
            <Select name="businessHoursId">
              <option value="">{t("app.settings.sla.calendarNone")}</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <div className="flex items-center justify-end" style={{ gap: 10 }}>
          <Link
            href="/app/settings/sla"
            className="ohd-hover-edge-ink grid place-items-center"
            style={{
              height: 38,
              padding: "0 15px",
              border: "1px solid var(--line)",
              borderRadius: 9,
              background: "var(--panel)",
              fontSize: 13,
            }}
          >
            {t("app.settings.shell.cancel")}
          </Link>
          <button
            type="submit"
            className="grid place-items-center font-semibold"
            style={{
              color: "var(--on-brand)",
              height: 38,
              padding: "0 16px",
              borderRadius: 9,
              background: "var(--brand)",
              fontSize: 13.5,
            }}
          >
            {t("app.settings.sla.createPolicy")}
          </button>
        </div>
      </form>
    </PageShell>
  );
}
