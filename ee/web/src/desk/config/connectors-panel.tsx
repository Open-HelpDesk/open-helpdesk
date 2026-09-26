"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";
import { AppIcon } from "@/components/desk/app-icon";
import { Btn, Panel, Pill, useCfg } from "@/components/desk/config/primitives";
import { eyebrow, inputCss, mono } from "@/components/desk/config/styles";
import { Labeled } from "@/components/desk/config/delegations-panel";
import { deleteConnectorAction, saveConnectorAction, testConnectorAction } from "./actions";
import type { ConnectorKind, ConnectorView, ConnectorsData, MappingRow, ScimAppToken } from "./data";

type Kind = ConnectorKind | "manual";
const KINDS: Kind[] = ["entra", "google", "scim", "manual"];
const KIND_LABEL: Record<Kind, MessageKey> = {
  entra: "desk.cfg.conn.kind.entra",
  google: "desk.cfg.conn.kind.google",
  scim: "desk.cfg.conn.kind.scim",
  manual: "desk.cfg.conn.kind.manual",
};
const STATUS: Record<ConnectorView["status"], { tone: "ok" | "dang" | "wait" | "neutral"; label: MessageKey }> = {
  connected: { tone: "ok", label: "desk.cfg.conn.status.connected" },
  error: { tone: "dang", label: "desk.cfg.conn.status.error" },
  disabled: { tone: "neutral", label: "desk.cfg.conn.status.disabled" },
  pending: { tone: "wait", label: "desk.cfg.conn.status.pending" },
};
/** Settings fields and write-only secrets per kind — the same list as the save action. */
const FIELDS: Record<ConnectorKind, { settings: Array<{ key: string; label: MessageKey; placeholder: string }>; secrets: Array<{ key: string; label: MessageKey; multiline?: boolean }> }> = {
  entra: {
    settings: [
      { key: "tenantId", label: "desk.cfg.conn.f.tenantId", placeholder: "contoso.onmicrosoft.com" },
      { key: "clientId", label: "desk.cfg.conn.f.clientId", placeholder: "00000000-0000-0000-0000-000000000000" },
    ],
    secrets: [{ key: "clientSecret", label: "desk.cfg.conn.f.clientSecret" }],
  },
  google: {
    settings: [
      { key: "domain", label: "desk.cfg.conn.f.domain", placeholder: "example.com" },
      { key: "adminEmail", label: "desk.cfg.conn.f.adminEmail", placeholder: "admin@example.com" },
    ],
    secrets: [{ key: "serviceAccountKey", label: "desk.cfg.conn.f.serviceAccount", multiline: true }],
  },
  scim: { settings: [], secrets: [] },
};

const DAY = 86_400_000;
const daysUntil = (iso: string) => Math.ceil((new Date(`${iso}T12:00:00Z`).getTime() - Date.now()) / DAY);

