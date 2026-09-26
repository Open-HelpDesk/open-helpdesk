"use client";

import type { DeskNotificationEvent } from "@openhelpdesk/desk";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";
import { useCfg } from "./primitives";
import { eyebrow } from "./styles";

const ROWS: Array<{ event: DeskNotificationEvent; label: MessageKey; who: MessageKey }> = [
  { event: "request_to_approve", label: "desk.cfg.notif.ev.requestToApprove", who: "desk.cfg.notif.who.manager" },
  { event: "request_decided", label: "desk.cfg.notif.ev.requestDecided", who: "desk.cfg.notif.who.requester" },
  { event: "access_ready", label: "desk.cfg.notif.ev.accessReady", who: "desk.cfg.notif.who.requester" },
  { event: "access_expiring", label: "desk.cfg.notif.ev.accessExpiring", who: "desk.cfg.notif.who.holderAndManager" },
  { event: "review_opened", label: "desk.cfg.notif.ev.reviewOpened", who: "desk.cfg.notif.who.reviewers" },
  { event: "offboarding_scheduled", label: "desk.cfg.notif.ev.offboardingScheduled", who: "desk.cfg.notif.who.managerAndIt" },
  { event: "connector_error", label: "desk.cfg.notif.ev.connectorError", who: "desk.cfg.notif.who.it" },
];

const CHANNELS = ["chat", "email", "portal"] as const;
/**
 * What each channel can truthfully be today (packages/desk/src/notify.ts):
 * email is sent and gated by the matrix; the portal reads the state itself, so
 * it always shows and cannot be switched off; chat is not built.
 */
const MODE: Record<(typeof CHANNELS)[number], "toggle" | "always" | "unavailable"> = { chat: "unavailable", email: "toggle", portal: "always" };
const GRID = "minmax(0,1fr) repeat(3,110px)";

export function NotificationMatrix() {
  const t = useT();
  const { config, update } = useCfg();
  const colLabel = { chat: t("desk.cfg.notif.chat"), email: t("desk.cfg.notif.email"), portal: t("desk.cfg.notif.portal") };
  return (
    <section style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "12px 18px", borderBottom: "1px solid var(--line)", minWidth: 620 }}>
        <span style={eyebrow}>{t("desk.cfg.notif.event")}</span>
        {CHANNELS.map((c) => (
          <span key={c} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: MODE[c] === "unavailable" ? "var(--ink-3)" : "var(--ink-2)" }}>{colLabel[c]}</span>
            {MODE[c] === "unavailable" && <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{t("desk.cfg.notif.notAvailable")}</span>}
            {MODE[c] === "always" && <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{t("desk.cfg.notif.alwaysOn")}</span>}
          </span>
        ))}
      </div>
      {ROWS.map((r) => {
        const cells = config.notifications[r.event];
        return (
          <div key={r.event} style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "11px 18px", borderBottom: "1px solid var(--line-2)", minWidth: 620 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t(r.label)}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("desk.cfg.notif.recipient", { who: t(r.who) })}</div>
            </div>
            {CHANNELS.map((c) => {
              const available = MODE[c] === "toggle";
              const on = MODE[c] === "always" || (available && cells[c]);
              return (
                <div key={c} style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`${t(r.label)} · ${colLabel[c]}`}
                    disabled={!available}
                    title={MODE[c] === "unavailable" ? t("desk.cfg.notif.chatTitle") : undefined}
                    onClick={() => update("notifications", r.event, { ...cells, [c]: !cells[c] })}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      display: "grid",
                      placeItems: "center",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: available ? "pointer" : "not-allowed",
                      background: on ? "var(--brand)" : available ? "var(--panel)" : "var(--sunk)",
                      border: `1.5px solid ${on ? "var(--brand)" : "var(--line)"}`,
                      opacity: MODE[c] === "always" ? 0.55 : 1,
                    }}
                  >
                    {on ? "✓" : ""}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{ padding: "12px 18px", fontSize: 12.5, color: "var(--ink-2)", background: "var(--sunk)" }}>{t("desk.cfg.notif.footnote")}</div>
    </section>
  );
}
