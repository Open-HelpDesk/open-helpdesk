"use client";

/**
 * The buttons of an access request (SD-A1), by state: remind the approver,
 * decide as the application owner, tick a manual account creation, revoke an
 * active access. Each calls one server action — one desk API call, one audit
 * line — and the page refreshes from the database afterwards.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { decideAsOwnerAction, markProvisionedAction, remindAction, revokeAction } from "@/app/app/desk/requests/actions";
import { btnStyle, inputStyle, labelStyle, Overlay, useToast } from "./ui";

export type RequestActionsProps = {
  requestId: string;
  requesterName: string;
  appName: string;
  remind?: { name: string } | null;
  decide?: { approvalId: string } | null;
  markJobId?: string | null;
  creatingVia?: string | null;
  revoke?: { grantId: string; connector: string | null } | null;
};

export function RequestActions(p: RequestActionsProps) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"none" | "refuse" | "revoke">("none");
  const [text, setText] = useState("");

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast(success);
        after?.();
        router.refresh();
      } else {
        toast(t("desk.it.common.error", { message: res.error }), "error");
      }
    });
  }

  return (
    <>
      {p.remind && (
        <button
          type="button"
          disabled={pending}
          className="ohd-hover-edge-ink"
          style={btnStyle("ghost")}
          onClick={() => run(() => remindAction(p.requestId), t("desk.it.detail.reminded", { name: p.remind!.name }))}
        >
          {t("desk.it.detail.remind", { name: p.remind.name })}
        </button>
      )}
      {p.decide && (
        <>
          <button
            type="button"
            disabled={pending}
            className="ohd-hover"
            style={btnStyle("danger")}
            onClick={() => {
              setText("");
              setDialog("refuse");
            }}
          >
            {t("desk.it.detail.refuse")}
          </button>
          <button
            type="button"
            disabled={pending}
            style={btnStyle("primary")}
            onClick={() => run(() => decideAsOwnerAction(p.decide!.approvalId, "approved", null), t("desk.it.detail.approved"))}
          >
            {t("desk.it.detail.approveOwner")}
          </button>
        </>
      )}
      {p.markJobId && (
        <button
          type="button"
          disabled={pending}
          style={btnStyle("primary")}
          onClick={() => run(() => markProvisionedAction(p.markJobId!), t("desk.it.detail.markedDone", { name: p.requesterName }))}
        >
          {t("desk.it.detail.markProvisioned")}
        </button>
      )}
      {p.creatingVia && !p.markJobId && (
        <span style={{ ...btnStyle("muted"), cursor: "default" }}>{t("desk.it.detail.creatingVia", { connector: p.creatingVia })}</span>
      )}
      {p.revoke && (
        <button
          type="button"
          disabled={pending}
          className="ohd-hover"
          style={btnStyle("danger")}
          onClick={() => {
            setText("");
            setDialog("revoke");
          }}
        >
          {t("desk.it.detail.revoke")}
        </button>
      )}

      <Overlay open={dialog === "refuse"} onClose={() => setDialog("none")} title={t("desk.it.detail.refuseTitle")}>
        <form
          className="flex flex-col"
          style={{ gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => decideAsOwnerAction(p.decide!.approvalId, "refused", text), t("desk.it.detail.refused"), () => setDialog("none"));
          }}
        >
          <label className="flex flex-col" style={{ gap: 6 }}>
            <span style={labelStyle}>{t("desk.it.detail.refuseComment")}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ ...inputStyle, height: "auto", padding: "9px 11px", resize: "vertical" }} />
          </label>
          <div className="flex justify-end" style={{ gap: 8 }}>
            <button type="button" className="ohd-hover" style={btnStyle("ghost")} onClick={() => setDialog("none")}>
              {t("desk.it.common.cancel")}
            </button>
            <button type="submit" disabled={pending} style={{ ...btnStyle("primary"), background: "var(--dang)", borderColor: "var(--dang)" }}>
              {t("desk.it.detail.refuse")}
            </button>
          </div>
        </form>
      </Overlay>

      {p.revoke && (
        <RevokeDialog
          open={dialog === "revoke"}
          onClose={() => setDialog("none")}
          grantId={p.revoke.grantId}
          appName={p.appName}
          personName={p.requesterName}
          connector={p.revoke.connector}
        />
      )}
    </>
  );
}

/** Revocation always carries a reason: it is what the audit line and the requester read. */
export function RevokeDialog({
  open,
  onClose,
  grantId,
  appName,
  personName,
  connector,
}: {
  open: boolean;
  onClose: () => void;
  grantId: string;
  appName: string;
  personName: string;
  connector: string | null;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");

  return (
    <Overlay open={open} onClose={onClose} title={t("desk.it.detail.revokeTitle", { app: appName, name: personName })}>
      <form
        className="flex flex-col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await revokeAction(grantId, reason);
            if (res.ok) {
              toast(t("desk.it.detail.revoked"));
              setReason("");
              onClose();
              router.refresh();
            } else toast(t("desk.it.common.error", { message: res.error }), "error");
          });
        }}
      >
        <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {connector ? t("desk.it.detail.revokeAuto", { connector }) : t("desk.it.detail.revokeManual", { app: appName })}
        </p>
        <label className="flex flex-col" style={{ gap: 6 }}>
          <span style={labelStyle}>{t("desk.it.detail.revokeReason")}</span>
          <input
            required
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("desk.it.detail.revokeReasonPlaceholder")}
            style={inputStyle}
          />
        </label>
        <div className="flex justify-end" style={{ gap: 8 }}>
          <button type="button" className="ohd-hover" style={btnStyle("ghost")} onClick={onClose}>
            {t("desk.it.common.cancel")}
          </button>
          <button type="submit" disabled={pending || !reason.trim()} style={{ ...btnStyle("primary"), background: "var(--dang)", borderColor: "var(--dang)" }}>
            {t("desk.it.detail.revokeConfirm")}
          </button>
        </div>
      </form>
    </Overlay>
  );
}
