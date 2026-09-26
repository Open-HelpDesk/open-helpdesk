import { and, asc, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import {
  accessGrants,
  db,
  deskAppTiers,
  deskApps,
  deskPackItems,
  deskPacks,
  hardwareAssets,
  lifecyclePlans,
  lifecycleTasks,
  people,
  tenants,
  withTenant,
  type Tx,
} from "@openhelpdesk/db";
import { directGrant, revokeAccess, upsertHardware, type Actor, type DeskConfig } from "@openhelpdesk/desk";
import { DeskEeError, hasEntitlement, requireEntitlement } from "./gov/entitlements";
import { actorUserId, journal } from "./gov/audit";
import { isAutomaticApp, loadDeskConfig } from "./gov/common";
import { addDays, zonedDateTime } from "./gov/time";

/* ---------------- Joiners and leavers (deskLifecycle) ---------------- */

/** Apps whose accounts own customer records to hand over on departure. */
const CRM_SLUGS = new Set(["salesforce", "hubspot"]);
/** Onboarding: everything ready at 8:00 on the first day (lead days before). */
const ONBOARDING_HOUR = 8;
/** Offboarding "end of last day". */
const END_OF_DAY_HOUR = 18;

type TaskInsert = typeof lifecycleTasks.$inferInsert;

async function tenantTimeZone(tx: Tx, tenantId: string): Promise<string> {
  const [row] = await tx.select({ tz: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return row?.tz ?? "UTC";
}

/**
 * When an offboarding runs: the explicit time, else from `lifecycle.offboardingAt`
 * and the leave date — 18:00 tenant-local on the last day, midnight at its end,
 * or now.
 */
export function offboardingExecuteAt(
  explicit: string | null,
  mode: DeskConfig["lifecycle"]["offboardingAt"],
  leavesOn: string | null,
  timeZone: string,
  now: Date = new Date(),
): Date {
  if (explicit) {
    const d = new Date(explicit);
    if (Number.isNaN(d.getTime())) throw new DeskEeError("invalid_execute_at", "Invalid execution time");
    return d;
  }
  if (mode === "immediately") return now;
  if (!leavesOn) throw new DeskEeError("leave_date_required", "Set a leave date or an execution time first");
  if (mode === "midnight") return zonedDateTime(addDays(leavesOn, 1), 0, 0, timeZone);
  return zonedDateTime(leavesOn, END_OF_DAY_HOUR, 0, timeZone);
}

async function recipientFor(tx: Tx, tenantId: string, person: { managerId: string | null }, to: "manager" | "manager_of_manager") {
  if (!person.managerId) return null;
  const [manager] = await tx
    .select({ id: people.id, name: people.name, managerId: people.managerId })
    .from(people)
    .where(and(eq(people.tenantId, tenantId), eq(people.id, person.managerId)))
    .limit(1);
  if (!manager) return null;
  if (to === "manager_of_manager" && manager.managerId) {
    const [up] = await tx
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.id, manager.managerId)))
      .limit(1);
    if (up) return { id: up.id, name: up.name };
  }
  return { id: manager.id, name: manager.name };
}

/** Cancels the still-scheduled plans of that kind for that person — a new plan replaces them. */
async function cancelScheduled(tx: Tx, tenantId: string, personId: string, kind: "onboarding" | "offboarding", actor: Actor) {
  const cancelled = await tx
    .update(lifecyclePlans)
    .set({ state: "cancelled" })
    .where(
      and(
        eq(lifecyclePlans.tenantId, tenantId),
        eq(lifecyclePlans.personId, personId),
        eq(lifecyclePlans.kind, kind),
        eq(lifecyclePlans.state, "scheduled"),
      ),
    )
    .returning({ id: lifecyclePlans.id });
  for (const p of cancelled) {
    await journal(tx, tenantId, actor, "desk.lifecycle.cancelled", { type: "lifecycle_plan", id: p.id }, { after: { kind, replaced: true } });
  }
}

