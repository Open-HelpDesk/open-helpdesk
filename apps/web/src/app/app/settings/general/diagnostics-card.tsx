import Link from "next/link";
import { Card, StatusPill } from "@/components/settings-page";
import { getT, type Translate } from "@/i18n/server";
import { runDiagnostics, type ProbeId, type ProbeStatus } from "@/lib/diagnostics";

/** Design-system pill: warn shows as wait, fail as danger. */
const PILL_TONE: Record<ProbeStatus, "ok" | "wait" | "dang"> = {
  ok: "ok",
  warn: "wait",
  fail: "dang",
};

function probeLabel(t: Translate, id: ProbeId): string {
  const keys = {
    db: "app.settings.workspace.diagProbeDb",
    mailOut: "app.settings.workspace.diagProbeMailOut",
    mailIn: "app.settings.workspace.diagProbeMailIn",
    storage: "app.settings.workspace.diagProbeStorage",
    queue: "app.settings.workspace.diagProbeQueue",
    crypto: "app.settings.workspace.diagProbeCrypto",
  } as const;
  return t(keys[id]);
}

function RunButton({ label }: { label: string }) {
  return (
    <Link
      href="/app/settings/general?diag=1"
      className="ohd-hover-edge-ink inline-flex items-center rounded-[9px] border px-3 font-medium"
      style={{
        height: 38,
        fontSize: 12.5,
        borderColor: "var(--line)",
        background: "var(--panel)",
        color: "var(--ink)",
      }}
    >
      {label}
    </Link>
  );
}

/**
 * ST-01 — "Installation health" card: six probes (database, outbound and
 * inbound email, storage, queues, encryption) run at render time when `?diag=1`.
 * Ephemeral: re-run = reload the page. Owner/Admin only (the page filters),
 * raw error details are deliberate — they describe the infrastructure.
 */
export async function DiagnosticsCard({ tenantId, run }: { tenantId: string; run: boolean }) {
  const t = await getT();
  const results = run ? await runDiagnostics(tenantId, t) : null;
  const total = results ? results.reduce((sum, r) => sum + r.ms, 0) : 0;

  return (
    <Card title={t("app.settings.workspace.diagTitle")}>
      <div className="flex flex-col">
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", paddingBottom: 12 }}>
          {t("app.settings.workspace.diagHint")}
        </p>

        {results?.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center"
            style={{ gap: 12, padding: "9px 0", borderTop: "1px solid var(--line-2)" }}
          >
            <span
              className="font-semibold"
              style={{ fontSize: 13.5, color: "var(--ink)", width: 170, flexShrink: 0 }}
            >
              {probeLabel(t, r.id)}
            </span>
            <StatusPill tone={PILL_TONE[r.status]}>
              {t(
                r.status === "ok"
                  ? "app.settings.workspace.diagStatusOk"
                  : r.status === "warn"
                    ? "app.settings.workspace.diagStatusWarn"
                    : "app.settings.workspace.diagStatusFail",
              )}
            </StatusPill>
            <span className="min-w-0 flex-1" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              {r.detail}
            </span>
            <span
              className="font-mono tabular-nums"
              style={{ fontSize: 12, color: "var(--ink-3)" }}
            >
              {t("app.settings.workspace.diagMs", { ms: r.ms })}
            </span>
          </div>
        ))}

        <div
          className="flex flex-wrap items-center"
          style={{
            gap: 12,
            paddingTop: results ? 12 : 0,
            borderTop: results ? "1px solid var(--line-2)" : undefined,
          }}
        >
          <RunButton
            label={t(
              results
                ? "app.settings.workspace.diagRunAgain"
                : "app.settings.workspace.diagRun",
            )}
          />
          {results && (
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {t("app.settings.workspace.diagTotal", { ms: total })}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