export function ConnectorsPanel({ data }: { data: ConnectorsData }) {
  const t = useT();
  const first = data.connectors[0]?.kind ?? "entra";
  const [kind, setKind] = useState<Kind>(first);
  const byKind = (k: ConnectorKind) => data.connectors.find((c) => c.kind === k) ?? null;

  const expiring = (id: string | undefined) =>
    (id ? data.scimTokens[id] ?? [] : []).filter((x) => x.hasToken && x.expiresOn && daysUntil(x.expiresOn) <= 30).sort((a, b) => (a.expiresOn! < b.expiresOn! ? -1 : 1));

  const card = (k: Kind) => {
    const c = k === "manual" ? null : byKind(k);
    const apps = k === "manual" ? data.manualApps.length : c?.apps ?? 0;
    const status =
      k === "manual" ? (
        <Pill tone="wait">{t("desk.cfg.conn.status.itTask")}</Pill>
      ) : c ? (
        <Pill tone={STATUS[c.status].tone}>{t(STATUS[c.status].label)}</Pill>
      ) : (
        <Pill tone="neutral">{t("desk.cfg.conn.status.none")}</Pill>
      );
    const warn = k === "scim" ? expiring(c?.id)[0] : undefined;
    const on = k === kind;
    return (
      <button
        key={k}
        type="button"
        aria-pressed={on}
        onClick={() => setKind(k)}
        style={{ textAlign: "left", borderRadius: 12, padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, background: on ? "var(--brand-t)" : "var(--panel)", border: `1.5px solid ${on ? "var(--brand)" : "var(--line)"}` }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t(KIND_LABEL[k])}</span>
          {status}
        </span>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {t("desk.cfg.conn.apps", { count: apps })} · {meta(k, c)}
        </span>
        {warn && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--wait)" }}>{tokenWarning(warn)}</span>}
        {c?.status === "error" && c.lastError && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dang)" }}>{c.lastError}</span>}
      </button>
    );
  };

  const meta = (k: Kind, c: ConnectorView | null) => {
    if (k === "manual") return t("desk.cfg.conn.meta.manual");
    if (k === "scim") return t("desk.cfg.conn.meta.scim");
    const tenant = c?.settings.tenantId || c?.settings.tenant;
    if (k === "entra") return tenant ? t("desk.cfg.conn.meta.entraTenant", { tenant }) : t("desk.cfg.conn.meta.entra");
    return c?.settings.domain ? t("desk.cfg.conn.meta.googleDomain", { domain: c.settings.domain }) : t("desk.cfg.conn.meta.google");
  };

  const tokenWarning = (x: ScimAppToken) => {
    const d = daysUntil(x.expiresOn!);
    return d < 0 ? t("desk.cfg.conn.tokenExpired", { app: x.app }) : t("desk.cfg.conn.tokenExpires", { app: x.app, count: d });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>{KINDS.map(card)}</div>
      {kind === "manual" ? (
        <ManualDetail apps={data.manualApps} />
      ) : (
        <ConnectorDetail
          key={kind}
          kind={kind}
          connector={byKind(kind)}
          meta={meta(kind, byKind(kind))}
          mapping={byKind(kind) ? data.mappings[byKind(kind)!.id] ?? [] : []}
          tokens={byKind(kind) ? data.scimTokens[byKind(kind)!.id] ?? [] : []}
          runs={byKind(kind) ? data.runs[byKind(kind)!.id] ?? [] : []}
        />
      )}
    </div>
  );
}

function ManualDetail({ apps }: { apps: MappingRow[] }) {
  const t = useT();
  return (
    <Panel title={t("desk.cfg.conn.kind.manual")} hint={t("desk.cfg.conn.manualHint")}>
      <div style={{ ...eyebrow, padding: "10px 18px", borderBottom: "1px solid var(--line-2)" }}>{t("desk.cfg.conn.map.manual")}</div>
      {apps.length === 0 && <div style={{ padding: "12px 18px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.cfg.conn.manualEmpty")}</div>}
      {apps.map((a) => (
        <div key={a.appId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap" }}>
          <AppIcon name={a.app} iconKey={a.iconKey} color={a.color} size={26} />
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 150 }}>{a.app}</span>
          <span style={{ flex: 1 }} />
          <span style={{ ...mono, color: "var(--ink-2)" }}>{t("desk.cfg.conn.itTaskTarget")}</span>
        </div>
      ))}
    </Panel>
  );
}

