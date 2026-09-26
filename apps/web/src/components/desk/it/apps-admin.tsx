"use client";

/**
 * SD-A2 — the application catalogue, as IT configures it (spec 19 §6).
 *
 * The list on the left, the selected application's configuration on the
 * right. Every control saves on its own ("Saved automatically"): a segmented
 * choice or a switch saves on click, a text field when it loses focus. Each
 * save is one desk API call, hence one audit line.
 */
import { useCallback, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";
import { AppIcon } from "@/components/desk/app-icon";
import { searchBrandIcons } from "@/components/desk/brand-icons";
import type { AdminApp, CatalogueAdminData, ConnectorKindName } from "@/lib/desk/it-data";
import { createAppAction, setAutoGroupsAction, setTiersAction, updateAppAction } from "@/app/app/desk/apps/actions";
import { btnStyle, card, Field, inputStyle, labelStyle, Overlay, Pill, Segmented, Switch, useToast } from "./ui";

const LEVEL_BADGE = [
  { key: "desk.it.apps.level0", c: "var(--ok)", t: "var(--ok-t)" },
  { key: "desk.it.apps.level1", c: "var(--open)", t: "var(--open-t)" },
  { key: "desk.it.apps.level2", c: "var(--viol)", t: "var(--viol-t)" },
] as const;

const GRID = "minmax(0,1.7fr) minmax(0,1fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.7fr)";

type Result = { ok: true } | { ok: false; error: string };

export function AppsAdmin({ data, canEdit, initialAppId }: { data: CatalogueAdminData; canEdit: boolean; initialAppId: string | null }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialAppId ?? data.apps[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const selected = data.apps.find((a) => a.id === selectedId) ?? data.apps[0] ?? null;
  const connectorOf = useMemo(() => new Map(data.connectors.map((c) => [c.id, c])), [data.connectors]);

  const provLabel = (a: AdminApp) => {
    const c = a.connectorId ? connectorOf.get(a.connectorId) : null;
    return c && c.kind !== "manual" ? t(`desk.it.provisioning.${c.kind}` as MessageKey) : t("desk.it.provisioning.manual");
  };

  return (
    <div className="h-full min-w-0 flex-1 overflow-auto" data-screen-label="SD-A2">
      <div className="flex flex-col" style={{ padding: "24px 28px 60px", gap: 18, maxWidth: 1240 }}>
        <div className="flex flex-wrap items-end" style={{ gap: 14 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1 style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 600, letterSpacing: "-.015em" }}>{t("desk.it.apps.title")}</h1>
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 2 }}>{t("desk.it.apps.subtitle")}</p>
          </div>
          {canEdit && (
            <button type="button" style={btnStyle("primary")} onClick={() => setCreating(true)}>
              {t("desk.it.apps.add")}
            </button>
          )}
        </div>

        {!canEdit && <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.it.apps.readOnly")}</p>}

        <div className="flex flex-wrap items-start" style={{ gap: 18 }}>
          <div style={{ ...card, flex: "1 1 520px", minWidth: 0, overflowX: "auto" }}>
            <div className="grid border-b" style={{ gridTemplateColumns: GRID, gap: 12, minWidth: 600, padding: "10px 16px", borderColor: "var(--line)", fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)" }}>
              <span>{t("desk.it.apps.colApp")}</span>
              <span>{t("desk.it.apps.colApproval")}</span>
              <span>{t("desk.it.apps.colProvisioning")}</span>
              <span>{t("desk.it.apps.colAuto")}</span>
              <span style={{ textAlign: "right" }}>{t("desk.it.apps.colSeats")}</span>
            </div>
            {data.apps.length === 0 && <p style={{ padding: "18px 16px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.it.apps.empty")}</p>}
            {data.apps.map((a) => {
              const on = selected?.id === a.id;
              const badge = LEVEL_BADGE[a.approvalLevels];
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  aria-pressed={on}
                  className="ohd-row grid w-full items-center border-b text-left"
                  style={
                    {
                      gridTemplateColumns: GRID,
                      gap: 12,
                      minWidth: 600,
                      padding: "10px 16px",
                      borderColor: "var(--line-2)",
                      fontSize: 13,
                      opacity: a.visible ? 1 : 0.55,
                      "--row-bg": on ? "var(--brand-t)" : "transparent",
                    } as CSSProperties
                  }
                >
                  <span className="flex min-w-0 items-center" style={{ gap: 10 }}>
                    <AppIcon name={a.name} iconKey={a.iconKey} logoUrl={a.logoUrl} color={a.color} size={30} />
                    <span className="min-w-0">
                      <span className="block truncate" style={{ fontWeight: 600 }}>{a.name}</span>
                      <span className="block truncate" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {a.visible ? a.category : t("desk.it.apps.hidden", { category: a.category })}
                      </span>
                    </span>
                  </span>
                  <span>
                    <Pill label={t(badge.key)} c={badge.c} t={badge.t} dot={false} />
                  </span>
                  <span style={{ color: "var(--ink-2)" }}>{provLabel(a)}</span>
                  <span style={{ color: "var(--ink-2)" }}>{a.autoGroupIds.length ? t("desk.it.apps.autoCount", { count: a.autoGroupIds.length }) : t("desk.it.common.none")}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                    {a.seatsPurchased != null ? t("desk.it.apps.seatsCell", { used: a.seatsUsed, total: a.seatsPurchased }) : t.fmt.number(a.seatsUsed)}
                  </span>
                </button>
              );
            })}
          </div>

          {selected && (
            <AppConfig
              key={selected.id}
              app={selected}
              data={data}
              canEdit={canEdit}
              onError={(msg) => toast(t("desk.it.common.error", { message: msg }), "error")}
              refresh={() => router.refresh()}
            />
          )}
        </div>
      </div>

      <NewAppDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setSelectedId(id);
          router.refresh();
        }}
      />
    </div>
  );
}

