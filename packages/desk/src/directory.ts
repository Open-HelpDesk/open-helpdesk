/**
 * The directory (spec 19 §5): people, their paired contact, managers,
 * absences, delegations and the computed groups.
 *
 * A person is never an agent and never only a contact — but always HAS a
 * contact: the contact is what signs in to the portal and what a ticket names
 * as its requester.
 */
import { and, count, eq, inArray, like, ne, or } from "drizzle-orm";
import {
  contacts,
  deskAppAutoGroups,
  deskDelegations,
  people,
  peopleGroupMembers,
  peopleGroups,
  type Tx,
} from "@openhelpdesk/db";
import type { CsvImportReport, PersonInput } from "./api";
import { writeDeskAudit } from "./audit";
import { parseCsv } from "./csv";
import { DeskNotFoundError, DeskValidationError } from "./errors";
import { domainT } from "./i18n";
import {
  dateIn,
  inTenant,
  isEmail,
  isIsoDate,
  normEmail,
  requireEntitlement,
  tenantInfo,
} from "./internal";
import type { Actor } from "./types";

type PersonStatus = (typeof people.$inferSelect)["status"];

/** `leaving` while a leave date is set and in the future; departed/suspended are left to lifecycle and the IdP. */
export function statusFor(current: PersonStatus | null, leavesOn: string | null, today: string): PersonStatus {
  if (current === "departed" || current === "suspended") return current;
  return leavesOn && leavesOn > today ? "leaving" : "active";
}

function cleanDate(v: string | null | undefined, field: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v.trim() === "") return null;
  const s = v.trim();
  if (!isIsoDate(s)) throw new DeskValidationError("invalid_date", `${field}: ${s}`);
  return s;
}

/** Would `managerId` above `personId` create a loop in the org chart? */
async function createsCycle(tx: Tx, tenantId: string, personId: string, managerId: string): Promise<boolean> {
  if (managerId === personId) return true;
  const rows = await tx.select({ id: people.id, managerId: people.managerId }).from(people).where(eq(people.tenantId, tenantId));
  const up = new Map(rows.map((r) => [r.id, r.managerId]));
  let cur: string | null | undefined = managerId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === personId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = up.get(cur);
  }
  return false;
}

export type UpsertOutcome = { personId: string; created: boolean; managerUnresolved: boolean };

