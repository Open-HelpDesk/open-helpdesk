/**
 * /Groups — SCIM groups ↔ `people_groups` (source `scim`) and their members.
 *
 * Membership is the table, not the stored resource: GET lists the members
 * the database holds, so a person removed by any other path is not reported
 * as a member. Computed groups (`everyone`, `department:*`) are the core's
 * and are never exposed or touched here; a manual static group whose name
 * the IdP pushes is adopted rather than refused, so an existing catalogue
 * rule keyed on it keeps working.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { people, peopleGroupMembers, peopleGroups, withTenant, type Tx } from "@openhelpdesk/db";
import type { Actor } from "@openhelpdesk/desk";
import { audit } from "../connectors/shared";
import { SCHEMA_GROUP, SCHEMA_LIST, SCIM_BASE_PATH, ScimError, applyPatch, getAttr, isObject, parseFilter, type Json } from "./protocol";
import { isUuid, paging } from "./users";

const SCIM_ACTOR: Actor = { kind: "scim" };
type GroupRow = typeof peopleGroups.$inferSelect;
type Member = { value: string; display: string };

const visible = () => and(isNotNull(peopleGroups.scimResource), eq(peopleGroups.source, "scim"));

async function membersOf(tx: Tx, tenantId: string, groupIds: string[]): Promise<Map<string, Member[]>> {
  const out = new Map<string, Member[]>();
  if (groupIds.length === 0) return out;
  const rows = await tx
    .select({ groupId: peopleGroupMembers.groupId, id: people.id, name: people.name })
    .from(peopleGroupMembers)
    .innerJoin(people, eq(people.id, peopleGroupMembers.personId))
    .where(and(eq(peopleGroupMembers.tenantId, tenantId), inArray(peopleGroupMembers.groupId, groupIds)))
    .orderBy(asc(people.name));
  for (const r of rows) {
    const list = out.get(r.groupId) ?? [];
    list.push({ value: r.id, display: r.name });
    out.set(r.groupId, list);
  }
  return out;
}

function groupResource(row: GroupRow, members: Member[] | null): Json {
  const stored = isObject(row.scimResource) ? (row.scimResource as Json) : {};
  const { id: _id, meta: _meta, members: _m, ...rest } = stored;
  const version = createHash("sha1").update(JSON.stringify(stored)).update(JSON.stringify(members ?? [])).digest("hex").slice(0, 16);
  return {
    ...rest,
    schemas: [SCHEMA_GROUP],
    id: row.id,
    ...(row.externalId ? { externalId: row.externalId } : {}),
    displayName: row.name,
    ...(members ? { members: members.map((m) => ({ ...m, $ref: `${SCIM_BASE_PATH}/Users/${m.value}` })) } : {}),
    meta: {
      resourceType: "Group",
      created: row.createdAt.toISOString(),
      lastModified: row.createdAt.toISOString(),
      location: `${SCIM_BASE_PATH}/Groups/${row.id}`,
      version: `W/"${version}"`,
    },
  };
}

function wantsMembers(query: URLSearchParams): boolean {
  const excluded = (query.get("excludedAttributes") ?? "").toLowerCase().split(",").map((s) => s.trim());
  if (excluded.includes("members")) return false;
  const attrs = query.get("attributes");
  if (attrs && !attrs.toLowerCase().split(",").map((s) => s.trim()).includes("members")) return false;
  return true;
}

function filterSql(query: URLSearchParams): SQL[] {
  const clauses: SQL[] = [];
  for (const f of parseFilter(query.get("filter"))) {
    if (f.op !== "eq" || typeof f.value !== "string") {
      throw new ScimError(400, `Only "eq" filters are supported on Groups (got ${f.attr} ${f.op})`, "invalidFilter");
    }
    const attr = f.attr.toLowerCase();
    if (attr === "displayname") clauses.push(sql`lower(${peopleGroups.name}) = ${f.value.toLowerCase()}`);
    else if (attr === "externalid") clauses.push(eq(peopleGroups.externalId, f.value));
    else if (attr === "id") clauses.push(isUuid(f.value) ? eq(peopleGroups.id, f.value) : sql`false`);
    else if (attr === "members.value" || attr === "members") {
      clauses.push(
        isUuid(f.value)
          ? sql`exists (select 1 from ${peopleGroupMembers} m where m.group_id = ${peopleGroups.id} and m.person_id = ${f.value})`
          : sql`false`,
      );
    } else throw new ScimError(400, `Filtering Groups on ${f.attr} is not supported`, "invalidFilter");
  }
  return clauses;
}

export async function listGroups(tenantId: string, query: URLSearchParams) {
  const where = and(eq(peopleGroups.tenantId, tenantId), visible(), ...filterSql(query));
  const { startIndex, count } = paging(query);
  return withTenant(tenantId, async (tx) => {
    const [total] = await tx.select({ n: sql<number>`count(*)::int` }).from(peopleGroups).where(where);
    const rows = count === 0 ? [] : await tx.select().from(peopleGroups).where(where).orderBy(asc(peopleGroups.createdAt), asc(peopleGroups.id)).limit(count).offset(startIndex - 1);
    const members = wantsMembers(query) ? await membersOf(tx, tenantId, rows.map((r) => r.id)) : null;
    return {
      schemas: [SCHEMA_LIST],
      totalResults: total?.n ?? 0,
      startIndex,
      itemsPerPage: rows.length,
      Resources: rows.map((r) => groupResource(r, members ? members.get(r.id) ?? [] : null)),
    };
  });
}

async function findVisible(tx: Tx, tenantId: string, id: string): Promise<GroupRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.select().from(peopleGroups).where(and(eq(peopleGroups.tenantId, tenantId), eq(peopleGroups.id, id), visible()));
  return row ?? null;
}

export async function getGroup(tenantId: string, id: string, query: URLSearchParams): Promise<Json> {
  return withTenant(tenantId, async (tx) => {
    const row = await findVisible(tx, tenantId, id);
    if (!row) throw new ScimError(404, `Group ${id} not found`);
    const members = wantsMembers(query) ? (await membersOf(tx, tenantId, [row.id])).get(row.id) ?? [] : null;
    return groupResource(row, members);
  });
}

function derive(resource: Json): { name: string; externalId: string | null; memberIds: string[] } {
  const name = getAttr(resource, "displayName");
  if (typeof name !== "string" || !name.trim()) throw new ScimError(400, "displayName is required", "invalidValue");
  const externalId = getAttr(resource, "externalId");
  const raw = getAttr(resource, "members");
  const memberIds = (Array.isArray(raw) ? raw : [])
    .map((m) => (isObject(m) ? getAttr(m, "value") : m))
    .filter((v): v is string => typeof v === "string");
  return { name: name.trim(), externalId: typeof externalId === "string" && externalId ? externalId : null, memberIds: [...new Set(memberIds)] };
}

function storable(resource: Json): Json {
  const { id: _id, meta: _meta, members: _members, ...rest } = resource;
  return rest;
}

/** Sets the membership to exactly `wanted` (unknown ids are ignored: users out of provisioning scope). */
async function syncMembers(tx: Tx, tenantId: string, groupId: string, wanted: string[]): Promise<{ added: string[]; removed: string[] }> {
  const valid = wanted.filter(isUuid);
  const known = valid.length
    ? (await tx.select({ id: people.id }).from(people).where(and(eq(people.tenantId, tenantId), inArray(people.id, valid)))).map((r) => r.id)
    : [];
  const current = (
    await tx.select({ id: peopleGroupMembers.personId }).from(peopleGroupMembers).where(and(eq(peopleGroupMembers.tenantId, tenantId), eq(peopleGroupMembers.groupId, groupId)))
  ).map((r) => r.id);
  const added = known.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !known.includes(id));
  if (added.length) await tx.insert(peopleGroupMembers).values(added.map((personId) => ({ tenantId, groupId, personId }))).onConflictDoNothing();
  if (removed.length) {
    await tx.delete(peopleGroupMembers).where(and(eq(peopleGroupMembers.tenantId, tenantId), eq(peopleGroupMembers.groupId, groupId), inArray(peopleGroupMembers.personId, removed)));
  }
  return { added, removed };
}

