/**
 * SD-A9 → Directory. Where the people come from, what routing reads from them,
 * and what happens to an account when someone leaves.
 *
 * The table is the design's "what the directory tells us": the columns ARE the
 * attribute mapping (field → what it drives → the source attribute), the rows a
 * preview of real people, those without a manager first — a wrong manager
 * here is a wrong approval there.
 */
import Link from "next/link";
import { headers } from "next/headers";
import type { Entitlements } from "@openhelpdesk/config";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/en";
import { loadDirectoryStatus, type DirectorySource } from "@/lib/desk/config-data";
import { ConfigSeg, Panel, Pill } from "@/components/desk/config/primitives";
import { linkButton, mono } from "@/components/desk/config/styles";
import { DeprovisionRows } from "@/components/desk/config/deprovision-rows";
import ScimSection from "@openhelpdesk/ee-web/desk/config/scim-section";

const SOURCE_LABEL: Record<DirectorySource, MessageKey> = {
  scim: "desk.cfg.dir.source.scim",
  entra: "desk.cfg.dir.source.entra",
  google: "desk.cfg.dir.source.google",
  csv: "desk.cfg.dir.source.csv",
  manual: "desk.cfg.dir.source.manual",
};

/** The attribute each source hands us for team, manager, hire and leave dates. */
const ATTRIBUTES: Record<DirectorySource, [string, string, string | null, string | null]> = {
  scim: ["enterprise:department", "enterprise:manager", "openhelpdesk:hireDate", "openhelpdesk:leaveDate"],
  entra: ["department", "manager", "employeeHireDate", "employeeLeaveDateTime"],
  google: ["organizations.department", "relations.manager", null, null],
  csv: ["department", "manager_email", "starts_on", "leaves_on"],
  manual: ["department", "manager", "starts_on", "leaves_on"],
};

const GRID = "minmax(170px,1.3fr) repeat(4,minmax(120px,1fr))";

export async function DirectoryTab({ tenantId, ent }: { tenantId: string; ent: Entitlements }) {
  const t = await getT();
  const dir = await loadDirectoryStatus(tenantId);
  const source = dir.source ?? "manual";
  const attrs = ATTRIBUTES[source];
  const apiSource = source === "entra" || source === "google";
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";

  const fields: Array<{ label: string; use: string; attr: string | null }> = [
    { label: t("desk.cfg.dir.field.team"), use: t("desk.cfg.dir.field.teamUse"), attr: attrs[0] },
    { label: t("desk.cfg.dir.field.manager"), use: t("desk.cfg.dir.field.managerUse"), attr: attrs[1] },
    { label: t("desk.cfg.dir.field.start"), use: t("desk.cfg.dir.field.startUse"), attr: attrs[2] },
    { label: t("desk.cfg.dir.field.leave"), use: t("desk.cfg.dir.field.leaveUse"), attr: attrs[3] },
  ];
  const day = (d: string | null) => (d ? t.fmt.dateLong(new Date(`${d}T12:00:00Z`)) : "—");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{dir.source ? t(SOURCE_LABEL[dir.source]) : t("desk.cfg.dir.noSource")}</span>
              {dir.source && <Pill tone="ok">{t("desk.cfg.dir.sourceOfTruth")}</Pill>}
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {dir.lastSyncAt ? t("desk.cfg.dir.lastSync", { when: t.fmt.relative(new Date(dir.lastSyncAt)) }) : t("desk.cfg.dir.neverSynced")}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 3 }}>
              {t("desk.cfg.dir.people", { count: dir.people })} · {t("desk.cfg.dir.teams", { count: dir.departments })} ·{" "}
              {t("desk.cfg.dir.leaving", { count: dir.leaving })}
            </div>
          </div>
          <Link
            href="/app/desk/people"
            className="ohd-hover-edge-ink"
            style={linkButton}
          >
            {t("desk.cfg.dir.importCsv")}
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{t("desk.cfg.dir.frequency")}</span>
          <ConfigSeg
            section="directory"
            field="syncEveryMinutes"
            label={t("desk.cfg.dir.frequency")}
            disabled
            options={[
              { value: 15, label: t("desk.cfg.dir.freq15") },
              { value: 60, label: t("desk.cfg.dir.freq60") },
              { value: 1440, label: t("desk.cfg.dir.freq1440") },
            ]}
          />
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{apiSource ? t("desk.cfg.dir.freqApi") : t("desk.cfg.dir.freqPush")}</span>
        </div>
      </section>

      <Panel
        scroll
        minWidth={760}
        title={t("desk.cfg.dir.mapTitle")}
        hint={t("desk.cfg.dir.mapHint")}
        action={
          dir.withoutManager > 0 ? (
            <span style={{ padding: "4px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: "var(--dang-t)", color: "var(--dang)" }}>
              {t("desk.cfg.dir.noManager", { count: dir.withoutManager })}
            </span>
          ) : undefined
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, padding: "12px 18px", borderBottom: "1px solid var(--line)", background: "var(--sunk)", minWidth: 760 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", alignSelf: "end" }}>{t("desk.cfg.dir.field.person")}</div>
          {fields.map((f) => (
            <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{f.label}</span>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.35 }}>{f.use}</span>
              <span title={t("desk.cfg.dir.attrTitle")} style={{ ...mono, fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>
                {f.attr ?? t("desk.cfg.dir.attrNone")}
              </span>
            </div>
          ))}
        </div>
        {dir.preview.length === 0 && (
          <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.cfg.dir.empty")}</div>
        )}
        {dir.preview.map((p) => {
          const missing = !p.manager;
          return (
            <div
              key={p.id}
              style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, alignItems: "center", padding: "10px 18px", borderBottom: "1px solid var(--line-2)", fontSize: 13, background: missing ? "var(--dang-t)" : "transparent", minWidth: 760 }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title ?? p.email}</div>
              </div>
              <span style={{ color: p.department ? "var(--ink-2)" : "var(--ink-3)" }}>{p.department ?? "—"}</span>
              <span style={{ fontWeight: missing ? 600 : 450, color: missing ? "var(--dang)" : "var(--ink-2)" }}>{p.manager ?? t("desk.cfg.dir.managerMissing")}</span>
              <span style={{ color: "var(--ink-2)" }}>{day(p.startsOn)}</span>
              <span style={{ fontWeight: p.leavesOn ? 600 : 450, color: p.leavesOn ? "var(--wait)" : "var(--ink-3)" }}>{day(p.leavesOn)}</span>
            </div>
          );
        })}
        {dir.people > dir.preview.length && (
          <div style={{ padding: "11px 18px", fontSize: 12.5 }}>
            <Link href="/app/desk/people" style={{ color: "var(--brand-2)", fontWeight: 600 }}>
              {t("desk.cfg.dir.seeAll", { count: dir.people })}
            </Link>
          </div>
        )}
      </Panel>

      <ScimSection tenantId={tenantId} ent={ent} endpoint={`${proto}://${host}/api/scim/v2`} suffix={dir.scim.suffix} createdAt={dir.scim.createdAt} />

      <Panel title={t("desk.cfg.dir.deprovTitle")} hint={t("desk.cfg.dir.deprovHint")}>
        <DeprovisionRows />
      </Panel>
    </div>
  );
}