export async function scheduleOffboarding(tenantId: string, personId: string, executeAt: string | null, actor: Actor): Promise<string> {
  return withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskLifecycle");
    const [person] = await tx
      .select({ id: people.id, name: people.name, managerId: people.managerId, leavesOn: people.leavesOn, status: people.status })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.id, personId)))
      .limit(1);
    if (!person) throw new DeskEeError("person_not_found", "Unknown person");
    if (person.status === "departed") throw new DeskEeError("already_departed", "This person has already departed");
    const config = await loadDeskConfig(tx, tenantId);
    const at = offboardingExecuteAt(executeAt, config.lifecycle.offboardingAt, person.leavesOn, await tenantTimeZone(tx, tenantId));

    const grants = await tx
      .select({
        grantId: accessGrants.id,
        appId: deskApps.id,
        slug: deskApps.slug,
        appName: deskApps.name,
        connectorId: deskApps.connectorId,
        scimBaseUrl: deskApps.scimBaseUrl,
        tierId: deskAppTiers.id,
        tierName: deskAppTiers.name,
        monthlyCostCents: deskAppTiers.monthlyCostCents,
      })
      .from(accessGrants)
      .innerJoin(deskApps, eq(deskApps.id, accessGrants.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
      .where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, personId), isNull(accessGrants.revokedAt)))
      .orderBy(asc(deskApps.name));
    const hardware = await tx
      .select({ id: hardwareAssets.id, tag: hardwareAssets.tag, model: hardwareAssets.model })
      .from(hardwareAssets)
      .where(
        and(
          eq(hardwareAssets.tenantId, tenantId),
          eq(hardwareAssets.assignedPersonId, personId),
          ne(hardwareAssets.status, "retired"),
        ),
      )
      .orderBy(asc(hardwareAssets.tag));
    const driveTo = await recipientFor(tx, tenantId, person, config.lifecycle.driveTransferTo);
    const manager = await recipientFor(tx, tenantId, person, "manager");

    await cancelScheduled(tx, tenantId, personId, "offboarding", actor);
    const [plan] = await tx
      .insert(lifecyclePlans)
      .values({ tenantId, personId, kind: "offboarding", executeAt: at, createdByUserId: actorUserId(actor) })
      .returning({ id: lifecyclePlans.id });
    const planId = plan!.id;

    const tasks: TaskInsert[] = [];
    let position = 0;
    for (const g of grants) {
      tasks.push({
        tenantId,
        planId,
        kind: "revoke",
        key: `revoke:${g.slug}`,
        appId: g.appId,
        tierId: g.tierId,
        grantId: g.grantId,
        automatic: await isAutomaticApp(tx, tenantId, g),
        detail: { appName: g.appName, tierName: g.tierName, monthlyCostCents: g.monthlyCostCents },
        position: position++,
      });
    }
    // Transfers are checkable tasks in V1: no connector hands over Drive or CRM ownership.
    tasks.push({
      tenantId, planId, kind: "transfer", key: "transfer:drive", position: position++,
      detail: { toPersonId: driveTo?.id ?? null, toName: driveTo?.name ?? null },
    });
    const crm = grants.filter((g) => CRM_SLUGS.has(g.slug));
    if (crm.length) {
      tasks.push({
        tenantId, planId, kind: "transfer", key: "transfer:crm", position: position++,
        detail: { apps: crm.map((g) => g.appName), toPersonId: manager?.id ?? null, toName: manager?.name ?? null },
      });
    }
    tasks.push({
      tenantId, planId, kind: "transfer", key: "transfer:mail", position: position++,
      detail: { forwardToPersonId: manager?.id ?? null, forwardToName: manager?.name ?? null, days: config.lifecycle.mailForwardDays },
    });
    tasks.push({
      tenantId, planId, kind: "transfer", key: "transfer:idp", position: position++,
      detail: { deprovision: config.directory.deprovision, deleteAfterDays: config.directory.deleteAfterDays },
    });
    for (const h of hardware) {
      tasks.push({
        tenantId, planId, kind: "hardware", key: `hardware:${h.tag}`, hardwareId: h.id, position: position++,
        detail: { tag: h.tag, model: h.model, returnLabel: config.lifecycle.returnLabel },
      });
    }
    await tx.insert(lifecycleTasks).values(tasks);

    await journal(tx, tenantId, actor, "desk.lifecycle.scheduled", { type: "lifecycle_plan", id: planId }, {
      after: {
        kind: "offboarding",
        personId,
        person: person.name,
        executeAt: at.toISOString(),
        revokes: grants.length,
        automatic: tasks.filter((t) => t.automatic).length,
        transfers: tasks.filter((t) => t.kind === "transfer").length,
        hardware: hardware.length,
        monthlyCostCents: grants.reduce((s, g) => s + g.monthlyCostCents, 0),
      },
    });
    return planId;
  });
}

