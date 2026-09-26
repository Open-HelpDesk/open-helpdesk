/**
 * SD-A8 — Shadow IT (`/app/desk/shadow`, ee/ deskShadowIt).
 *
 * Software used in the company without being in the catalogue: who uses it,
 * where it was seen, what it costs, how risky it is and why — and the three
 * decisions (add to catalogue, block, ignore). No findings is not a clean bill
 * of health when nothing is connected: the empty state says which connector
 * feeds this screen.
 */
import Link from "next/link";
import { AppIcon } from "@/components/desk/app-icon";
import type { Translate } from "@/i18n/server";
import { deskScreen } from "../shared/server";
import { DeskColumn, DeskHeader, DeskLocked } from "../shared/screen";
import { DeskToaster } from "../shared/ui";
import { CARD } from "../shared/styles";
import { loadShadow, type ShadowSource } from "./data";
import { ShadowRows } from "./client";

function sourceShort(t: Translate, key: string): string {
  if (key === "google_oauth") return t("desk.ee.sh.srcGoogleShort");
  if (key === "entra_signins") return t("desk.ee.sh.srcEntraShort");
  return sourceLabel(t, key);
}

function sourceLabel(t: Translate, key: string): string {
  if (key === "google_oauth") return t("desk.ee.sh.srcGoogle");
  if (key === "entra_signins") return t("desk.ee.sh.srcEntra");
  if (key === "expenses") return t("desk.ee.sh.srcExpenses");
  return key;
}

export default async function ShadowPage() {
  const ctx = await deskScreen("deskShadowIt");
  const { t } = ctx;
  const title = t("desk.ee.sh.title");
  const subtitle = t("desk.ee.sh.subtitle");
  if (!ctx.allowed) {
    return <DeskLocked t={t} title={title} subtitle={subtitle} lockedTitle="desk.ee.sh.lockedTitle" lockedText="desk.ee.sh.lockedText" />;
  }
  const { sources, findings } = await loadShadow(ctx.tenant.id);
  const connected = sources.some((s) => (s.key === "google_oauth" || s.key === "entra_signins") && s.status === "ok");

  return (
    <DeskToaster>
      <DeskColumn>
        <DeskHeader title={title} subtitle={subtitle} />
        {sources.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
            {sources.map((s) => (
              <SourceTile key={s.key} t={t} s={s} />
            ))}
          </div>
        )}
        {findings.length === 0 ? (
          <div
            style={{
              ...CARD,
              borderStyle: "dashed",
              padding: "40px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 10,
            }}
          >
            <p style={{ fontSize: 16, fontWeight: 600 }}>
              {connected ? t("desk.ee.sh.emptyTitle") : t("desk.ee.sh.emptyNoSourceTitle")}
            </p>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)", maxWidth: 520 }}>
              {connected ? t("desk.ee.sh.emptyText") : t("desk.ee.sh.emptyNoSourceText")}
            </p>
            {!connected && (
              <Link href="/app/desk/config" className="ohd-link" style={{ fontSize: 13.5, fontWeight: 600 }}>
                {t("desk.ee.sh.configure")}
              </Link>
            )}
          </div>
        ) : (
          <ShadowRows
            findings={findings.map((f) => ({
              ...f,
              sourceLabel: sourceShort(t, f.source),
            }))}
            icons={Object.fromEntries(
              findings.map((f) => [f.id, <AppIcon key={f.id} name={f.name} iconKey={f.iconKey} size={34} />]),
            )}
          />
        )}
      </DeskColumn>
    </DeskToaster>
  );
}

function SourceTile({ t, s }: { t: Translate; s: ShadowSource }) {
  const color = s.status === "ok" ? "var(--ok)" : s.status === "error" ? "var(--dang)" : "var(--ink-3)";
  const sub =
    s.status === "error"
      ? t("desk.ee.sh.srcError")
      : s.lastSyncAt
        ? t("desk.ee.sh.synced", { when: t.fmt.relative(new Date(s.lastSyncAt)) })
        : t("desk.ee.sh.neverSynced");
  return (
    <div style={{ ...CARD, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color, flex: "none" }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{sourceLabel(t, s.key)}</div>
        <div style={{ fontSize: 12, color: s.status === "error" ? "var(--dang)" : "var(--ink-3)" }}>{sub}</div>
      </div>
    </div>
  );
}
