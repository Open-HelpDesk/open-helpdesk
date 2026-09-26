/**
 * Small helpers shared by the inbound SCIM server and the connectors:
 * the entitlement gate and the audit line.
 */
import { eq } from "drizzle-orm";
import { CORE_ENTITLEMENTS, isSelfHosted, type Entitlements } from "@openhelpdesk/config";
import { auditEvents, tenants, withTenant, type Tx } from "@openhelpdesk/db";
import type { Actor } from "@openhelpdesk/desk";

/**
 * The tenant's resolved entitlements — the same rule as apps/web
 * `entitlementsFor` (which ee/ cannot import): standalone gets the core set,
 * a control-plane driven tenant gets its denormalised column merged on top.
 */
export async function tenantEntitlements(tenantId: string, tx?: Tx): Promise<Entitlements> {
  const read = async (t: Tx) => {
    const [row] = await t
      .select({ entitlements: tenants.entitlements })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    return row ?? null;
  };
  const row = tx ? await read(tx) : await withTenant(tenantId, read);
  if (!row) return { ...CORE_ENTITLEMENTS, deskConnectors: false };
  if (isSelfHosted()) return CORE_ENTITLEMENTS;
  const resolved = row.entitlements as Partial<Entitlements> | null;
  return resolved ? { ...CORE_ENTITLEMENTS, ...resolved } : CORE_ENTITLEMENTS;
}

export async function hasDeskConnectors(tenantId: string, tx?: Tx): Promise<boolean> {
  return (await tenantEntitlements(tenantId, tx)).deskConnectors === true;
}

/** `Actor` → audit_events columns — the same mapping as the core (agents are `user`, like the rest of the product). */
export function actorColumns(actor: Actor): { actorType: string; actorId: string | null } {
  switch (actor.kind) {
    case "agent":
      return { actorType: "user", actorId: actor.userId };
    case "person":
      return { actorType: "person", actorId: actor.personId };
    case "rule":
      return { actorType: "rule", actorId: null };
    default:
      return { actorType: actor.kind, actorId: null };
  }
}

/** One decision = one audit line (doctrine rule 1). */
export async function audit(
  tx: Tx,
  tenantId: string,
  actor: Actor,
  action: string,
  target: { type: string; id: string | null },
  before: unknown = null,
  after: unknown = null,
): Promise<void> {
  await tx.insert(auditEvents).values({
    tenantId,
    ...actorColumns(actor),
    action,
    targetType: target.type,
    targetId: target.id,
    before: before as never,
    after: after as never,
  });
}