export async function scheduleOnboarding(tenantId: string, input: { personId: string; appIds: string[]; hardwareModels: string[] }, actor: Actor): Promise<string> {
  const appIds = [...new Set(input.appIds)];
  // 1. Read and pick the stock to reserve.
  const prep = await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskLifecycle");
    const [person] = await tx
      .select({ id: people.id, name: people.name, department: people.department, startsOn: people.startsOn, status: people.status })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.id, input.personId)))
      .limit(1);
    if (!person) throw new DeskEeError("person_not_found", "Unknown person");
    if (person.status === "departed") throw new DeskEeError("already_departed", "This person has already departed");
    const config = await loadDeskConfig(tx, tenantId);
    const tz = await tenantTimeZone(tx, tenantId);
    const now = new Date();
    let at = now;
    if (person.startsOn) {
      const planned = zonedDateTime(addDays(person.startsOn, -config.lifecycle.onboardingLeadDays), ONBOARDING_HOUR, 0, tz);
      if (planned > now) at = planned;
    }

    const [pack] = person.department
      ? await tx
          .select({ id: deskPacks.id })
          .from(deskPacks)
          .where(and(eq(deskPacks.tenantId, tenantId), eq(deskPacks.department, person.department)))
          .limit(1)
      : [];
    const packTiers = new Map<string, string | null>();
    if (pack) {
      const items = await tx
        .select({ appId: deskPackItems.appId, tierId: deskPackItems.tierId })
        .from(deskPackItems)
        .where(eq(deskPackItems.packId, pack.id));
      for (const i of items) packTiers.set(i.appId, i.tierId);
    }

    const apps = appIds.length
      ? await tx
          .select({
            id: deskApps.id,
            slug: deskApps.slug,
            name: deskApps.name,
            connectorId: deskApps.connectorId,
            scimBaseUrl: deskApps.scimBaseUrl,
          })
          .from(deskApps)
          .where(and(eq(deskApps.tenantId, tenantId), inArray(deskApps.id, appIds), isNull(deskApps.deletedAt)))
      : [];
    if (apps.length !== appIds.length) throw new DeskEeError("app_not_found", "Unknown application");
    const tiers = appIds.length
      ? await tx
          .select({ id: deskAppTiers.id, appId: deskAppTiers.appId, name: deskAppTiers.name, monthlyCostCents: deskAppTiers.monthlyCostCents })
          .from(deskAppTiers)
          .where(and(eq(deskAppTiers.tenantId, tenantId), inArray(deskAppTiers.appId, appIds)))
          .orderBy(asc(deskAppTiers.position), asc(deskAppTiers.monthlyCostCents))
      : [];

    const grantTasks = [];
    for (const appId of appIds) {
      const app = apps.find((a) => a.id === appId)!;
      const appTiers = tiers.filter((t) => t.appId === appId);
      const wanted = packTiers.get(appId);
      // The pack's tier when set, else the app's first tier.
      const tier = appTiers.find((t) => t.id === wanted) ?? appTiers[0];
      if (!tier) throw new DeskEeError("tier_not_found", `${app.name} has no licence tier`);
      grantTasks.push({
        app,
        tier,
        automatic: await isAutomaticApp(tx, tenantId, app),
      });
    }

    const reserve: Array<{ model: string; asset: typeof hardwareAssets.$inferSelect | null }> = [];
    const taken = new Set<string>();
    for (const model of input.hardwareModels) {
      let asset: typeof hardwareAssets.$inferSelect | null = null;
      if (config.lifecycle.reserveHardware) {
        const stock = await tx
          .select()
          .from(hardwareAssets)
          .where(
            and(
              eq(hardwareAssets.tenantId, tenantId),
              eq(hardwareAssets.model, model),
              eq(hardwareAssets.status, "in_stock"),
              isNull(hardwareAssets.assignedPersonId),
            ),
          )
          .orderBy(asc(hardwareAssets.tag));
        asset = stock.find((a) => !taken.has(a.id)) ?? null;
        if (asset) taken.add(asset.id);
      }
      reserve.push({ model, asset });
    }
    return { person, at, packId: pack?.id ?? null, grantTasks, reserve, reserveHardware: config.lifecycle.reserveHardware };
  });

  // 2. Reserve through the core (it journals the assignment) — its own transaction.
  for (const r of prep.reserve) {
    if (!r.asset) continue;
    await upsertHardware(
      tenantId,
      {
        id: r.asset.id,
        tag: r.asset.tag,
        model: r.asset.model,
        type: r.asset.type,
        serial: r.asset.serial,
        warrantyEndsOn: r.asset.warrantyEndsOn,
        purchasedOn: r.asset.purchasedOn,
        costCents: r.asset.costCents,
        assignedPersonId: input.personId,
        status: "assigned",
      },
      actor,
    );
  }

  // 3. The plan.
  return withTenant(tenantId, async (tx) => {
    await cancelScheduled(tx, tenantId, input.personId, "onboarding", actor);
    const [plan] = await tx
      .insert(lifecyclePlans)
      .values({
        tenantId,
        personId: input.personId,
        kind: "onboarding",
        executeAt: prep.at,
        packId: prep.packId,
        createdByUserId: actorUserId(actor),
      })
      .returning({ id: lifecyclePlans.id });
    const planId = plan!.id;
    const tasks: TaskInsert[] = [];
    let position = 0;
    for (const g of prep.grantTasks) {
      tasks.push({
        tenantId, planId, kind: "grant", key: `grant:${g.app.slug}`, appId: g.app.id, tierId: g.tier.id,
        automatic: g.automatic, position: position++,
        detail: { appName: g.app.name, tierName: g.tier.name, monthlyCostCents: g.tier.monthlyCostCents },
      });
    }
    for (const r of prep.reserve) {
      tasks.push({
        tenantId, planId, kind: "hardware", position: position++,
        key: r.asset ? `hardware:${r.asset.tag}` : `hardware:model:${r.model}`,
        hardwareId: r.asset?.id ?? null,
        // A reserved asset is already assigned; the task is handing it over on day one.
        detail: { model: r.model, tag: r.asset?.tag ?? null, reserved: !!r.asset, outOfStock: prep.reserveHardware && !r.asset },
      });
    }
    if (tasks.length) await tx.insert(lifecycleTasks).values(tasks);
    await journal(tx, tenantId, actor, "desk.lifecycle.scheduled", { type: "lifecycle_plan", id: planId }, {
      after: {
        kind: "onboarding",
        personId: input.personId,
        person: prep.person.name,
        executeAt: prep.at.toISOString(),
        grants: prep.grantTasks.length,
        automatic: prep.grantTasks.filter((g) => g.automatic).length,
        hardwareReserved: prep.reserve.filter((r) => r.asset).length,
        hardwareOutOfStock: prep.reserve.filter((r) => !r.asset).length,
        monthlyCostCents: prep.grantTasks.reduce((s, g) => s + g.tier.monthlyCostCents, 0),
      },
    });
    return planId;
  });
}

