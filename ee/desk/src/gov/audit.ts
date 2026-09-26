/**
 * One decision, one line (spec 19 §4, rule 1) — the ee/ desk writes into the
 * existing `audit_events` journal with `desk.*` action names.
 *
 * Same shape as the core's journal (packages/desk/src/audit.ts): agents are
 * written `user` like the rest of the product's journal, employees `person`,
 * and `after.actor` freezes the actor's display name so the line still reads
 * right after that person has left. A rule's name goes into `after.rule`.
 */
import { eq } from "drizzle-orm";
import { auditEvents, people, users, type Tx } from "@openhelpdesk/db";
import type { Actor } from "@openhelpdesk/desk";

export function actorColumns(actor: Actor): { actorType: string; actorId: string | null; rule: string | null } {
  switch (actor.kind) {
    case "agent":
      return { actorType: "user", actorId: actor.userId, rule: null };
    case "person":
      return { actorType: "person", actorId: actor.personId, rule: null };
    case "rule":
      return { actorType: "rule", actorId: null, rule: actor.rule };
    case "scim":
      return { actorType: "scim", actorId: null, rule: null };
    default:
      return { actorType: "system", actorId: null, rule: null };
  }
}

export async function journal(
  tx: Tx,
  tenantId: string,
  actor: Actor,
  action: `desk.${string}`,
  target: { type: string; id: string | null },
  data: { before?: unknown; after?: Record<string, unknown> } = {},
): Promise<void> {
  const { actorType, actorId, rule } = actorColumns(actor);
  const after: Record<string, unknown> = { ...(data.after ?? {}) };
  if (rule) after.rule = rule;
  if (!("actor" in after)) after.actor = await actorName(tx, actor);
  await tx.insert(auditEvents).values({
    tenantId,
    actorType,
    actorId,
    action,
    targetType: target.type,
    targetId: target.id,
    before: data.before ?? null,
    after,
  });
}

/** The user id to store in `*_by_user_id` columns — agents only. */
export function actorUserId(actor: Actor): string | null {
  return actor.kind === "agent" ? actor.userId : null;
}

/** The display name of an actor, frozen into the journal line. */
export async function actorName(tx: Tx, actor: Actor): Promise<string | null> {
  if (actor.kind === "agent") {
    const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actor.userId)).limit(1);
    return u?.name ?? null;
  }
  if (actor.kind === "person") {
    const [p] = await tx.select({ name: people.name }).from(people).where(eq(people.id, actor.personId)).limit(1);
    return p?.name ?? null;
  }
  if (actor.kind === "rule") return actor.rule;
  return null;
}