function ConnectorDetail({
  kind,
  connector,
  meta,
  mapping,
  tokens,
  runs,
}: {
  kind: ConnectorKind;
  connector: ConnectorView | null;
  meta: string;
  mapping: MappingRow[];
  tokens: ScimAppToken[];
  runs: ConnectorsData["runs"][string];
}) {
  const t = useT();
  const router = useRouter();
  const { toast, track } = useCfg();
  const fields = FIELDS[kind];
  const [name, setName] = useState(connector?.name ?? t(KIND_LABEL[kind]));
  const [settings, setSettings] = useState<Record<string, string>>(() => ({ ...(connector?.settings ?? {}), ...Object.fromEntries(fields.settings.map((f) => [f.key, connector?.settings[f.key] ?? ""])) }));
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await track(saveConnectorAction({ id: connector?.id, kind, name, settings, secrets }));
      if (!res.ok) return toast(res.error, "dang");
      setSecrets({});
      toast(connector ? t("desk.cfg.conn.saved") : t("desk.cfg.conn.created"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!connector) return;
    setBusy(true);
    try {
      const res = await track(testConnectorAction(connector.id));
      if (!res.ok) return toast(res.error, "dang");
      if (res.value.ok) toast(t("desk.cfg.conn.testOk", { name: connector.name, ms: res.value.ms }));
      else toast(t("desk.cfg.conn.testFailed", { name: connector.name, message: res.value.message }), "dang");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!connector || !window.confirm(t("desk.cfg.conn.deleteConfirm", { name: connector.name, count: connector.apps }))) return;
    const res = await track(deleteConnectorAction(connector.id));
    if (!res.ok) return toast(res.error, "dang");
    toast(t("desk.cfg.conn.deleted"));
    router.refresh();
  };

  const mapTitle = kind === "scim" ? t("desk.cfg.conn.map.scim") : kind === "google" ? t("desk.cfg.conn.map.google") : t("desk.cfg.conn.map.entra");

  return (
    <section style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{connector?.name ?? t(KIND_LABEL[kind])}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            {meta}
            {connector?.lastOkAt ? ` · ${t("desk.cfg.conn.lastOk", { when: t.fmt.relative(new Date(connector.lastOkAt)) })}` : ""}
          </div>
        </div>
        {connector && (
          <>
            <Btn onClick={test} disabled={busy}>
              {t("desk.cfg.conn.test")}
            </Btn>
            <Btn tone="danger" onClick={remove} disabled={busy}>
              {t("desk.cfg.conn.delete")}
            </Btn>
          </>
        )}
      </div>

      {connector?.status === "error" && connector.lastError && (
        <div style={{ padding: "10px 18px", background: "var(--dang-t)", color: "var(--dang)", fontSize: 12.5, fontWeight: 600, borderBottom: "1px solid var(--line-2)" }}>
          {t("desk.cfg.conn.lastError", { message: connector.lastError })}
        </div>
      )}

      <div style={{ ...eyebrow, padding: "10px 18px", borderBottom: "1px solid var(--line-2)" }}>{t("desk.cfg.conn.settings")}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "12px 18px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap" }}>
        <Labeled label={t("desk.cfg.conn.f.name")}>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputCss, width: 200 }} />
        </Labeled>
        {fields.settings.map((f) => (
          <Labeled key={f.key} label={t(f.label)}>
            <input
              value={settings[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
              style={{ ...inputCss, ...mono, fontSize: 12.5, width: 290 }}
            />
          </Labeled>
        ))}
        {fields.secrets.map((f) => (
          <Labeled key={f.key} label={t(f.label)}>
            {f.multiline ? (
              <textarea
                value={secrets[f.key] ?? ""}
                placeholder={connector?.hasSecrets ? t("desk.cfg.conn.secretStored") : t("desk.cfg.conn.secretPaste")}
                onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                style={{ ...inputCss, ...mono, fontSize: 11.5, height: 70, padding: "8px 11px", width: 420, resize: "vertical" }}
              />
            ) : (
              <input
                type="password"
                value={secrets[f.key] ?? ""}
                autoComplete="new-password"
                placeholder={connector?.hasSecrets ? t("desk.cfg.conn.secretStored") : t("desk.cfg.conn.secretType")}
                onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))}
                style={{ ...inputCss, width: 240 }}
              />
            )}
          </Labeled>
        ))}
        <Btn tone="primary" onClick={save} disabled={busy || !name.trim()}>
          {connector ? t("desk.cfg.conn.save") : t("desk.cfg.conn.create")}
        </Btn>
      </div>
      {kind === "scim" && <div style={{ padding: "10px 18px", fontSize: 12.5, color: "var(--ink-3)", borderBottom: "1px solid var(--line-2)" }}>{t("desk.cfg.conn.scimHelp")}</div>}

      <div style={{ ...eyebrow, padding: "10px 18px", borderBottom: "1px solid var(--line-2)" }}>{mapTitle}</div>
      {kind === "scim" ? (
        tokens.length === 0 ? (
          <Empty text={t("desk.cfg.conn.mapEmpty")} />
        ) : (
          tokens.map((x) => {
            const d = x.expiresOn ? daysUntil(x.expiresOn) : null;
            const color = !x.hasToken || (d !== null && d < 0) ? "var(--dang)" : d !== null && d <= 30 ? "var(--wait)" : "var(--ink-2)";
            const label = !x.hasToken
              ? t("desk.cfg.conn.tokenMissing")
              : x.expiresOn === null
                ? t("desk.cfg.conn.tokenNoExpiry")
                : d !== null && d <= 30
                  ? t("desk.cfg.conn.tokenExpiresOn", { date: t.fmt.dateShort(new Date(`${x.expiresOn}T12:00:00Z`)) })
                  : t("desk.cfg.conn.tokenValid", { date: t.fmt.dateShort(new Date(`${x.expiresOn}T12:00:00Z`)) });
            return (
              <div key={x.appId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap" }}>
                <AppIcon name={x.app} iconKey={x.iconKey} color={x.color} size={26} />
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 150 }}>{x.app}</span>
                <span style={{ ...mono, fontSize: 11.5, color: "var(--ink-3)", minWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{x.baseUrl ?? t("desk.cfg.conn.noBaseUrl")}</span>
                <span style={{ flex: 1 }} />
                <span style={{ ...mono, color, fontWeight: color === "var(--ink-2)" ? 450 : 600 }}>{label}</span>
              </div>
            );
          })
        )
      ) : mapping.length === 0 ? (
        <Empty text={t("desk.cfg.conn.mapEmpty")} />
      ) : (
        mapping.map((m, i) => (
          <div key={`${m.appId}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap" }}>
            <AppIcon name={m.app} iconKey={m.iconKey} color={m.color} size={26} />
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 150 }}>{m.app}</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)", minWidth: 120 }}>{m.tier ?? "—"}</span>
            <span style={{ flex: 1 }} />
            <span style={{ ...mono, color: m.target ? "var(--ink-2)" : "var(--wait)", fontWeight: m.target ? 450 : 600 }}>{m.target ?? t("desk.cfg.conn.notMapped")}</span>
          </div>
        ))
      )}

      <div style={{ ...eyebrow, padding: "10px 18px", borderBottom: "1px solid var(--line-2)", background: "var(--sunk)" }}>{t("desk.cfg.conn.runs")}</div>
      {runs.length === 0 && <Empty text={connector ? t("desk.cfg.conn.runsEmpty") : t("desk.cfg.conn.notConfigured")} />}
      {runs.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 18px", borderBottom: "1px solid var(--line-2)", fontSize: 12.5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, flex: "none", background: r.level === "error" || r.level === "err" ? "var(--dang)" : r.level === "warn" ? "var(--wait)" : "var(--ok)" }} />
          <span style={{ ...mono, fontSize: 11.5, color: "var(--ink-3)", minWidth: 96 }}>{t.fmt.messageTime(new Date(r.at))}</span>
          <span style={{ color: "var(--ink-2)" }}>{r.message}</span>
        </div>
      ))}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: "12px 18px", fontSize: 13, color: "var(--ink-3)", borderBottom: "1px solid var(--line-2)" }}>{text}</div>;
}