export async function upsertPersonTx(tx: Tx, tenantId: string, input: PersonInput, actor: Actor, today: string): Promise<UpsertOutcome> {
  const email = normEmail(input.email ?? "");
  if (!isEmail(email)) throw new DeskValidationError("invalid_email", email);
  const name = input.name?.trim();
  if (!name) throw new DeskValidationError("invalid_input", "name");
  const startsOn = cleanDate(input.startsOn, "startsOn");
  const leavesOn = cleanDate(input.leavesOn, "leavesOn");

  let existing = input.externalId
    ? (await tx.select().from(people).where(and(eq(people.tenantId, tenantId), eq(people.externalId, input.externalId))))[0]
    : undefined;
  existing ??= (await tx.select().from(people).where(and(eq(people.tenantId, tenantId), eq(people.email, email))))[0];

  // Manager by email: undefined = untouched, empty = cleared, unknown = left for a second pass.
  let managerId: string | null | undefined = undefined;
  let managerUnresolved = false;
  if (input.managerEmail !== undefined) {
    const m = normEmail(input.managerEmail ?? "");
    if (!m) managerId = null;
    else {
      const [mgr] = await tx.select({ id: people.id }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.email, m)));
      if (mgr) managerId = mgr.id;
      else managerUnresolved = true;
    }
  }

  if (!existing) {
    const ent = await requireEntitlement(tx, tenantId, "serviceDesk");
    if (ent.maxDeskPeople !== null) {
      const [row] = await tx.select({ n: count() }).from(people).where(and(eq(people.tenantId, tenantId), ne(people.status, "departed")));
      if ((row?.n ?? 0) >= ent.maxDeskPeople) throw new DeskValidationError("people_limit");
    }
    let [contact] = await tx.select().from(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)));
    if (contact) {
      const [paired] = await tx.select({ id: people.id }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.contactId, contact.id)));
      if (paired) throw new DeskValidationError("invalid_input", "contact already paired");
      if (!contact.name) await tx.update(contacts).set({ name }).where(eq(contacts.id, contact.id));
    } else {
      [contact] = await tx.insert(contacts).values({ tenantId, email, name }).returning();
    }
    const [row] = await tx
      .insert(people)
      .values({
        tenantId,
        contactId: contact!.id,
        email,
        name,
        title: input.title?.trim() || null,
        department: input.department?.trim() || null,
        managerId: managerId ?? null,
        startsOn: startsOn ?? null,
        leavesOn: leavesOn ?? null,
        status: statusFor(null, leavesOn ?? null, today),
        source: input.source ?? "manual",
        externalId: input.externalId ?? null,
        lastSyncedAt: input.source && input.source !== "manual" ? new Date() : null,
      })
      .returning({ id: people.id });
    await writeDeskAudit(tx, tenantId, actor, "desk.person.created", { type: "person", id: row!.id }, { name, email, department: input.department ?? null, source: input.source ?? "manual" });
    return { personId: row!.id, created: true, managerUnresolved };
  }

  await requireEntitlement(tx, tenantId, "serviceDesk");
  if (managerId && (await createsCycle(tx, tenantId, existing.id, managerId))) throw new DeskValidationError("manager_cycle");
  const patch: Partial<typeof people.$inferInsert> = {
    email,
    name,
    ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
    ...(input.department !== undefined ? { department: input.department?.trim() || null } : {}),
    ...(managerId !== undefined ? { managerId } : {}),
    ...(startsOn !== undefined ? { startsOn } : {}),
    ...(leavesOn !== undefined ? { leavesOn } : {}),
    ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
    ...(input.source ? { source: input.source } : {}),
  };
  patch.status = statusFor(existing.status, patch.leavesOn !== undefined ? (patch.leavesOn ?? null) : existing.leavesOn, today);
  const changed = Object.entries(patch).filter(([k, v]) => (existing as Record<string, unknown>)[k] !== v).map(([k]) => k);
  if (changed.length === 0) return { personId: existing.id, created: false, managerUnresolved };
  await tx
    .update(people)
    .set({ ...patch, updatedAt: new Date(), ...(input.source && input.source !== "manual" ? { lastSyncedAt: new Date() } : {}) })
    .where(eq(people.id, existing.id));
  // The contact follows its person: same address, same name on the portal.
  if (changed.includes("email") || changed.includes("name")) {
    const [clash] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email), ne(contacts.id, existing.contactId)));
    await tx
      .update(contacts)
      .set({ name, ...(clash ? {} : { email }) })
      .where(eq(contacts.id, existing.contactId));
  }
  const before = Object.fromEntries(changed.map((k) => [k, (existing as Record<string, unknown>)[k] ?? null]));
  const after = Object.fromEntries(changed.map((k) => [k, (patch as Record<string, unknown>)[k] ?? null]));
  await writeDeskAudit(tx, tenantId, actor, "desk.person.updated", { type: "person", id: existing.id }, { name, fields: changed, ...after }, before);
  return { personId: existing.id, created: false, managerUnresolved };
}

export async function upsertPerson(tenantId: string, input: PersonInput, actor: Actor) {
  return inTenant(tenantId, async (tx) => {
    const tenant = await tenantInfo(tx, tenantId);
    const out = await upsertPersonTx(tx, tenantId, input, actor, dateIn(tenant.timezone));
    await syncComputedGroups(tx, tenantId, tenant.locale);
    return { personId: out.personId, created: out.created };
  });
}

const PEOPLE_COLUMNS = ["email", "name"] as const;

