"use client";

/** Interactive pieces of AG-02 — Onboarding. */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { saveIdentity, inviteTeam } from "./actions";

/** Accent color swatches from the design (step 1). */
export const ACCENT_SWATCHES = ["#0B5F46", "#1D4ED8", "#6D28D9", "#C0342B", "#B45309"];

/* ---------- Step 1 — Identity ---------- */

export function IdentityForm({
  initialName,
  initialAccent,
}: {
  initialName: string;
  initialAccent: string;
}) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [accent, setAccent] = useState(
    ACCENT_SWATCHES.includes(initialAccent) ? initialAccent : ACCENT_SWATCHES[0]!,
  );

  return (
    <form action={saveIdentity} className="flex flex-col gap-5">
      <input type="hidden" name="accentColor" value={accent} />

      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        {t("app.settings.workspace.generalNameLabel")}
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border px-3 text-sm font-normal outline-none"
          style={{
            height: 36,
            borderRadius: 6,
            borderColor: "var(--line)",
            background: "var(--bg)",
            maxWidth: 360,
          }}
        />
      </label>

      {/* Logo — informational dropzone */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center font-bold text-white"
          style={{ width: 52, height: 52, borderRadius: 12, background: accent, fontSize: 22 }}
          aria-hidden
        >
          {name[0]?.toUpperCase() ?? "A"}
        </div>
        <div
          className="flex flex-1 items-center justify-center border border-dashed px-4 text-[12.5px]"
          style={{
            height: 52,
            borderRadius: 8,
            borderColor: "var(--line)",
            color: "var(--ink-3)",
            maxWidth: 300,
          }}
        >
          {t("app.onboarding.logoDrop")}
        </div>
      </div>

      {/* Accent swatches */}
      <div>
        <p className="mb-2 text-[13px] font-medium">
          {t("app.settings.workspace.generalAccentLabel")}
        </p>
        <div className="flex items-center gap-2.5">
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAccent(c)}
              title={c}
              aria-pressed={accent === c}
              className="rounded-full"
              style={{
                width: 26,
                height: 26,
                background: c,
                border: "2px solid var(--bg)",
                outline: accent === c ? `2px solid ${c}` : "2px solid transparent",
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
      </div>

      {/* Mock portal preview */}
      <div
        className="overflow-hidden border"
        style={{ borderRadius: 10, borderColor: "var(--line)", background: "var(--bg)" }}
      >
        <div
          className="flex flex-col items-center gap-2.5 px-6 py-7 text-center"
          style={{ background: accent }}
        >
          {/* The preview shows the portal: this really is its title, not a duplicate. */}
          <p className="text-[15px] font-semibold text-white">{t("home.title")}</p>
          <div
            className="w-full rounded-md bg-white px-3 py-2 text-left text-[12.5px]"
            style={{ maxWidth: 320, color: "var(--ink-3)" }}
          >
            {t("app.onboarding.previewSearch")}
          </div>
        </div>
        <p className="px-4 py-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {t("app.onboarding.previewCaption")}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="rounded-md px-5 text-sm font-semibold text-white"
          style={{ height: 38, background: "var(--acc)" }}
        >
          {t("app.onboarding.continue")}
        </button>
        <a href="/onboarding?step=2" className="text-[13px] hover:underline" style={{ color: "var(--ink-3)" }}>
          {t("app.onboarding.skip")}
        </a>
      </div>
    </form>
  );
}

/* ---------- Step 2 — Copy the address ---------- */

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="shrink-0 rounded-md border px-3 text-[12.5px] font-medium"
      style={{
        height: 30,
        borderColor: "var(--line)",
        background: "var(--bg)",
        color: copied ? "var(--acc-2)" : "var(--ink)",
      }}
    >
      {copied ? t("app.onboarding.copied") : (label ?? t("app.onboarding.copy"))}
    </button>
  );
}

/* ---------- Step 3 — Team ---------- */

export function TeamInviteForm() {
  const t = useT();
  const [rows, setRows] = useState([0, 1]);
  // The primary button means "send": with every field empty it has nothing to
  // send, and letting it through used to jump to step 4 as a silent no-op —
  // the "Skip" link next to it is the way to move on without inviting.
  const [values, setValues] = useState<Record<number, string>>({});
  const hasEmail = rows.some((id) => (values[id] ?? "").includes("@"));

  return (
    <form action={inviteTeam} className="flex flex-col gap-3" style={{ maxWidth: 460 }}>
      {rows.map((id) => (
        <div key={id} className="flex items-center gap-2">
          <input
            name="email"
            type="email"
            placeholder={t("app.onboarding.invitePlaceholder")}
            onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
            className="min-w-0 flex-1 border px-3 text-sm outline-none"
            style={{
              height: 36,
              borderRadius: 6,
              borderColor: "var(--line)",
              background: "var(--bg)",
            }}
          />
          <select
            name="role"
            defaultValue="agent"
            className="shrink-0 border px-2 text-[13px]"
            style={{
              height: 36,
              width: 110,
              borderRadius: 6,
              borderColor: "var(--line)",
              background: "var(--bg)",
            }}
          >
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((r) => [...r, (r[r.length - 1] ?? 0) + 1])}
        className="self-start rounded-md border border-dashed px-3 py-1.5 text-[13px]"
        style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
      >
        {t("app.onboarding.addRow")}
      </button>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="submit"
          disabled={!hasEmail}
          className="rounded-md px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          style={{ height: 38, background: "var(--acc)" }}
        >
          {t("app.onboarding.sendInvites")}
        </button>
        <a href="/onboarding?step=4" className="text-[13px] hover:underline" style={{ color: "var(--ink-3)" }}>
          {t("app.onboarding.skip")}
        </a>
      </div>
    </form>
  );
}
