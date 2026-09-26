/**
 * The frame of an ee/ desk screen: its scrolling column, its header, and the
 * locked state shown to a workspace without the entitlement — a locked
 * screen, never a 404, so the module can be discovered.
 */
import type { ReactNode } from "react";
import { getEdition } from "@openhelpdesk/config";
import { LockedScreen } from "@/components/settings-page";
import type { Translate } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/en";

export function DeskColumn({ children, width = 1240 }: { children: ReactNode; width?: number }) {
  return (
    <div className="h-full min-w-0 flex-1 overflow-auto">
      <div style={{ padding: "24px 28px 60px", display: "flex", flexDirection: "column", gap: 18, maxWidth: width }}>
        {children}
      </div>
    </div>
  );
}

export function DeskHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <h1 style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 600, letterSpacing: "-.015em" }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 2 }}>{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

/** A blurred table standing in for the data the workspace cannot see. */
function Ghost() {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14 }}>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: "1px solid var(--line-2)" }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--sunk)" }} />
          <span style={{ width: 140, height: 10, borderRadius: 5, background: "var(--sunk)" }} />
          <span style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--sunk)" }} />
          <span style={{ width: 70, height: 10, borderRadius: 5, background: "var(--sunk)" }} />
        </div>
      ))}
    </div>
  );
}

export function DeskLocked({
  t,
  title,
  subtitle,
  lockedTitle,
  lockedText,
}: {
  t: Translate;
  title: string;
  subtitle?: string;
  lockedTitle: MessageKey;
  lockedText: MessageKey;
}) {
  const edition = getEdition();
  return (
    <DeskColumn>
      <DeskHeader title={title} subtitle={subtitle} />
      <LockedScreen
        variant={edition}
        title={edition === "cloud" ? t(lockedTitle) : t("app.settings.shell.eeSelfHostedTitle")}
        text={edition === "cloud" ? t(lockedText) : t("app.settings.shell.eeSelfHostedText")}
        ghost={<Ghost />}
      />
    </DeskColumn>
  );
}
