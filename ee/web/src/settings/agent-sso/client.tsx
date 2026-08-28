"use client";

/**
 * ST-13 — Client components: "Copy" link as accent text, enforcement radios as
 * cards (red warning on "Enforced for everyone"), SCIM endpoint (token shown
 * only once) and editable group mapping.
 */
import { useActionState, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { ScimTokenState } from "./actions";

const inputStyle = {
  borderColor: "var(--line)",
  background: "var(--bg)",
  color: "var(--ink)",
} as const;

/** Table control — height 32, padding 6/10, radius 6, 12.5 px. */
const CELL: React.CSSProperties = {
  minHeight: 32,
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 12.5,
  ...inputStyle,
};

/** "Copy" as accent text (12.5 px/600) — no frame, as in the design. */
export function CopyLink({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1800);
      }}
      className="whitespace-nowrap font-semibold"
      style={{ fontSize: 12.5, color: copied ? "var(--ok)" : "var(--acc-2)" }}
    >
      {copied ? t("app.settings.sso.copied") : (label ?? t("app.settings.sso.copy"))}
    </button>
  );
}

export function EnforcementRadios({
  initial,
}: {
  initial: "optional" | "verified_domains" | "all";
}) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const enforcements: {
    value: "optional" | "verified_domains" | "all";
    title: string;
    desc: string;
  }[] = [
    {
      value: "optional",
      title: t("app.settings.sso.optional"),
      desc: t("app.settings.sso.enforcementOptionalDesc"),
    },
    {
      value: "verified_domains",
      title: t("app.settings.sso.enforcementDomainsTitle"),
      desc: t("app.settings.sso.enforcementDomainsDesc"),
    },
    {
      value: "all",
      title: t("app.settings.sso.enforcementAllTitle"),
      desc: t("app.settings.sso.enforcementAllDesc"),
    },
  ];
  return (
    <div className="flex flex-col" style={{ gap: 9 }}>
      <div className="flex flex-col" style={{ gap: 9 }}>
        {enforcements.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value}
              className="ohd-hover-edge-fill flex cursor-pointer items-start border"
              style={{
                gap: 12,
                padding: "13px 14px",
                borderRadius: 9,
                borderColor: on ? "var(--acc)" : "var(--line)",
                background: on ? "var(--acc-t)" : "var(--panel)",
              }}
            >
              <input
                type="radio"
                name="enforcement"
                value={o.value}
                checked={on}
                onChange={() => setValue(o.value)}
                className="sr-only"
              />
              <span
                className="grid flex-none place-items-center rounded-full"
                style={{
                  width: 17,
                  height: 17,
                  marginTop: 1,
                  border: `1.5px solid ${on ? "var(--acc)" : "var(--line)"}`,
                }}
              >
                <span
                  className="rounded-full"
                  style={{ width: 9, height: 9, background: on ? "var(--acc)" : "transparent" }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block font-semibold"
                  style={{ fontSize: 13.5, color: on ? "var(--acc)" : "var(--ink)" }}
                >
                  {o.title}
                </span>
                <span
                  className="block"
                  style={{ fontSize: 12.5, color: "var(--ink-2)", textWrap: "pretty" }}
                >
                  {o.desc}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {value === "all" && (
        <p
          className="border"
          style={{
            padding: "12px 14px",
            borderRadius: 9,
            fontSize: 12.5,
            borderColor: "var(--dang)",
            background: "var(--dang-t)",
            color: "var(--dang)",
            textWrap: "pretty",
          }}
        >
          {t("app.settings.sso.enforcementAllWarning")}
        </p>
      )}
    </div>
  );
}

/**
 * SCIM endpoint: base URL (copyable) + regeneratable bearer token. The clear
 * token is shown only once, when the server action returns.
 */