/* ---------- The configuration panel of one application ---------- */

type TierDraft = { id?: string; name: string; cost: string; privileged: boolean; externalGroup: string };

function AppConfig({
  app,
  data,
  canEdit,
  onError,
  refresh,
}: {
  app: AdminApp;
  data: CatalogueAdminData;
  canEdit: boolean;
  onError: (msg: string) => void;
  refresh: () => void;
}) {
  const t = useT();
  const [, start] = useTransition();
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Local mirror of the saved values: the controls answer at once, the server
  // confirms, and router.refresh() brings back the truth.
  const [levels, setLevels] = useState(app.approvalLevels);
  const [auto, setAuto] = useState(app.autoGroupIds);
  const [connectorId, setConnectorId] = useState(app.connectorId);
  const [maxDur, setMaxDur] = useState<number | null>(app.maxDurationDays);
  const [visible, setVisible] = useState(app.visible);
  const [ownerId, setOwnerId] = useState(app.ownerPersonId ?? "");
  const [text, setText] = useState({
    name: app.name,
    category: app.category,
    description: app.description,
    scimBaseUrl: app.scimBaseUrl ?? "",
    scimToken: "",
    seats: app.seatsPurchased == null ? "" : String(app.seatsPurchased),
    renewsOn: app.renewsOn ?? "",
    color: app.color ?? "#51625B",
  });
  const [iconKey, setIconKey] = useState(app.iconKey);
  const [iconQuery, setIconQuery] = useState("");
  const [tiers, setTiersDraft] = useState<TierDraft[]>(
    app.tiers.map((x) => ({ id: x.id, name: x.name, cost: (x.monthlyCostCents / 100).toString(), privileged: x.privileged, externalGroup: x.externalGroup ?? "" })),
  );

  const save = useCallback(
    (fn: () => Promise<Result>) => {
      if (!canEdit) return;
      setStatus("saving");
      start(async () => {
        const res = await fn();
        if (res.ok) {
          setStatus("saved");
          refresh();
        } else {
          setStatus("idle");
          onError(res.error);
        }
      });
    },
    [canEdit, onError, refresh],
  );

  const patch = (p: Parameters<typeof updateAppAction>[1]) => save(() => updateAppAction(app.id, p));

  const connector = connectorId ? data.connectors.find((c) => c.id === connectorId) : null;
  const ownerName = data.people.find((p) => p.id === ownerId)?.name ?? null;
  const chain = [
    t("desk.it.apps.chain0"),
    t("desk.it.apps.chain1"),
    ownerName ? t("desk.it.apps.chain2", { owner: ownerName }) : t("desk.it.apps.chain2NoOwner"),
  ][levels];

  const provDesc: Record<ConnectorKindName, MessageKey> = {
    manual: "desk.it.apps.provManualDesc",
    entra: "desk.it.apps.provEntraDesc",
    google: "desk.it.apps.provGoogleDesc",
    scim: "desk.it.apps.provScimDesc",
  };
  // A connector row of kind "manual" is the same thing as no connector: one "Manual" choice.
  const provOptions: Array<{ id: string | null; title: string; kind: ConnectorKindName; status?: string }> = [
    ...data.connectors.filter((c) => c.kind !== "manual").map((c) => ({ id: c.id, title: c.name, kind: c.kind, status: c.status })),
    { id: null, title: t("desk.it.provisioning.manual"), kind: "manual" as const },
  ];

  function saveTiers(next: TierDraft[]) {
    const payload = next
      .filter((x) => x.name.trim())
      .map((x) => ({
        id: x.id,
        name: x.name.trim(),
        monthlyCostCents: Math.max(0, Math.round((Number.parseFloat(x.cost.replace(",", ".")) || 0) * 100)),
        privileged: x.privileged,
        externalGroup: x.externalGroup.trim() || null,
      }));
    if (payload.length === 0) {
      onError(t("desk.it.apps.tiersNeedOne"));
      return;
    }
    // A blur that changed nothing must not write an audit line.
    const saved = app.tiers.map((x) => ({ id: x.id, name: x.name, monthlyCostCents: x.monthlyCostCents, privileged: x.privileged, externalGroup: x.externalGroup }));
    if (JSON.stringify(saved) === JSON.stringify(payload)) return;
    save(() => setTiersAction(app.id, payload));
  }

  const blurText = (field: keyof typeof text, apply: (v: string) => Parameters<typeof updateAppAction>[1] | null) => () => {
    const p = apply(text[field]);
    if (p) patch(p);
  };

  const iconResults = searchBrandIcons(iconQuery, 12);
  const disabled = !canEdit;
  const section: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

  return (
    <div
      style={{ ...card, flex: "1 1 340px", minWidth: 0, padding: 20, display: "flex", flexDirection: "column", gap: 20, position: "sticky", top: 0 }}
      aria-label={app.name}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <AppIcon name={text.name || app.name} iconKey={iconKey} logoUrl={app.logoUrl} color={text.color} size={42} />
        <div className="min-w-0 flex-1">
          <div style={{ fontFamily: "var(--font-title)", fontSize: 18, fontWeight: 600, letterSpacing: "-.01em" }}>{text.name || app.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            {ownerName ? t("desk.it.apps.ownerSub", { category: text.category, name: ownerName }) : t("desk.it.apps.noOwnerSub", { category: text.category })}
          </div>
        </div>
        <span aria-live="polite" style={{ fontSize: 11.5, fontWeight: 600, color: status === "saved" ? "var(--ok)" : "var(--ink-3)" }}>
          {status === "saving" ? t("desk.it.apps.saving") : status === "saved" ? t("desk.it.apps.saved") : ""}
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label={t("desk.it.apps.name")}>
          <input disabled={disabled} value={text.name} onChange={(e) => setText({ ...text, name: e.target.value })} onBlur={blurText("name", (v) => (v.trim() && v.trim() !== app.name ? { name: v.trim() } : null))} style={inputStyle} />
        </Field>
        <Field label={t("desk.it.apps.category")}>
          <input disabled={disabled} value={text.category} onChange={(e) => setText({ ...text, category: e.target.value })} onBlur={blurText("category", (v) => (v.trim() && v.trim() !== app.category ? { category: v.trim() } : null))} style={inputStyle} />
        </Field>
      </div>
      <Field label={t("desk.it.apps.description")}>
        <textarea
          disabled={disabled}
          rows={2}
          value={text.description}
          onChange={(e) => setText({ ...text, description: e.target.value })}
          onBlur={blurText("description", (v) => (v !== app.description ? { description: v } : null))}
          style={{ ...inputStyle, height: "auto", padding: "8px 11px", resize: "vertical" }}
        />
      </Field>

      <div style={section}>
        <span style={labelStyle}>{t("desk.it.apps.circuit")}</span>
        <Segmented
          disabled={disabled}
          value={levels}
          options={[
            { value: 0 as const, label: t("desk.it.apps.lv0") },
            { value: 1 as const, label: t("desk.it.apps.lv1") },
            { value: 2 as const, label: t("desk.it.apps.lv2") },
          ]}
          onChange={(v) => {
            setLevels(v);
            patch({ approvalLevels: v });
          }}
        />
        <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{chain}</p>
      </div>

      <div style={section}>
        <span style={labelStyle}>{t("desk.it.apps.auto")}</span>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: -4 }}>{t("desk.it.apps.autoHint")}</p>
        {data.groups.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.it.apps.autoNone")}</p>}
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {data.groups.map((g) => {
            const on = auto.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => {
                  const next = on ? auto.filter((x) => x !== g.id) : [...auto, g.id];
                  setAuto(next);
                  save(() => setAutoGroupsAction(app.id, next));
                }}
                style={{
                  padding: "5px 11px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${on ? "var(--brand-b)" : "var(--line)"}`,
                  background: on ? "var(--brand-t)" : "var(--panel)",
                  color: on ? "var(--brand)" : "var(--ink-2)",
                }}
              >
                {on ? "✓ " : "+ "}
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: 6 }}>
        <span style={labelStyle}>{t("desk.it.apps.prov")}</span>
        {data.connectors.every((c) => c.kind === "manual") && <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.it.apps.noConnectors")}</p>}
        {provOptions.map((o) => {
          const on = o.id === null ? !connector || connector.kind === "manual" : connectorId === o.id;
          return (
            <button
              key={o.id ?? "manual"}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => {
                setConnectorId(o.id);
                patch({ connectorId: o.id });
              }}
              className="flex items-start text-left"
              style={{ gap: 10, padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${on ? "var(--brand)" : "var(--line)"}`, background: on ? "var(--brand-t)" : "var(--panel)" }}
            >
              <span className="grid place-items-center" style={{ width: 15, height: 15, borderRadius: 99, border: `1.5px solid ${on ? "var(--brand)" : "var(--line)"}`, flex: "none", marginTop: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: on ? "var(--brand)" : "transparent" }} />
              </span>
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 13, fontWeight: 600 }}>
                  {o.title}
                  {o.id && o.title !== t(`desk.it.provisioning.${o.kind}` as MessageKey) && (
                    <span style={{ fontWeight: 500, color: "var(--ink-3)" }}> · {t(`desk.it.provisioning.${o.kind}` as MessageKey)}</span>
                  )}
                </span>
                <span className="block" style={{ fontSize: 12, color: "var(--ink-3)" }}>{t(provDesc[o.kind])}</span>
                {o.status === "error" && <span className="block" style={{ fontSize: 12, color: "var(--dang)", fontWeight: 600 }}>{t("desk.it.apps.connectorError")}</span>}
              </span>
            </button>
          );
        })}
        {connector?.kind === "scim" && (
          <div className="flex flex-col" style={{ gap: 10, marginTop: 6 }}>
            <Field label={t("desk.it.apps.scimBaseUrl")}>
              <input
                disabled={disabled}
                type="url"
                value={text.scimBaseUrl}
                placeholder="https://"
                onChange={(e) => setText({ ...text, scimBaseUrl: e.target.value })}
                onBlur={blurText("scimBaseUrl", (v) => (v.trim() !== (app.scimBaseUrl ?? "") ? { scimBaseUrl: v.trim() || null } : null))}
                style={inputStyle}
              />
            </Field>
            <Field
              label={t("desk.it.apps.scimToken")}
              hint={app.scimTokenHint ? t("desk.it.apps.scimTokenSet", { hint: `…${app.scimTokenHint}` }) : t("desk.it.apps.scimTokenEmpty")}
            >
              {/* Write-only: the saved token never comes back to the browser. */}
              <input
                disabled={disabled}
                type="password"
                autoComplete="new-password"
                value={text.scimToken}
                placeholder={t("desk.it.apps.scimTokenPlaceholder")}
                onChange={(e) => setText({ ...text, scimToken: e.target.value })}
                onBlur={() => {
                  const v = text.scimToken.trim();
                  if (!v) return;
                  patch({ scimToken: v });
                  setText((cur) => ({ ...cur, scimToken: "" }));
                }}
                style={inputStyle}
              />
            </Field>
          </div>
        )}
      </div>

      <div style={section}>
        <span style={labelStyle}>{t("desk.it.apps.maxDur")}</span>
        <Segmented
          disabled={disabled}
          value={maxDur == null ? "none" : String(maxDur)}
          options={[
            { value: "none", label: t("desk.it.apps.durUnlimited") },
            { value: "90", label: t("desk.it.apps.dur90") },
            { value: "30", label: t("desk.it.apps.dur30") },
          ]}
          onChange={(v) => {
            const days = v === "none" ? null : Number(v);
            setMaxDur(days);
            patch({ maxDurationDays: days });
          }}
        />
      </div>

      <div style={section}>
        <span style={labelStyle}>{t("desk.it.apps.tiers")}</span>
        <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,.8fr) auto minmax(0,1fr) auto", gap: 6, alignItems: "center", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>
          <span>{t("desk.it.apps.tierName")}</span>
          <span>{t("desk.it.apps.tierCost")}</span>
          <span>{t("desk.it.apps.tierPrivileged")}</span>
          <span>{t("desk.it.apps.tierGroup")}</span>
          <span />
          {tiers.map((tier, i) => {
            const set = (p: Partial<TierDraft>) => setTiersDraft((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <TierRow
                key={tier.id ?? `new-${i}`}
                tier={tier}
                disabled={disabled}
                onChange={set}
                onCommit={(p) => saveTiers(tiers.map((x, j) => (j === i ? { ...x, ...p } : x)))}
                onRemove={() => {
                  const next = tiers.filter((_, j) => j !== i);
                  if (next.filter((x) => x.name.trim()).length === 0) {
                    onError(t("desk.it.apps.tiersNeedOne"));
                    return;
                  }
                  setTiersDraft(next);
                  saveTiers(next);
                }}
                removeLabel={t("desk.it.apps.tierRemove")}
              />
            );
          })}
        </div>
        {canEdit && (
          <button
            type="button"
            className="self-start"
            onClick={() => setTiersDraft((cur) => [...cur, { name: "", cost: "0", privileged: false, externalGroup: "" }])}
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand-2)" }}
          >
            {t("desk.it.apps.tierAdd")}
          </button>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr", gap: 10 }}>
        <Field label={t("desk.it.apps.owner")}>
          <select
            disabled={disabled}
            value={ownerId}
            onChange={(e) => {
              setOwnerId(e.target.value);
              patch({ ownerPersonId: e.target.value || null });
            }}
            style={inputStyle}
          >
            <option value="">{t("desk.it.apps.ownerNone")}</option>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.department ? `${p.name} · ${p.department}` : p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={section}>
        <span style={labelStyle}>{t("desk.it.apps.contract")}</span>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("desk.it.apps.seatsPurchased")}>
            <input
              disabled={disabled}
              type="number"
              min={0}
              inputMode="numeric"
              value={text.seats}
              onChange={(e) => setText({ ...text, seats: e.target.value })}
              onBlur={blurText("seats", (v) => {
                const n = v.trim() === "" ? null : Math.max(0, Math.floor(Number(v)));
                return n !== app.seatsPurchased && (n === null || Number.isFinite(n)) ? { seatsPurchased: n } : null;
              })}
              style={inputStyle}
            />
          </Field>
          <Field label={t("desk.it.apps.renewsOn")}>
            <input
              disabled={disabled}
              type="date"
              value={text.renewsOn}
              onChange={(e) => setText({ ...text, renewsOn: e.target.value })}
              onBlur={blurText("renewsOn", (v) => (v !== (app.renewsOn ?? "") ? { renewsOn: v || null } : null))}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      <div style={section}>
        <span style={labelStyle}>{t("desk.it.apps.icon")}</span>
        <div className="flex items-center" style={{ gap: 8 }}>
          <input
            disabled={disabled}
            type="search"
            value={iconQuery}
            onChange={(e) => setIconQuery(e.target.value)}
            placeholder={t("desk.it.apps.iconSearch")}
            style={{ ...inputStyle, flex: 1 }}
          />
          <label className="flex items-center" style={{ gap: 6, fontSize: 12, color: "var(--ink-3)" }} title={t("desk.it.apps.iconColor")}>
            <input
              disabled={disabled}
              type="color"
              aria-label={t("desk.it.apps.iconColor")}
              value={text.color}
              onChange={(e) => setText({ ...text, color: e.target.value })}
              onBlur={blurText("color", (v) => (v !== (app.color ?? "") ? { color: v } : null))}
              style={{ width: 36, height: 36, padding: 2, borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel)" }}
            />
          </label>
        </div>
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          <IconChoice on={!iconKey} disabled={disabled} label={t("desk.it.apps.iconInitials")} onPick={() => { setIconKey(null); patch({ iconKey: null }); }}>
            <AppIcon name={text.name || app.name} color={text.color} size={30} />
          </IconChoice>
          {iconKey && !iconResults.some((r) => r.key === iconKey) && (
            <IconChoice on disabled={disabled} label={iconKey} onPick={() => {}}>
              <AppIcon name={app.name} iconKey={iconKey} size={30} />
            </IconChoice>
          )}
          {iconResults.map((r) => (
            <IconChoice key={r.key} on={iconKey === r.key} disabled={disabled} label={r.title} onPick={() => { setIconKey(r.key); patch({ iconKey: r.key }); }}>
              <AppIcon name={r.title} iconKey={r.key} size={30} />
            </IconChoice>
          ))}
        </div>
      </div>

      <div className="flex items-center border-t" style={{ gap: 10, paddingTop: 14, borderColor: "var(--line-2)" }}>
        <span className="flex-1" style={{ fontSize: 13, fontWeight: 600 }}>{t("desk.it.apps.visible")}</span>
        <Switch
          disabled={disabled}
          on={visible}
          label={t("desk.it.apps.visible")}
          onChange={(v) => {
            setVisible(v);
            patch({ visible: v });
          }}
        />
      </div>
      <p style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{t("desk.it.apps.savedNote")}</p>
    </div>
  );
}

function IconChoice({ on, disabled, label, onPick, children }: { on: boolean; disabled: boolean; label: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onPick}
      className="grid place-items-center"
      style={{ width: 40, height: 40, borderRadius: 10, border: `1.5px solid ${on ? "var(--brand)" : "transparent"}`, background: on ? "var(--brand-t)" : "transparent" }}
    >
      {children}
    </button>
  );
}

function TierRow({
  tier,
  disabled,
  onChange,
  onCommit,
  onRemove,
  removeLabel,
}: {
  tier: TierDraft;
  disabled: boolean;
  onChange: (p: Partial<TierDraft>) => void;
  onCommit: (p: Partial<TierDraft>) => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  const small: CSSProperties = { ...inputStyle, height: 32, fontSize: 12.5, padding: "0 8px" };
  return (
    <>
      <input disabled={disabled} value={tier.name} onChange={(e) => onChange({ name: e.target.value })} onBlur={() => onCommit({})} style={small} />
      <input disabled={disabled} inputMode="decimal" value={tier.cost} onChange={(e) => onChange({ cost: e.target.value })} onBlur={() => onCommit({})} style={{ ...small, textAlign: "right" }} />
      <span className="grid place-items-center">
        <input
          type="checkbox"
          disabled={disabled}
          checked={tier.privileged}
          onChange={(e) => {
            onChange({ privileged: e.target.checked });
            onCommit({ privileged: e.target.checked });
          }}
        />
      </span>
      <input disabled={disabled} value={tier.externalGroup} onChange={(e) => onChange({ externalGroup: e.target.value })} onBlur={() => onCommit({})} style={small} />
      <button type="button" disabled={disabled} onClick={onRemove} aria-label={removeLabel} title={removeLabel} className="ohd-hover grid place-items-center" style={{ width: 28, height: 28, borderRadius: 8, color: "var(--ink-3)" }}>
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </>
  );
}

function NewAppDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  return (
    <Overlay open={open} onClose={onClose} title={t("desk.it.apps.newTitle")}>
      <form
        className="flex flex-col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createAppAction({ name, category });
            if (res.ok) {
              setName("");
              setCategory("");
              onCreated(res.value);
            } else toast(t("desk.it.common.error", { message: res.error }), "error");
          });
        }}
      >
        <Field label={t("desk.it.apps.name")}>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={t("desk.it.apps.category")}>
          <input required value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle} />
        </Field>
        <div className="flex justify-end" style={{ gap: 8 }}>
          <button type="button" className="ohd-hover" style={btnStyle("ghost")} onClick={onClose}>
            {t("desk.it.common.cancel")}
          </button>
          <button type="submit" disabled={pending || !name.trim() || !category.trim()} style={btnStyle("primary")}>
            {t("desk.it.apps.newCreate")}
          </button>
        </div>
      </form>
    </Overlay>
  );
}
