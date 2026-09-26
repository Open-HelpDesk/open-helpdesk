import type { MessageKey } from "@/i18n/dictionaries/en";

/** The eight tabs of SD-A9, in the design's order. The key is the `?tab=` value. */
export const CONFIG_TABS = [
  { key: "dir", label: "desk.cfg.tab.directory" },
  { key: "conn", label: "desk.cfg.tab.connectors" },
  { key: "appr", label: "desk.cfg.tab.approvals" },
  { key: "budget", label: "desk.cfg.tab.budgets" },
  { key: "access", label: "desk.cfg.tab.access" },
  { key: "notif", label: "desk.cfg.tab.notifications" },
  { key: "life", label: "desk.cfg.tab.lifecycle" },
  { key: "audit", label: "desk.cfg.tab.compliance" },
] as const satisfies ReadonlyArray<{ key: string; label: MessageKey }>;

export type ConfigTab = (typeof CONFIG_TABS)[number]["key"];