export function ScimEndpoint({
  url,
  hint,
  action,
}: {
  url: string;
  hint: string | null;
  action: (prev: ScimTokenState, formData: FormData) => Promise<ScimTokenState>;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, null);
  const token = state ? state.token : hint;

  return (
    <div
      className="overflow-hidden border"
      style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--panel)" }}
    >
      <div
        className="grid items-center border-b"
        style={{
          gridTemplateColumns: "170px 1fr 80px",
          gap: 12,
          padding: "12px 15px",
          borderColor: "var(--line-2)",
        }}
      >
        <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          {t("app.settings.sso.scimBaseUrl")}
        </span>
        <span className="min-w-0 truncate font-mono" style={{ fontSize: 12.5, color: "var(--ink)" }}>
          {url}
        </span>
        <span className="text-right">
          <CopyLink text={url} />
        </span>
      </div>
      <div
        className="grid items-center border-b"
        style={{
          gridTemplateColumns: "170px 1fr 80px",
          gap: 12,
          padding: "12px 15px",
          borderColor: "var(--line-2)",
        }}
      >
        <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          {t("app.settings.sso.scimToken")}
        </span>
        <span
          className="min-w-0 truncate font-mono"
          style={{ fontSize: 12.5, color: state ? "var(--ink)" : "var(--ink-3)" }}
        >
          {token ?? t("app.settings.sso.scimNoToken")}
        </span>
        <span className="flex items-center justify-end" style={{ gap: 10 }}>
          {state && <CopyLink text={state.token} />}
          <form action={formAction}>
            <button
              type="submit"
              disabled={pending}
              className="whitespace-nowrap font-semibold disabled:opacity-50"
              style={{ fontSize: 12.5, color: "var(--acc-2)" }}
            >
              {pending
                ? "…"
                : token
                  ? t("app.settings.sso.scimRegenerate")
                  : t("app.settings.sso.scimGenerate")}
            </button>
          </form>
        </span>
      </div>
      <div
        style={{
          padding: "11px 15px",
          background: "var(--wait-t)",
          fontSize: 12.5,
          color: "var(--wait)",
          textWrap: "pretty",
        }}
      >
        {t("app.settings.sso.scimTokenWarning")}
      </div>
    </div>
  );
}

type GroupRow = { group: string; team: string; role: string };

const GROUP_GRID = "minmax(180px,1.2fr) 34px minmax(150px,1fr) minmax(130px,1fr) 90px";

export function ScimGroupsField({
  initial,
  teams,
  formId,
}: {
  initial: GroupRow[];
  teams: { id: string; name: string }[];
  /** Host form (`form=` attribute) — the save bar lives elsewhere. */
  formId?: string;
}) {
  const t = useT();
  const [rows, setRows] = useState<GroupRow[]>(
    initial.length > 0 ? initial : [{ group: "", team: "", role: "agent" }],
  );

  function update(i: number, next: Partial<GroupRow>) {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...next } : r)));
  }

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div
        className="overflow-x-auto border"
        style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <div
          className="grid items-center border-b"
          style={{
            gridTemplateColumns: GROUP_GRID,
            minWidth: 700,
            height: 40,
            padding: "0 15px",
            background: "var(--canvas)",
            borderColor: "var(--line)",
            fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".09em",
            color: "var(--ink-3)",
          }}
        >
          <span>{t("app.settings.sso.colIdpGroup")}</span>
          <span />
          <span>{t("app.settings.sso.team")}</span>
          <span>{t("app.settings.sso.colAssignedRole")}</span>
          <span className="text-right">{t("app.settings.sso.colMembers")}</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid items-center border-b"
            style={{
              gridTemplateColumns: GROUP_GRID,
              minWidth: 700,
              padding: "11px 15px",
              gap: 9,
              borderColor: "var(--line-2)",
              fontSize: 12.5,
            }}
          >
            <input
              name="g_group"
              form={formId}
              value={r.group}
              onChange={(e) => update(i, { group: e.target.value })}
              placeholder="ohd-agents-n1"
              className="min-w-0 border font-mono"
              style={{ ...CELL, fontSize: 12 }}
            />
            <span className="text-center" style={{ color: "var(--ink-3)" }}>
              →
            </span>
            <select
              name="g_team"
              form={formId}
              value={r.team}
              onChange={(e) => update(i, { team: e.target.value })}
              className="min-w-0 border"
              style={CELL}
            >
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              name="g_role"
              form={formId}
              value={r.role}
              onChange={(e) => update(i, { role: e.target.value })}
              className="min-w-0 border"
              style={CELL}
            >
              <option value="admin">{t("app.settings.sso.roleAdmin")}</option>
              <option value="agent">{t("app.settings.sso.roleAgent")}</option>
              <option value="viewer">{t("app.settings.sso.roleViewer")}</option>
            </select>
            <span className="flex items-center justify-end" style={{ gap: 10 }}>
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                aria-label={t("app.settings.sso.removeMapping")}
                style={{ fontSize: 12, color: "var(--ink-3)" }}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows([...rows, { group: "", team: "", role: "agent" }])}
        className="self-start font-medium"
        style={{ fontSize: 12.5, color: "var(--acc-2)" }}
      >
        {t("app.settings.sso.addMapping")}
      </button>
    </div>
  );
}