async function nameConflict(tx: Tx, tenantId: string, name: string, selfId: string | null): Promise<GroupRow | null> {
  const [row] = await tx.select().from(peopleGroups).where(and(eq(peopleGroups.tenantId, tenantId), sql`lower(${peopleGroups.name}) = ${name.toLowerCase()}`));
  return row && row.id !== selfId ? row : null;
}

export async function createGroup(tenantId: string, body: unknown): Promise<Json> {
  if (!isObject(body)) throw new ScimError(400, "Body must be a SCIM Group", "invalidSyntax");
  const g = derive(body);
  return withTenant(tenantId, async (tx) => {
    const clash = await nameConflict(tx, tenantId, g.name, null);
    let row: GroupRow;
    if (clash) {
      // Already managed by the IdP, or computed by the product: a real conflict.
      if ((clash.source === "scim" && clash.scimResource) || clash.kind !== "static") {
        throw new ScimError(409, `A group named ${g.name} already exists`, "uniqueness");
      }
      [row] = (await tx
        .update(peopleGroups)
        .set({ source: "scim", externalId: g.externalId, scimResource: storable(body) })
        .where(and(eq(peopleGroups.tenantId, tenantId), eq(peopleGroups.id, clash.id)))
        .returning()) as [GroupRow];
    } else {
      if (g.externalId) {
        const [ext] = await tx.select({ id: peopleGroups.id }).from(peopleGroups).where(and(eq(peopleGroups.tenantId, tenantId), eq(peopleGroups.externalId, g.externalId)));
        if (ext) throw new ScimError(409, `externalId ${g.externalId} is already taken`, "uniqueness");
      }
      [row] = (await tx
        .insert(peopleGroups)
        .values({ tenantId, name: g.name, kind: "static", source: "scim", externalId: g.externalId, scimResource: storable(body) })
        .returning()) as [GroupRow];
    }
    const diff = await syncMembers(tx, tenantId, row.id, g.memberIds);
    await audit(tx, tenantId, SCIM_ACTOR, "desk.group.created", { type: "people_group", id: row.id }, null, { name: g.name, ...diff });
    return groupResource(row, (await membersOf(tx, tenantId, [row.id])).get(row.id) ?? []);
  });
}

