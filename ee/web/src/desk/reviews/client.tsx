"use client";

/** SD-A4 — the interactive parts of the access review screen. */
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { Avatar, BTN, ConfirmDialog, PRIMARY, Pill, SMALL_BTN, useToast } from "../shared/ui";
import { closeReviewAction, decideItemAction, openReviewAction, remindReviewerAction } from "./actions";
import type { ReviewItem } from "./data";

/* ---------------- Header: close + evidence ---------------- */

export function CampaignActions({
  reviewId,
  canClose,
  counts,
  unansweredRule,
}: {
  reviewId: string;
  canClose: boolean;
  counts: { revoke: number; keep: number; unanswered: number };
  unansweredRule: "escalate" | "revoke";
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pending, start] = useTransition();

  const close = () =>
    start(async () => {
      const res = await closeReviewAction(reviewId);
      setConfirm(false);
      if (!res.ok) return toast(res.error, "error");
      toast(t("desk.ee.rev.closedToast", { revoked: t.fmt.number(res.revoked), kept: t.fmt.number(res.kept), unanswered: t.fmt.number(res.unanswered) }));
      router.refresh();
    });

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
      <button type="button" onClick={() => setMenu((m) => !m)} className="ohd-hover-edge-fill" style={{ ...BTN, background: "var(--panel)" }} aria-expanded={menu}>
        {t("desk.ee.rev.export")}
      </button>
      {menu && (
        <div
          style={{
            position: "absolute",
            top: 42,
            left: 0,
            zIndex: 20,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(17,33,28,.14)",
            padding: 4,
            minWidth: 220,
          }}
        >
          {(["pdf", "csv"] as const).map((f) => (
            <a
              key={f}
              href={`/app/desk/reviews/${reviewId}/evidence?format=${f}`}
              onClick={() => {
                setMenu(false);
                toast(t("desk.ee.rev.exportedToast"));
              }}
              className="ohd-hover"
              style={{ display: "block", padding: "8px 10px", borderRadius: 7, fontSize: 13 }}
            >
              {f === "pdf" ? t("desk.ee.rev.evidencePdf") : t("desk.ee.rev.evidenceCsv")}
            </a>
          ))}
        </div>
      )}
      {canClose && (
        <button type="button" onClick={() => setConfirm(true)} style={PRIMARY}>
          {t("desk.ee.rev.close")}
        </button>
      )}
      <ConfirmDialog
        open={confirm}
        busy={pending}
        title={t("desk.ee.rev.closeTitle")}
        body={
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>{t("desk.ee.rev.closeRevoke", { count: counts.revoke })}</span>
            <span>{t("desk.ee.rev.closeKeep", { count: counts.keep })}</span>
            {counts.unanswered > 0 && (
              <span style={{ color: "var(--wait)", fontWeight: 600 }}>
                {unansweredRule === "revoke"
                  ? t("desk.ee.rev.closeUnansweredRevoke", { count: counts.unanswered })
                  : t("desk.ee.rev.closeUnansweredKeep", { count: counts.unanswered })}
              </span>
            )}
            <span style={{ color: "var(--ink-3)", fontSize: 12.5 }}>{t("desk.ee.rev.closeNote")}</span>
          </div>
        }
        confirmLabel={t("desk.ee.rev.closeCta")}
        danger={counts.revoke > 0}
        onConfirm={close}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}

/* ---------------- Reviewers: remind ---------------- */

export function RemindButton({ reviewId, personId, name }: { reviewId: string; personId: string; name: string }) {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await remindReviewerAction(reviewId, personId);
          if (!res.ok) return toast(res.error, "error");
          toast(t("desk.ee.rev.remindedToast", { name }));
        })
      }
      style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-2)", cursor: "pointer", opacity: pending ? 0.5 : 1 }}
    >
      {t("desk.ee.rev.remind")}
    </button>
  );
}

/* ---------------- Scope: keep / revoke per line ---------------- */

type Row = ReviewItem & { lastSeenLabel: string; signalLabel: string | null };

