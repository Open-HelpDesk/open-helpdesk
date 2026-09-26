/**
 * The application catalogue (SD-A2): apps, licence tiers, auto-approval
 * groups. Every change is journaled.
 */
import { and, eq, inArray, like, notInArray, or } from "drizzle-orm";
import { encryptSecret } from "@openhelpdesk/crypto";
import {
  accessGrants,
  accessRequests,
  deskAppAutoGroups,
  deskApps,
  deskAppTiers,
  deskConnectors,
  people,
  peopleGroups,
  type Tx,
} from "@openhelpdesk/db";
import type { AppInput, TierInput } from "./api";
import { writeDeskAudit } from "./audit";
import { loadApp } from "./circuit-db";
import { DeskNotFoundError, DeskValidationError } from "./errors";
import { inTenant, isIsoDate, requireEntitlement } from "./internal";
import type { Actor } from "./types";

export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "app";
}

async function uniqueSlug(tx: Tx, tenantId: string, wanted: string, exceptId?: string): Promise<string> {
  const rows = await tx
    .select({ id: deskApps.id, slug: deskApps.slug })
    .from(deskApps)
    .where(and(eq(deskApps.tenantId, tenantId), or(eq(deskApps.slug, wanted), like(deskApps.slug, `${wanted}-%`))));
  const taken = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; ; i++) if (!taken.has(`${wanted}-${i}`)) return `${wanted}-${i}`;
}

async function validate(tx: Tx, tenantId: string, input: Partial<AppInput>): Promise<void> {
  if (input.name !== undefined && !input.name.trim()) throw new DeskValidationError("invalid_input", "name");
  if (input.category !== undefined && !input.category.trim()) throw new DeskValidationError("invalid_input", "category");
  if (input.approvalLevels !== undefined && ![0, 1, 2].includes(input.approvalLevels)) throw new DeskValidationError("invalid_input", "approvalLevels");
  if (input.maxDurationDays !== undefined && input.maxDurationDays !== null && !(Number.isInteger(input.maxDurationDays) && input.maxDurationDays > 0))
    throw new DeskValidationError("invalid_input", "maxDurationDays");
  if (input.seatsPurchased !== undefined && input.seatsPurchased !== null && !(Number.isInteger(input.seatsPurchased) && input.seatsPurchased >= 0))
    throw new DeskValidationError("invalid_input", "seatsPurchased");
  if (input.renewsOn && !isIsoDate(input.renewsOn)) throw new DeskValidationError("invalid_date", "renewsOn");
  if (input.ownerPersonId) {
    const [p] = await tx.select({ id: people.id }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, input.ownerPersonId)));
    if (!p) throw new DeskNotFoundError("owner");
  }
  if (input.connectorId) {
    const [c] = await tx.select({ id: deskConnectors.id }).from(deskConnectors).where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, input.connectorId)));
    if (!c) throw new DeskNotFoundError("connector");
  }
}

/** Columns written from an AppInput patch. The SCIM token is stored encrypted, never in clear. */
function columns(input: Partial<AppInput>): Partial<typeof deskApps.$inferInsert> {
  const out: Partial<typeof deskApps.$inferInsert> = {};
  if (input.name !== undefined) out.name = input.name.trim();
  if (input.category !== undefined) out.category = input.category.trim();
  if (input.description !== undefined) out.description = input.description;
  if (input.iconKey !== undefined) out.iconKey = input.iconKey;
  if (input.color !== undefined) out.color = input.color;
  if (input.ownerPersonId !== undefined) out.ownerPersonId = input.ownerPersonId;
  if (input.approvalLevels !== undefined) out.approvalLevels = input.approvalLevels;
  if (input.maxDurationDays !== undefined) out.maxDurationDays = input.maxDurationDays;
  if (input.visible !== undefined) out.visible = input.visible;
  if (input.connectorId !== undefined) out.connectorId = input.connectorId;
  if (input.scimBaseUrl !== undefined) out.scimBaseUrl = input.scimBaseUrl;
  if (input.scimToken !== undefined) out.scimToken = input.scimToken ? encryptSecret(input.scimToken) : null;
  if (input.seatsPurchased !== undefined) out.seatsPurchased = input.seatsPurchased;
  if (input.renewsOn !== undefined) out.renewsOn = input.renewsOn;
  return out;
}

/** The journal never holds a secret: the token is reduced to "changed". */
function auditable(cols: Partial<typeof deskApps.$inferInsert>): Record<string, unknown> {
  const { scimToken, ...rest } = cols;
  return scimToken !== undefined ? { ...rest, scimToken: scimToken ? "••••" : null } : rest;
}

export async function createApp(tenantId: string, input: AppInput, actor: Actor): Promise<string> {
  return inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    if (!input.name?.trim() || !input.category?.trim()) throw new DeskValidationError("invalid_input");
    await validate(tx, tenantId, input);
    const slug = await uniqueSlug(tx, tenantId, slugify(input.slug?.trim() || input.name));
    const cols = columns(input);
    const [row] = await tx
      .insert(deskApps)
      .values({ tenantId, slug, name: input.name.trim(), category: input.category.trim(), ...cols })
      .returning({ id: deskApps.id });
    await writeDeskAudit(tx, tenantId, actor, "desk.app.created", { type: "desk_app", id: row!.id }, { app: input.name.trim(), slug, ...auditable(cols) });
    return row!.id;
  });
}