async function writeGroup(tx: Tx, tenantId: string, existing: GroupRow, resource: Json): Promise<Json> {
  const g = derive(resource);
  if (await nameConflict(tx, tenantId, g.name, existing.id)) throw new ScimError(409, `A group named ${g.name} already exists`, "uniqueness");
  const [row] = (await tx
    .update(peopleGroups)
    .set({ name: g.name, externalId: g.externalId, scimResource: storable(resource) })
    .where(and(eq(peopleGroups.tenantId, tenantId), eq(peopleGroups.id, existing.id)))
    .returning()) as [GroupRow];
  const diff = await syncMembers(tx, tenantId, row.id, g.memberIds);
  if (existing.name !== g.name || diff.added.length || diff.removed.length) {
    await audit(tx, tenantId, SCIM_ACTOR, "desk.group.updated", { type: "people_group", id: row.id }, { name: existing.name }, { name: g.name, ...diff });
  }
  return groupResource(row, (await membersOf(tx, tenantId, [row.id])).get(row.id) ?? []);
}

export async function replaceGroup(tenantId: string, id: string, body: unknown): Promise<Json> {
  if (!isObject(body)) throw new ScimError(400, "Body must be a SCIM Group", "invalidSyntax");
  return withTenant(tenantId, async (tx) => {
    const existing = await findVisible(tx, tenantId, id);
    if (!existing) throw new ScimError(404, `Group ${id} not found`);
    return writeGroup(tx, tenantId, existing, body);
  });
}

export async function patchGroup(tenantId: string, id: string, body: unknown): Promise<Json> {
  return withTenant(tenantId, async (tx) => {
    const existing = await findVisible(tx, tenantId, id);
    if (!existing) throw new ScimError(404, `Group ${id} not found`);
    const members = (await membersOf(tx, tenantId, [existing.id])).get(existing.id) ?? [];
    const current: Json = { ...storable(groupResource(existing, members)), members: members.map((m) => ({ value: m.value })) };
    return writeGroup(tx, tenantId, existing, applyPatch(current, body));
  });
}

export async function deleteGroup(tenantId: string, id: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const existing = await findVisible(tx, tenantId, id);
    if (!existing) throw new ScimError(404, `Group ${id} not found`);
    await tx.delete(peopleGroups).where(and(eq(peopleGroups.tenantId, tenantId), eq(peopleGroups.id, existing.id)));
    await audit(tx, tenantId, SCIM_ACTOR, "desk.group.deleted", { type: "people_group", id: existing.id }, { name: existing.name }, null);
  });
}