export function ScopeRows({ items, icons, open }: { items: Row[]; icons: Record<string, ReactNode>; open: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  // Optimistic: the button lights up at once, the refresh brings the truth.
  const [local, setLocal] = useState<Record<string, "keep" | "revoke">>({});
  const [, start] = useTransition();

  const decide = (it: Row, d: "keep" | "revoke") => {
    setLocal((l) => ({ ...l, [it.id]: d }));
    start(async () => {
      const res = await decideItemAction(it.id, d);
      if (!res.ok) {
        setLocal((l) => {
          const next = { ...l };
          delete next[it.id];
          return next;
        });
        return toast(res.error, "error");
      }
      if (d === "revoke") toast(t("desk.ee.rev.revokedToast", { app: it.appName, name: it.personName }));
      router.refresh();
    });
  };

  if (items.length === 0) {
    return <div style={{ padding: "18px 16px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.ee.rev.scopeEmpty")}</div>;
  }

  return (
    <>
      {items.map((it) => {
        const d = local[it.id] ?? it.decision;
        return (
          <div
            key={it.id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,1.2fr) auto",
              gap: 14,
              minWidth: 640,
              alignItems: "center",
              padding: "11px 16px",
              borderBottom: "1px solid var(--line-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <Avatar name={it.personName} size={28} />
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.personName}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              {icons[it.id]}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{it.appName}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                  {it.tierName} · {it.lastSeenLabel}
                </div>
              </div>
            </div>
            <div>{it.signalLabel && <Pill tone="wait">{it.signalLabel}</Pill>}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                disabled={!open}
                aria-pressed={d === "keep"}
                onClick={() => decide(it, "keep")}
                style={{
                  ...SMALL_BTN,
                  background: d === "keep" ? "var(--brand-t)" : "var(--panel)",
                  color: d === "keep" ? "var(--brand)" : "var(--ink-2)",
                  borderColor: d === "keep" ? "var(--brand-b)" : "var(--line)",
                  cursor: open ? "pointer" : "default",
                }}
              >
                {t("desk.ee.rev.keep")}
              </button>
              <button
                type="button"
                disabled={!open}
                aria-pressed={d === "revoke"}
                onClick={() => decide(it, "revoke")}
                style={{
                  ...SMALL_BTN,
                  background: d === "revoke" ? "var(--dang-t)" : "var(--panel)",
                  color: d === "revoke" ? "var(--dang)" : "var(--ink-2)",
                  borderColor: d === "revoke" ? "var(--dang)" : "var(--line)",
                  cursor: open ? "pointer" : "default",
                }}
              >
                {t("desk.ee.rev.revoke")}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ---------------- No campaign: open one ---------------- */

const FRAMEWORKS = ["ISO 27001 · A.5.18", "NIS2 · art. 21", "SOC 2 · CC6.2", "DORA · art. 9"];

export function OpenCampaignForm({
  defaults,
}: {
  defaults: { name: string; dueOn: string; scope: string; reviewers: string };
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(defaults.name);
  const [dueOn, setDueOn] = useState(defaults.dueOn);
  const [scope, setScope] = useState(defaults.scope);
  const [reviewers, setReviewers] = useState(defaults.reviewers);
  const [frameworks, setFrameworks] = useState<string[]>(FRAMEWORKS.slice(0, 2));
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await openReviewAction({ name, dueOn, scope, reviewers, frameworks });
      if (!res.ok) return toast(res.error, "error");
      toast(t("desk.ee.rev.openedToast", { name }));
      router.refresh();
    });

  const field: React.CSSProperties = {
    height: 38,
    borderRadius: 9,
    border: "1px solid var(--line)",
    padding: "0 12px",
    fontSize: 13.5,
    background: "var(--panel)",
    color: "var(--ink)",
    width: "100%",
  };
  const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" };

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: "var(--font-title)", fontSize: 18, fontWeight: 600 }}>{t("desk.ee.rev.openTitle")}</div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{t("desk.ee.rev.openText")}</div>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={label}>{t("desk.ee.rev.fieldName")}</span>
        <input className="ohd-field" style={field} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={label}>{t("desk.ee.rev.fieldFrameworks")}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FRAMEWORKS.map((f) => {
            const on = frameworks.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => setFrameworks((all) => (on ? all.filter((x) => x !== f) : [...all, f]))}
                style={{
                  padding: "5px 11px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: `1px solid ${on ? "var(--brand-b)" : "var(--line)"}`,
                  background: on ? "var(--brand-t)" : "var(--panel)",
                  color: on ? "var(--brand)" : "var(--ink-2)",
                }}
              >
                {on ? "✓ " : "+ "}
                {f}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>{t("desk.ee.rev.fieldDue")}</span>
          <input type="date" className="ohd-field" style={field} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>{t("desk.ee.rev.fieldScope")}</span>
          <select className="ohd-field" style={field} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="sensitive">{t("desk.ee.rev.scopeSensitive")}</option>
            <option value="privileged">{t("desk.ee.rev.scopePrivileged")}</option>
            <option value="all">{t("desk.ee.rev.scopeAll")}</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>{t("desk.ee.rev.fieldReviewers")}</span>
          <select className="ohd-field" style={field} value={reviewers} onChange={(e) => setReviewers(e.target.value)}>
            <option value="managers">{t("desk.ee.rev.reviewersManagers")}</option>
            <option value="owners">{t("desk.ee.rev.reviewersOwners")}</option>
            <option value="both">{t("desk.ee.rev.reviewersBoth")}</option>
          </select>
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 240, fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.ee.rev.openNote")}</span>
        <button type="button" disabled={pending} onClick={submit} style={{ ...PRIMARY, opacity: pending ? 0.6 : 1 }}>
          {t("desk.ee.rev.openCta")}
        </button>
      </div>
    </div>
  );
}