export async function importPeopleCsv(tenantId: string, csv: string, actor: Actor): Promise<CsvImportReport> {
  return inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const tenant = await tenantInfo(tx, tenantId);
    const today = dateIn(tenant.timezone);
    const report: CsvImportReport = { created: 0, updated: 0, errors: [] };
    const { headers, rows } = parseCsv(csv);
    const missing = PEOPLE_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length) {
      report.errors.push({ line: 1, message: "missing_columns" });
      return report;
    }
    const seen = new Set<string>();
    const pending: Array<{ line: number; email: string; manager: string }> = [];
    for (const row of rows) {
      const v = row.values;
      const email = normEmail(v.email ?? "");
      if (!email) {
        report.errors.push({ line: row.line, message: "missing_email" });
        continue;
      }
      if (seen.has(email)) {
        report.errors.push({ line: row.line, message: "duplicate_in_file" });
        continue;
      }
      seen.add(email);
      try {
        // A savepoint per line: one bad line is reported, the others still land.
        const out = await tx.transaction((sp) =>
          upsertPersonTx(
            sp,
            tenantId,
            {
              email,
              name: v.name ?? "",
              title: v.title ?? undefined,
              department: v.department ?? v.team ?? undefined,
              startsOn: v.starts_on ?? undefined,
              leavesOn: v.leaves_on ?? undefined,
              source: "csv",
            },
            actor,
            today,
          ),
        );
        if (out.created) report.created++;
        else report.updated++;
        const manager = normEmail(v.manager_email ?? v.manager ?? "");
        pending.push({ line: row.line, email, manager });
      } catch (err) {
        report.errors.push({ line: row.line, message: err instanceof DeskValidationError ? err.code : "invalid_input" });
      }
    }
    // Second pass: managers, now that everybody in the file exists.
    for (const p of pending) {
      try {
        await tx.transaction(async (sp) => {
          const [me] = await sp.select({ id: people.id, managerId: people.managerId, name: people.name }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.email, p.email)));
          if (!me) return;
          let managerId: string | null = null;
          if (p.manager) {
            const [mgr] = await sp.select({ id: people.id }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.email, p.manager)));
            if (!mgr) throw new DeskValidationError("manager_not_found");
            managerId = mgr.id;
          }
          if (managerId === me.managerId) return;
          if (managerId && (await createsCycle(sp, tenantId, me.id, managerId))) throw new DeskValidationError("manager_cycle");
          await sp.update(people).set({ managerId, updatedAt: new Date() }).where(eq(people.id, me.id));
          const managerName = managerId ? ((await sp.select({ name: people.name }).from(people).where(eq(people.id, managerId)))[0]?.name ?? null) : null;
          await writeDeskAudit(sp, tenantId, actor, "desk.person.manager_set", { type: "person", id: me.id }, { name: me.name, manager: managerName }, { managerId: me.managerId });
        });
      } catch (err) {
        report.errors.push({ line: p.line, message: err instanceof DeskValidationError ? err.code : "invalid_input" });
      }
    }
    report.errors.sort((a, b) => a.line - b.line);
    await syncComputedGroups(tx, tenantId, tenant.locale);
    await writeDeskAudit(tx, tenantId, actor, "desk.directory.imported", { type: "person", id: null }, { created: report.created, updated: report.updated, errors: report.errors.length });
    return report;
  });
}

export async function setManager(tenantId: string, personId: string, managerId: string | null, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const [me] = await tx.select().from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, personId)));
    if (!me) throw new DeskNotFoundError("person");
    let managerName: string | null = null;
    if (managerId) {
      const [mgr] = await tx.select({ name: people.name }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, managerId)));
      if (!mgr) throw new DeskNotFoundError("manager");
      if (await createsCycle(tx, tenantId, personId, managerId)) throw new DeskValidationError("manager_cycle");
      managerName = mgr.name;
    }
    if (me.managerId === managerId) return;
    await tx.update(people).set({ managerId, updatedAt: new Date() }).where(eq(people.id, personId));
    await writeDeskAudit(tx, tenantId, actor, "desk.person.manager_set", { type: "person", id: personId }, { name: me.name, manager: managerName }, { managerId: me.managerId });
  });
}