export async function updateApp(tenantId: string, appId: string, patch: Partial<AppInput>, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const app = await loadApp(tx, tenantId, appId);
    await validate(tx, tenantId, patch);
    const cols = columns(patch);
    if (patch.slug !== undefined && patch.slug.trim()) cols.slug = await uniqueSlug(tx, tenantId, slugify(patch.slug), appId);
    const changed = Object.keys(cols).filter((k) => (app as Record<string, unknown>)[k] !== (cols as Record<string, unknown>)[k]);
    if (changed.length === 0) return;
    await tx.update(deskApps).set({ ...cols, updatedAt: new Date() }).where(eq(deskApps.id, appId));
    const before = auditable(Object.fromEntries(changed.map((k) => [k, (app as Record<string, unknown>)[k] ?? null])));
    const after = auditable(Object.fromEntries(changed.map((k) => [k, (cols as Record<string, unknown>)[k] ?? null])));
    await writeDeskAudit(tx, tenantId, actor, "desk.app.updated", { type: "desk_app", id: appId }, { app: cols.name ?? app.name, fields: changed, ...after }, before);
  });
}

export async function setTiers(tenantId: string, appId: string, tiers: TierInput[], actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const app = await loadApp(tx, tenantId, appId);
    if (tiers.length === 0) throw new DeskValidationError("invalid_input", "an app needs at least one tier");
    for (const t of tiers) {
      if (!t.name?.trim() || !Number.isInteger(t.monthlyCostCents) || t.monthlyCostCents < 0) throw new DeskValidationError("invalid_input", "tier");
    }
    const current = await tx.select().from(deskAppTiers).where(and(eq(deskAppTiers.tenantId, tenantId), eq(deskAppTiers.appId, appId)));
    const currentIds = new Set(current.map((c) => c.id));
    const keptIds = tiers.map((t) => t.id).filter((id): id is string => !!id);
    for (const id of keptIds) if (!currentIds.has(id)) throw new DeskNotFoundError("tier");
    const removed = current.filter((c) => !keptIds.includes(c.id)).map((c) => c.id);
    if (removed.length) {
      // A tier someone holds, held or asked for is part of the record: it cannot vanish.
      const [grant] = await tx.select({ id: accessGrants.id }).from(accessGrants).where(and(eq(accessGrants.tenantId, tenantId), inArray(accessGrants.tierId, removed))).limit(1);
      const [request] = await tx.select({ id: accessRequests.id }).from(accessRequests).where(and(eq(accessRequests.tenantId, tenantId), inArray(accessRequests.tierId, removed))).limit(1);
      if (grant || request) throw new DeskValidationError("tier_in_use");
      await tx.delete(deskAppTiers).where(and(eq(deskAppTiers.tenantId, tenantId), inArray(deskAppTiers.id, removed)));
    }
    for (const [position, t] of tiers.entries()) {
      const values = { name: t.name.trim(), monthlyCostCents: t.monthlyCostCents, privileged: t.privileged ?? false, externalGroup: t.externalGroup ?? null, position };
      if (t.id) await tx.update(deskAppTiers).set(values).where(eq(deskAppTiers.id, t.id));
      else await tx.insert(deskAppTiers).values({ tenantId, appId, ...values });
    }
    await writeDeskAudit(
      tx,
      tenantId,
      actor,
      "desk.app.tiers_set",
      { type: "desk_app", id: appId },
      { app: app.name, tiers: tiers.map((t) => ({ name: t.name.trim(), monthlyCostCents: t.monthlyCostCents, privileged: t.privileged ?? false })) },
      { tiers: current.map((c) => ({ name: c.name, monthlyCostCents: c.monthlyCostCents, privileged: c.privileged })) },
    );
  });
}

export async function setAutoGroups(tenantId: string, appId: string, groupIds: string[], actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const app = await loadApp(tx, tenantId, appId);
    const ids = [...new Set(groupIds)];
    const groups = ids.length
      ? await tx.select({ id: peopleGroups.id, name: peopleGroups.name }).from(peopleGroups).where(and(eq(peopleGroups.tenantId, tenantId), inArray(peopleGroups.id, ids)))
      : [];
    if (groups.length !== ids.length) throw new DeskNotFoundError("group");
    const before = await tx
      .select({ id: peopleGroups.id, name: peopleGroups.name })
      .from(deskAppAutoGroups)
      .innerJoin(peopleGroups, eq(peopleGroups.id, deskAppAutoGroups.groupId))
      .where(and(eq(deskAppAutoGroups.tenantId, tenantId), eq(deskAppAutoGroups.appId, appId)));
    const same = before.length === ids.length && before.every((b) => ids.includes(b.id));
    if (same) return;
    await tx
      .delete(deskAppAutoGroups)
      .where(and(eq(deskAppAutoGroups.tenantId, tenantId), eq(deskAppAutoGroups.appId, appId), ids.length ? notInArray(deskAppAutoGroups.groupId, ids) : undefined));
    if (ids.length) await tx.insert(deskAppAutoGroups).values(ids.map((groupId) => ({ tenantId, appId, groupId }))).onConflictDoNothing();
    await writeDeskAudit(tx, tenantId, actor, "desk.app.auto_groups_set", { type: "desk_app", id: appId }, { app: app.name, groups: groups.map((g) => g.name) }, { groups: before.map((b) => b.name) });
  });
}

export async function archiveApp(tenantId: string, appId: string, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const app = await loadApp(tx, tenantId, appId);
    await tx.update(deskApps).set({ deletedAt: new Date(), visible: false, updatedAt: new Date() }).where(eq(deskApps.id, appId));
    await writeDeskAudit(tx, tenantId, actor, "desk.app.archived", { type: "desk_app", id: appId }, { app: app.name });
  });
}