type HardwareRow = typeof hardwareAssets.$inferSelect;
function hardwareInput(a: HardwareRow) {
  return {
    id: a.id,
    tag: a.tag,
    model: a.model,
    type: a.type,
    serial: a.serial,
    warrantyEndsOn: a.warrantyEndsOn,
    purchasedOn: a.purchasedOn,
    costCents: a.costCents,
  };
}

/**
 * Ticks (or unticks) a task. Ticking an offboarding hardware task means the
 * device came back: it returns to stock, unassigned (through the core).
 */
export async function setLifecycleTaskDone(tenantId: string, taskId: string, done: boolean, actor: Actor): Promise<void> {
  const task = await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskLifecycle");
    const [task] = await tx
      .select({
        id: lifecycleTasks.id,
        kind: lifecycleTasks.kind,
        key: lifecycleTasks.key,
        done: lifecycleTasks.done,
        hardwareId: lifecycleTasks.hardwareId,
        planId: lifecyclePlans.id,
        planKind: lifecyclePlans.kind,
        planState: lifecyclePlans.state,
        personId: lifecyclePlans.personId,
      })
      .from(lifecycleTasks)
      .innerJoin(lifecyclePlans, eq(lifecyclePlans.id, lifecycleTasks.planId))
      .where(and(eq(lifecycleTasks.tenantId, tenantId), eq(lifecycleTasks.id, taskId)))
      .limit(1);
    if (!task) throw new DeskEeError("task_not_found", "Unknown task");
    if (task.planState === "cancelled") throw new DeskEeError("plan_cancelled", "This plan was cancelled");
    if (task.done === done) return null;
    await tx
      .update(lifecycleTasks)
      .set({ done, doneAt: done ? new Date() : null, doneByUserId: done ? actorUserId(actor) : null })
      .where(eq(lifecycleTasks.id, taskId));
    await journal(tx, tenantId, actor, done ? "desk.lifecycle.task_done" : "desk.lifecycle.task_reopened", { type: "lifecycle_task", id: taskId }, {
      after: { planId: task.planId, key: task.key },
    });
    if (task.kind !== "hardware" || task.planKind !== "offboarding" || !task.hardwareId) return null;
    const [asset] = await tx.select().from(hardwareAssets).where(eq(hardwareAssets.id, task.hardwareId)).limit(1);
    return asset ? { asset, personId: task.personId } : null;
  });
  if (!task) return;
  await upsertHardware(
    tenantId,
    done
      ? { ...hardwareInput(task.asset), assignedPersonId: null, status: "in_stock" }
      : { ...hardwareInput(task.asset), assignedPersonId: task.personId, status: "to_recover" },
    actor,
  );
}

