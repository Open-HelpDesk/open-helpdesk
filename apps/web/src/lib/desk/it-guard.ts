/**
 * Who may use the agent-space service desk (spec 19).
 *
 * Owners, admins and agents see it — viewers do not: every screen of the
 * section shows people's accesses and equipment, which is not what a read-only
 * seat is for. Configuration (the catalogue, SD-A2) is for owners and admins,
 * the same boundary the settings screens use (`isManager`).
 */
import type { Actor } from "@/lib/desk";
import { entitlementsFor } from "@/lib/entitlements";
import { isManager, requireAgent, type CurrentAgent } from "@/lib/session";
import { getT } from "@/i18n/server";

export function canUseDesk(role: string): boolean {
  return role === "owner" || role === "admin" || role === "agent";
}

export type DeskActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Guard for the section's server actions. It throws: an action reached by a
 * role that has no right to it is an attempt, not a navigation.
 */
export async function requireDeskAgent(opts: { manage?: boolean; entitlement?: "deskHardware" } = {}): Promise<CurrentAgent & { actor: Actor }> {
  const current = await requireAgent();
  const t = await getT();
  const ent = entitlementsFor(current.tenant);
  if (!canUseDesk(current.agent.role)) throw new Error(t("desk.it.shell.roleRestricted"));
  if (!ent.serviceDesk) throw new Error(t("desk.it.shell.lockedText"));
  if (opts.entitlement && !ent[opts.entitlement]) throw new Error(t("desk.it.hw.lockedText"));
  if (opts.manage && !isManager(current.agent.role)) throw new Error(t("desk.it.apps.readOnly"));
  return { ...current, actor: { kind: "agent", userId: current.agent.id } };
}

/** Runs a desk write and turns its failure into a message the screen can show. */
export async function attempt<T>(fn: () => Promise<T>): Promise<DeskActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    // A redirect or notFound thrown by Next.js must keep propagating.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest?: unknown }).digest === "string" && /^NEXT_/.test((err as { digest: string }).digest)) throw err;
    // A typed desk failure (DeskError) carries the i18n key of its message;
    // its own message is English, for logs, and is shown only as a last resort.
    const key = err && typeof err === "object" && "i18nKey" in err ? String((err as { i18nKey: unknown }).i18nKey) : null;
    if (key) {
      const t = await getT();
      if (key in t.dict) return { ok: false, error: t(key as Parameters<typeof t>[0]) };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
