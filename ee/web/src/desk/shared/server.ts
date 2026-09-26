/**
 * Service desk, ee/ screens (SD-A3, A4, A6, A8) — what every page and action
 * of this folder needs before it reads or writes anything.
 *
 * The ee entitlements are checked twice on purpose: the page shows a locked
 * state instead of the data, and every server action refuses on its own — a
 * locked page is a display, not a guard.
 */
import type { Entitlements } from "@openhelpdesk/config";
import type { Actor } from "@/lib/desk";
import { isManager, requireAgent, type CurrentAgent } from "@/lib/session";
import { entitlementsFor } from "@/lib/entitlements";
import { getT, type Translate } from "@/i18n/server";

export type DeskEeEntitlement = "deskLicences" | "deskAccessReviews" | "deskLifecycle" | "deskShadowIt";

export type DeskScreenContext = CurrentAgent & {
  t: Translate;
  ent: Entitlements;
  /** False → the page renders its locked state. */
  allowed: boolean;
  /** Owner or Admin: opens and closes campaigns, saves packs. */
  manager: boolean;
  actor: Actor;
};

export async function deskScreen(key: DeskEeEntitlement): Promise<DeskScreenContext> {
  const [t, current] = await Promise.all([getT(), requireAgent()]);
  const ent = entitlementsFor(current.tenant);
  return {
    ...current,
    t,
    ent,
    allowed: Boolean(ent.serviceDesk && ent[key]),
    manager: isManager(current.agent.role),
    actor: { kind: "agent", userId: current.agent.id },
  };
}

/** What a server action of these screens hands back to its client island. */
export type ActionResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Runs a write for one of these screens: session, entitlement, optional
 * manager role, and a failure turned into a message instead of a crash — the
 * client shows it in a toast and keeps the screen as it was.
 */
export async function deskAction<T extends Record<string, unknown>>(
  key: DeskEeEntitlement,
  opts: { managerOnly?: boolean },
  fn: (ctx: DeskScreenContext) => Promise<T>,
): Promise<ActionResult<T>> {
  const ctx = await deskScreen(key);
  if (!ctx.allowed) return { ok: false, error: ctx.t("desk.ee.error.locked") };
  if (opts.managerOnly && !ctx.manager) return { ok: false, error: ctx.t("desk.ee.error.managerOnly") };
  try {
    const value = await fn(ctx);
    return { ok: true, ...value };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: ctx.t("desk.ee.error.failed", { detail }) };
  }
}
