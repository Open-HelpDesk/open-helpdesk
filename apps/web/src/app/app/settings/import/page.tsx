import { requireAgent } from "@/lib/session";
import { recentRuns } from "@openhelpdesk/import";
import { exportCounts } from "@openhelpdesk/export";
import {
  Card,
  EmptyState,
  Field,
  GridHead,
  PageHeader,
  PageShell,
  StatusPill,
  Toggle,
} from "@/components/settings-page";
import { getT } from "@/i18n/server";
import { startImport } from "./actions";

type Counts = { seen: number; created: number; skipped: number; failed: number };
type RunCounts = Partial<
  Record<"organizations" | "contacts" | "tickets" | "messages" | "attachments", Counts>
>;
type Anomaly = { kind: string; object: string; externalId: string; detail?: string };

const TEMPLATE = "minmax(150px,1fr) 110px minmax(90px,140px) minmax(90px,140px) 120px";

type RunStatus = keyof typeof STATUS_LABEL;

const STATUS_TONE: Record<RunStatus, "ok" | "wait" | "dang" | "closed"> = {
  succeeded: "ok",
  running: "wait",
  pending: "wait",
  failed: "dang",
  cancelled: "closed",
};

/**
 * Written out rather than built from the status, so a key that stops existing
 * is a compile error instead of a blank pill on a screen nobody opens twice.
 */
const STATUS_LABEL = {
  pending: "app.settings.import.statusPending",
  running: "app.settings.import.statusRunning",
  succeeded: "app.settings.import.statusSucceeded",
  failed: "app.settings.import.statusFailed",
  cancelled: "app.settings.import.statusCancelled",
} as const;

/** Same reason: every anomaly code the writer can emit has a phrase here. */
const ANOMALY_LABEL = {
  contact_without_email: "app.settings.import.anomalyContactWithoutEmail",
  ticket_without_requester: "app.settings.import.anomalyTicketWithoutRequester",
  duplicate_number: "app.settings.import.anomalyDuplicateNumber",
  unmapped_status: "app.settings.import.anomalyUnmappedStatus",
  unmapped_priority: "app.settings.import.anomalyUnmappedPriority",
  message_without_body: "app.settings.import.anomalyMessageWithoutBody",
  attachment_too_large: "app.settings.import.anomalyAttachmentTooLarge",
  attachment_unreachable: "app.settings.import.anomalyAttachmentUnreachable",
  write_failed: "app.settings.import.anomalyWriteFailed",
} as const;