export async function setAbsence(tenantId: string, personId: string, absentUntil: string | null, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const until = cleanDate(absentUntil, "absentUntil") ?? null;
    const [me] = await tx.select().from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, personId)));
    if (!me) throw new DeskNotFoundError("person");
    if (me.absentUntil === until) return;
    await tx.update(people).set({ absentUntil: until, updatedAt: new Date() }).where(eq(people.id, personId));
    await writeDeskAudit(tx, tenantId, actor, "desk.person.absence_set", { type: "person", id: personId }, { name: me.name, until }, { absentUntil: me.absentUntil });
  });
}

export async function createDelegation(tenantId: string, fromPersonId: string, toPersonId: string, startsOn: string, endsOn: string, actor: Actor): Promise<string> {
  return inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    if (fromPersonId === toPersonId) throw new DeskValidationError("invalid_input", "self delegation");
    const s = cleanDate(startsOn, "startsOn");
    const e = cleanDate(endsOn, "endsOn");
    if (!s || !e || e < s) throw new DeskValidationError("invalid_date");
    const rows = await tx
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), inArray(people.id, [fromPersonId, toPersonId])));
    const from = rows.find((r) => r.id === fromPersonId);
    const to = rows.find((r) => r.id === toPersonId);
    if (!from || !to) throw new DeskNotFoundError("person");
    // A manager delegates their own approvals only (or an agent does it for them).
    if (actor.kind === "person" && actor.personId !== fromPersonId) throw new DeskValidationError("forbidden");
    const [row] = await tx.insert(deskDelegations).values({ tenantId, fromPersonId, toPersonId, startsOn: s, endsOn: e }).returning({ id: deskDelegations.id });
    await writeDeskAudit(tx, tenantId, actor, "desk.delegation.created", { type: "delegation", id: row!.id }, { from: from.name, to: to.name, startsOn: s, endsOn: e });
    return row!.id;
  });
}

export async function deleteDelegation(tenantId: string, delegationId: string, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const [d] = await tx.select().from(deskDelegations).where(and(eq(deskDelegations.tenantId, tenantId), eq(deskDelegations.id, delegationId)));
    if (!d) throw new DeskNotFoundError("delegation");
    if (actor.kind === "person" && actor.personId !== d.fromPersonId) throw new DeskValidationError("forbidden");
    const names = await tx.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, [d.fromPersonId, d.toPersonId]));
    await tx.delete(deskDelegations).where(eq(deskDelegations.id, delegationId));
    await writeDeskAudit(tx, tenantId, actor, "desk.delegation.deleted", { type: "delegation", id: delegationId }, {
      from: names.find((n) => n.id === d.fromPersonId)?.name ?? null,
      to: names.find((n) => n.id === d.toPersonId)?.name ?? null,
    });
  });
}

export async function personForContact(tenantId: string, contactId: string) {
  return inTenant(tenantId, async (tx) => {
    const [p] = await tx
      .select({ id: people.id, name: people.name, department: people.department })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.contactId, contactId)));
    if (!p) return null;
    const [reports] = await tx
      .select({ n: count() })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.managerId, p.id), ne(people.status, "departed")));
    return { ...p, isManager: (reports?.n ?? 0) > 0 };
  });
}

/* ---------------- Computed groups ---------------- */

export const EVERYONE_KIND = "everyone";
export const departmentKind = (department: string) => `department:${department}`;

async function freeName(tx: Tx, tenantId: string, wanted: string): Promise<string> {
  const taken = await tx
    .select({ name: peopleGroups.name })
    .from(peopleGroups)
    .where(and(eq(peopleGroups.tenantId, tenantId), or(eq(peopleGroups.name, wanted), like(peopleGroups.name, `${wanted} (%)`))));
  const names = new Set(taken.map((t) => t.name));
  if (!names.has(wanted)) return wanted;
  for (let i = 2; ; i++) if (!names.has(`${wanted} (${i})`)) return `${wanted} (${i})`;
}