/** The onboarding pack of a department: the apps a newcomer gets by default. */
export async function setPack(tenantId: string, department: string, appIds: string[], actor: Actor): Promise<void> {
  const dept = department.trim();
  if (!dept) throw new DeskEeError("invalid_department", "A pack needs a department");
  const ids = [...new Set(appIds)];
  await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskLifecycle");
    if (ids.length) {
      const found = await tx
        .select({ id: deskApps.id })
        .from(deskApps)
        .where(and(eq(deskApps.tenantId, tenantId), inArray(deskApps.id, ids), isNull(deskApps.deletedAt)));
      if (found.length !== ids.length) throw new DeskEeError("app_not_found", "Unknown application");
    }
    const [pack] = await tx
      .insert(deskPacks)
      .values({ tenantId, department: dept })
      .onConflictDoUpdate({ target: [deskPacks.tenantId, deskPacks.department], set: { department: dept } })
      .returning({ id: deskPacks.id });
    const packId = pack!.id;
    const before = await tx
      .delete(deskPackItems)
      .where(eq(deskPackItems.packId, packId))
      .returning({ appId: deskPackItems.appId, tierId: deskPackItems.tierId });
    const keptTier = new Map(before.map((b) => [b.appId, b.tierId]));
    if (ids.length) {
      await tx.insert(deskPackItems).values(ids.map((appId) => ({ tenantId, packId, appId, tierId: keptTier.get(appId) ?? null })));
    }
    await journal(tx, tenantId, actor, "desk.pack.set", { type: "desk_pack", id: packId }, {
      before: { department: dept, appIds: before.map((b) => b.appId) },
      after: { department: dept, appIds: ids },
    });
  });
}

/* ---------------- Execution (worker) ---------------- */

const EXECUTION_ACTOR = (kind: "onboarding" | "offboarding"): Actor => ({ kind: "rule", rule: kind });

/**
 * Runs one due plan. Every revoke/grant goes through the core API (journal,
 * connector or IT provisioning task); tasks covered by an automatic connector
 * are ticked, manual ones stay open for IT. Offboarding: devices go to
 * "to recover" and the person is marked departed.
 */