/**
 * Import from another product — the screen behind the migration page.
 *
 * Two things it must never let happen: a real run started by someone who meant
 * to rehearse, and a report that hides what did not come across. Hence the
 * rehearsal being on by default, and the anomalies being shown as a list rather
 * than a count.
 */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; error?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { run: highlighted, error } = await searchParams;
  const [runs, totals] = await Promise.all([recentRuns(tenant.id, 10), exportCounts(tenant.id)]);
  const shown = runs.find((r) => r.id === highlighted) ?? runs[0];
  const anomalies = (shown?.anomalies ?? []) as Anomaly[];

  const errorText =
    error === "missing"
      ? t("app.settings.import.errorMissing")
      : error === "too_large"
        ? t("app.settings.import.errorTooLarge")
        : error === "invalid"
          ? t("app.settings.import.errorInvalid")
          : error === "empty"
            ? t("app.settings.import.errorEmpty")
            : null;

  return (
    <PageShell>
      <PageHeader
        title={t("app.settings.import.title")}
        subtitle={t("app.settings.import.subtitle")}
      />

      <div className="flex flex-col" style={{ gap: 22 }}>
        {errorText ? (
          <div
            className="border"
            style={{
              padding: "11px 14px",
              borderRadius: 9,
              fontSize: 13,
              borderColor: "var(--dang)",
              background: "var(--dang-t)",
              color: "var(--dang)",
            }}
          >
            {errorText}
          </div>
        ) : null}

        <Card title={t("app.settings.import.formTitle")}>
          <form action={startImport} className="flex flex-col" style={{ gap: 18 }}>
            <Field
              label={t("app.settings.import.fileLabel")}
              hint={t("app.settings.import.fileHint")}
            >
              <input
                type="file"
                name="export"
                accept="application/json,.json"
                required
                style={{ fontSize: 13.5 }}
              />
            </Field>

            <Toggle
              name="dryRun"
              defaultChecked
              label={t("app.settings.import.dryRunLabel")}
              hint={t("app.settings.import.dryRunHint")}
            />

            <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
              {t("app.settings.import.warning")}
            </p>

            <div>
              <button
                type="submit"
                className="inline-flex items-center justify-center font-semibold"
                style={{
                  minHeight: 36,
                  padding: "0 16px",
                  borderRadius: 8,
                  fontSize: 13.5,
                  background: "var(--acc)",
                  color: "#fff",
                }}
              >
                {t("app.settings.import.submit")}
              </button>
            </div>
          </form>
        </Card>

        {shown ? (
          <Card
            title={t("app.settings.import.reportTitle")}
            action={
              shown.dryRun ? (
                <StatusPill tone="wait">{t("app.settings.import.rehearsal")}</StatusPill>
              ) : (
                <StatusPill tone={STATUS_TONE[shown.status as RunStatus] ?? "closed"}>
                  {t(STATUS_LABEL[shown.status as RunStatus])}
                </StatusPill>
              )
            }
          >
            <div className="flex flex-col" style={{ gap: 14 }}>
              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}
              >
                {(
                  [
                    ["organizations", "app.settings.import.objOrganizations"],
                    ["contacts", "app.settings.import.objContacts"],
                    ["tickets", "app.settings.import.objTickets"],
                    ["messages", "app.settings.import.objMessages"],
                    ["attachments", "app.settings.import.objAttachments"],
                  ] as const
                ).map(([key, labelKey]) => {
                  const counts = (shown.counts as RunCounts)[key];
                  return (
                    <div
                      key={key}
                      className="border"
                      style={{
                        padding: "11px 13px",
                        borderRadius: 9,
                        borderColor: "var(--line)",
                        background: "var(--canvas)",
                      }}
                    >
                      <p style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{t(labelKey)}</p>
                      <p style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
                        {counts?.created ?? 0}
                      </p>
                      <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                        {t("app.settings.import.ofSeen", { total: String(counts?.seen ?? 0) })}
                      </p>
                    </div>
                  );
                })}
              </div>

              {shown.error ? (
                <p style={{ fontSize: 13, color: "var(--dang)" }}>{shown.error}</p>
              ) : null}

              {anomalies.length ? (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    {t("app.settings.import.anomaliesTitle", { n: String(anomalies.length) })}
                  </p>
                  <ul className="flex flex-col" style={{ gap: 5 }}>
                    {anomalies.slice(0, 12).map((a, i) => (
                      <li
                        key={`${a.kind}-${a.externalId}-${i}`}
                        style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                      >
                        <span style={{ fontFamily: "var(--font-mono)" }}>{a.externalId}</span>
                        {" — "}
                        {t(ANOMALY_LABEL[a.kind as keyof typeof ANOMALY_LABEL] ?? ANOMALY_LABEL.write_failed)}
                        {a.detail ? ` (${a.detail})` : ""}
                      </li>
                    ))}
                  </ul>
                  {anomalies.length > 12 ? (
                    <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 7 }}>
                      {t("app.settings.import.anomaliesMore", {
                        n: String(anomalies.length - 12),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        {/*
          The other direction. On the same screen because it is the same
          question — whether your data can move — and splitting it into a second
          settings entry would bury the half that proves the promise.
        */}
        <Card title={t("app.settings.import.exportTitle")}>
          <div className="flex flex-col" style={{ gap: 14 }}>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
              {t("app.settings.import.exportBody")}
            </p>
            <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
              {t("app.settings.import.exportContents", {
                tickets: String(totals.tickets),
                messages: String(totals.messages),
                contacts: String(totals.contacts),
                attachments: String(totals.attachments),
              })}
            </p>
            <div>
              <a
                href="/app/settings/import/export"
                className="inline-flex items-center justify-center font-semibold"
                style={{
                  minHeight: 36,
                  padding: "0 16px",
                  borderRadius: 8,
                  fontSize: 13.5,
                  border: "1px solid var(--line-strong)",
                  color: "var(--ink)",
                }}
              >
                {t("app.settings.import.exportAction")}
              </a>
            </div>
          </div>
        </Card>

        <Card title={t("app.settings.import.historyTitle")} style={{ padding: 0 }}>
          {runs.length === 0 ? (
            <div style={{ padding: 18 }}>
              <EmptyState
                title={t("app.settings.import.emptyTitle")}
                text={t("app.settings.import.emptyBody")}
              />
            </div>
          ) : (
            <>
              <GridHead
                columns={[
                  t("app.settings.import.colDate"),
                  t("app.settings.import.colMode"),
                  t("app.settings.import.objTickets"),
                  t("app.settings.import.objMessages"),
                  t("app.settings.import.colStatus"),
                ]}
                template={TEMPLATE}
              />
              {runs.map((r) => {
                const counts = r.counts as RunCounts;
                return (
                  <div
                    key={r.id}
                    className="grid items-center gap-3 border-b"
                    style={{
                      gridTemplateColumns: TEMPLATE,
                      minHeight: 46,
                      padding: "0 18px",
                      fontSize: 13,
                      borderColor: "var(--line)",
                    }}
                  >
                    <span>
                      {`${t.fmt.dateShort(r.createdAt)} ${r.createdAt.toLocaleTimeString(
                        t.locale.tag,
                        { hour: "2-digit", minute: "2-digit" },
                      )}`}
                    </span>
                    <span style={{ color: "var(--ink-2)" }}>
                      {r.dryRun
                        ? t("app.settings.import.rehearsal")
                        : t("app.settings.import.realRun")}
                    </span>
                    <span>{counts.tickets?.created ?? 0}</span>
                    <span>{counts.messages?.created ?? 0}</span>
                    <span className="text-right">
                      <StatusPill tone={STATUS_TONE[r.status as RunStatus] ?? "closed"}>
                        {t(STATUS_LABEL[r.status as RunStatus])}
                      </StatusPill>
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