/**
 * `everyone` and one `department:<name>` group per department, with their
 * members, kept equal to the directory. Departed people leave every computed
 * group. Emptied department groups disappear unless an app still uses them.
 */
export async function syncComputedGroups(tx: Tx, tenantId: string, locale: string): Promise<void> {
  const t = domainT(locale);
  const everyone = await tx
    .select({ id: people.id, department: people.department })
    .from(people)
    .where(and(eq(people.tenantId, tenantId), ne(people.status, "departed")));
  const departments = [...new Set(everyone.map((p) => p.department).filter((d): d is string => !!d))];

  const groups = await tx
    .select({ id: peopleGroups.id, kind: peopleGroups.kind })
    .from(peopleGroups)
    .where(and(eq(peopleGroups.tenantId, tenantId), or(eq(peopleGroups.kind, EVERYONE_KIND), like(peopleGroups.kind, "department:%"))));
  const byKind = new Map(groups.map((g) => [g.kind, g.id]));

  const want = new Map<string, string[]>([[EVERYONE_KIND, everyone.map((p) => p.id)]]);
  for (const d of departments) want.set(departmentKind(d), everyone.filter((p) => p.department === d).map((p) => p.id));

  for (const kind of want.keys()) {
    if (byKind.has(kind)) continue;
    const label = kind === EVERYONE_KIND ? t("desk.domain.group.everyone") : t("desk.domain.group.department", { department: kind.slice("department:".length) });
    const [g] = await tx
      .insert(peopleGroups)
      .values({ tenantId, name: await freeName(tx, tenantId, label), kind, source: "manual" })
      .returning({ id: peopleGroups.id });
    byKind.set(kind, g!.id);
  }

  const computedIds = [...byKind.values()];
  const current = computedIds.length
    ? await tx
        .select({ groupId: peopleGroupMembers.groupId, personId: peopleGroupMembers.personId })
        .from(peopleGroupMembers)
        .where(and(eq(peopleGroupMembers.tenantId, tenantId), inArray(peopleGroupMembers.groupId, computedIds)))
    : [];
  const have = new Set(current.map((m) => `${m.groupId}:${m.personId}`));
  const wanted = new Set<string>();
  const toInsert: Array<{ tenantId: string; groupId: string; personId: string }> = [];
  for (const [kind, members] of want) {
    const groupId = byKind.get(kind)!;
    for (const personId of members) {
      const key = `${groupId}:${personId}`;
      wanted.add(key);
      if (!have.has(key)) toInsert.push({ tenantId, groupId, personId });
    }
  }
  if (toInsert.length) await tx.insert(peopleGroupMembers).values(toInsert).onConflictDoNothing();
  const toDelete = current.filter((m) => !wanted.has(`${m.groupId}:${m.personId}`));
  for (const m of toDelete) {
    await tx.delete(peopleGroupMembers).where(and(eq(peopleGroupMembers.groupId, m.groupId), eq(peopleGroupMembers.personId, m.personId)));
  }

  // Department groups whose department is gone: removed, unless an app relies on them.
  const stale = [...byKind.entries()].filter(([kind]) => kind !== EVERYONE_KIND && !want.has(kind)).map(([, id]) => id);
  if (stale.length) {
    const used = await tx
      .select({ groupId: deskAppAutoGroups.groupId })
      .from(deskAppAutoGroups)
      .where(and(eq(deskAppAutoGroups.tenantId, tenantId), inArray(deskAppAutoGroups.groupId, stale)));
    const keep = new Set(used.map((u) => u.groupId));
    const drop = stale.filter((id) => !keep.has(id));
    if (drop.length) await tx.delete(peopleGroups).where(and(eq(peopleGroups.tenantId, tenantId), inArray(peopleGroups.id, drop)));
  }
}

export async function ensureComputedGroups(tenantId: string): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    const tenant = await tenantInfo(tx, tenantId);
    await syncComputedGroups(tx, tenantId, tenant.locale);
  });
}