export async function executeLifecyclePlan(tenantId: string, planId: string): Promise<boolean> {
  const claimed = await withTenant(tenantId, async (tx) => {
    if (!(await hasEntitlement(tx, tenantId, "deskLifecycle"))) return null;
    const [plan] = await tx
      .update(lifecyclePlans)
      .set({ state: "running" })
      .where(and(eq(lifecyclePlans.tenantId, tenantId), eq(lifecyclePlans.id, planId), eq(lifecyclePlans.state, "scheduled")))
      .returning();
    if (!plan) return null;
    const tasks = await tx
      .select()
      .from(lifecycleTasks)
      .where(and(eq(lifecycleTasks.planId, planId), eq(lifecycleTasks.done, false)))
      .orderBy(asc(lifecycleTasks.position));
    const assetIds = tasks.map((t) => t.hardwareId).filter((x): x is string => !!x);
    const assets = assetIds.length ? await tx.select().from(hardwareAssets).where(inArray(hardwareAssets.id, assetIds)) : [];
    const grantIds = tasks.map((t) => t.grantId).filter((x): x is string => !!x);
    const grants = grantIds.length
      ? await tx.select({ id: accessGrants.id, revokedAt: accessGrants.revokedAt }).from(accessGrants).where(inArray(accessGrants.id, grantIds))
      : [];
    return { plan, tasks, assets, grants };
  });
  if (!claimed) return false;
  const { plan, tasks, assets, grants } = claimed;
  const actor = EXECUTION_ACTOR(plan.kind);
  const doneIds: string[] = [];
  const grantedIds = new Map<string, string>();
  const failures: Array<{ taskId: string; key: string; error: string }> = [];

  for (const t of tasks) {
    try {
      if (t.kind === "revoke" && t.grantId) {
        const g = grants.find((x) => x.id === t.grantId);
        if (g && !g.revokedAt) await revokeAccess(tenantId, t.grantId, plan.kind, actor);
        if (t.automatic) doneIds.push(t.id);
      } else if (t.kind === "grant" && t.appId && t.tierId && !t.grantId) {
        const grantId = await directGrant(tenantId, plan.personId, t.appId, t.tierId, null, actor);
        grantedIds.set(t.id, grantId);
        if (t.automatic) doneIds.push(t.id);
      } else if (t.kind === "hardware" && plan.kind === "offboarding" && t.hardwareId) {
        const a = assets.find((x) => x.id === t.hardwareId);
        if (a && a.status !== "to_recover" && a.status !== "retired") {
          await upsertHardware(tenantId, { ...hardwareInput(a), assignedPersonId: a.assignedPersonId, status: "to_recover" }, actor);
        }
      }
    } catch (err) {
      // Never silent: the task stays open for IT and the failure is journaled.
      failures.push({ taskId: t.id, key: t.key, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await withTenant(tenantId, async (tx) => {
    const now = new Date();
    if (doneIds.length) {
      await tx.update(lifecycleTasks).set({ done: true, doneAt: now }).where(inArray(lifecycleTasks.id, doneIds));
    }
    for (const [taskId, grantId] of grantedIds) {
      await tx.update(lifecycleTasks).set({ grantId }).where(eq(lifecycleTasks.id, taskId));
      // directGrant has no `source` parameter: the grant is re-labelled as onboarding here.
      await tx.update(accessGrants).set({ source: "onboarding" }).where(eq(accessGrants.id, grantId));
    }
    for (const f of failures) {
      await tx
        .update(lifecycleTasks)
        .set({ detail: { ...((tasks.find((t) => t.id === f.taskId)?.detail as object) ?? {}), error: f.error } })
        .where(eq(lifecycleTasks.id, f.taskId));
    }
    if (plan.kind === "offboarding") {
      const [before] = await tx
        .update(people)
        .set({ status: "departed", updatedAt: now })
        .where(and(eq(people.tenantId, tenantId), eq(people.id, plan.personId), ne(people.status, "departed")))
        .returning({ id: people.id });
      if (before) {
        await journal(tx, tenantId, actor, "desk.person.departed", { type: "person", id: plan.personId }, { after: { planId } });
      }
    }
    await tx.update(lifecyclePlans).set({ state: "done", executedAt: now }).where(eq(lifecyclePlans.id, planId));
    await journal(tx, tenantId, actor, "desk.lifecycle.executed", { type: "lifecycle_plan", id: planId }, {
      after: {
        kind: plan.kind,
        personId: plan.personId,
        automaticDone: doneIds.length,
        manualOpen: tasks.length - doneIds.length - failures.length,
        failures,
      },
    });
  });
  return true;
}

/** Worker: runs plans whose executeAt has passed. */
export async function executeDueLifecyclePlans(): Promise<{ executed: number }> {
  // Cross-tenant listing: the worker role reads past RLS; each plan then runs in its tenant.
  const due = await db
    .select({ id: lifecyclePlans.id, tenantId: lifecyclePlans.tenantId })
    .from(lifecyclePlans)
    .where(and(eq(lifecyclePlans.state, "scheduled"), lte(lifecyclePlans.executeAt, new Date())))
    .orderBy(asc(lifecyclePlans.executeAt))
    .limit(50);
  let executed = 0;
  for (const p of due) {
    try {
      if (await executeLifecyclePlan(p.tenantId, p.id)) executed++;
    } catch (err) {
      console.error("[desk] lifecycle plan failed", p.id, err);
    }
  }
  return { executed };
}
