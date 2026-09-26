/**
 * /Users — SCIM resource ↔ the service desk directory (`people`).
 *
 * The person row is written through the core `upsertPerson` (source `scim`)
 * so its paired contact, its audit line and the directory ceiling stay the
 * core's business. What the core API does not express — the SCIM resource as
 * received, the IdP status, the manager given by SCIM id — is written here,
 * each change with its own audit line.
 *
 * Visibility: a person is a SCIM resource while `scim_resource` is set. A
 * DELETE marks the person departed and clears it, so GET answers 404 as RFC
 * 7644 §3.6 requires — and a later POST of the same userName re-adopts the
 * row instead of colliding with it. The same adoption covers a directory
 * first imported by CSV and then pushed by the identity provider.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { contacts, people, peopleGroupMembers, peopleGroups, withTenant } from "@openhelpdesk/db";
import { setManager, upsertPerson, type Actor } from "@openhelpdesk/desk";
import { audit } from "../connectors/shared";
import { MAX_RESULTS } from "./discovery";
import {
  SCHEMA_ENTERPRISE,
  SCHEMA_LIST,
  SCHEMA_OHD,
  SCHEMA_USER,
  SCIM_BASE_PATH,
  ScimError,
  applyPatch,
  coerceBool,
  getAttr,
  isObject,
  parseFilter,
  type Json,
} from "./protocol";

const SCIM_ACTOR: Actor = { kind: "scim" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

type PersonRow = typeof people.$inferSelect;

/* ---------------- Resource → directory fields ---------------- */

export type DerivedUser = {
  userName: string;
  email: string;
  name: string;
  title: string | null;
  department: string | null;
  managerScimId: string | null;
  startsOn: string | null;
  leavesOn: string | null;
  externalId: string | null;
  active: boolean;
};

function ext(resource: Json, urn: string): Json | undefined {
  const k = Object.keys(resource).find((key) => key.toLowerCase() === urn.toLowerCase());
  return k && isObject(resource[k]) ? (resource[k] as Json) : undefined;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function isoDate(v: unknown, field: string): string | null {
  const s = str(v);
  if (!s) return null;
  const d = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) {
    throw new ScimError(400, `${field} must be an ISO 8601 date`, "invalidValue");
  }
  return d;
}

export function deriveUser(resource: Json): DerivedUser {
  const userName = str(getAttr(resource, "userName"));
  if (!userName) throw new ScimError(400, "userName is required", "invalidValue");

  const emails = getAttr(resource, "emails");
  const list = Array.isArray(emails) ? emails.filter(isObject) : [];
  const primary =
    list.find((e) => coerceBool(getAttr(e, "primary")) === true) ??
    list.find((e) => String(getAttr(e, "type") ?? "").toLowerCase() === "work") ??
    list[0];
  const email = (str(primary ? getAttr(primary, "value") : null) ?? (userName.includes("@") ? userName : null))?.toLowerCase();
  if (!email || !email.includes("@")) {
    throw new ScimError(400, "An email is required: emails[primary].value, or a userName that is an address", "invalidValue");
  }

  const nameObj = getAttr(resource, "name");
  const n = isObject(nameObj) ? nameObj : {};
  const given = str(getAttr(n, "givenName"));
  const family = str(getAttr(n, "familyName"));
  const name =
    str(getAttr(resource, "displayName")) ??
    str(getAttr(n, "formatted")) ??
    ([given, family].filter(Boolean).join(" ") || null) ??
    userName;

  const enterprise = ext(resource, SCHEMA_ENTERPRISE) ?? {};
  const manager = getAttr(enterprise, "manager");
  const managerScimId = isObject(manager) ? str(getAttr(manager, "value")) : str(manager);
  const ours = ext(resource, SCHEMA_OHD) ?? {};

  const active = coerceBool(getAttr(resource, "active"));
  return {
    userName,
    email,
    name,
    title: str(getAttr(resource, "title")),
    department: str(getAttr(enterprise, "department")),
    managerScimId,
    startsOn: isoDate(getAttr(ours, "hireDate"), "hireDate"),
    leavesOn: isoDate(getAttr(ours, "leaveDate"), "leaveDate"),
    externalId: str(getAttr(resource, "externalId")),
    active: active === undefined || active === null ? true : active === true,
  };
}

/* ---------------- Directory → resource ---------------- */

function etagOf(row: PersonRow): string {
  const h = createHash("sha1").update(JSON.stringify(row.scimResource ?? {})).update(row.status).update(String(row.updatedAt?.getTime?.() ?? "")).digest("hex");
  return `W/"${h.slice(0, 16)}"`;
}

export function userResource(row: PersonRow): Json {
  const stored = isObject(row.scimResource) ? (row.scimResource as Json) : {};
  const { id: _id, meta: _meta, ...rest } = stored;
  const schemas = Array.isArray(rest.schemas) ? (rest.schemas as string[]) : [];
  return {
    ...rest,
    schemas: schemas.includes(SCHEMA_USER) ? schemas : [SCHEMA_USER, ...schemas],
    id: row.id,
    ...(row.externalId ? { externalId: row.externalId } : {}),
    userName: getAttr(stored, "userName") ?? row.email,
    // The product's status wins: a departure decided here reads inactive at the IdP.
    active: row.status !== "suspended" && row.status !== "departed",
    meta: {
      resourceType: "User",
      created: row.createdAt.toISOString(),
      lastModified: row.updatedAt.toISOString(),
      location: `${SCIM_BASE_PATH}/Users/${row.id}`,
      version: etagOf(row),
    },
  };
}

/* ---------------- Reads ---------------- */

const visible = () => isNotNull(people.scimResource);

function filterSql(query: URLSearchParams): SQL[] {
  const clauses: SQL[] = [];
  for (const f of parseFilter(query.get("filter"))) {
    if (f.op !== "eq" || typeof f.value !== "string") {
      throw new ScimError(400, `Only "eq" filters are supported on Users (got ${f.attr} ${f.op})`, "invalidFilter");
    }
    const attr = f.attr.toLowerCase();
    if (attr === "username") clauses.push(sql`lower(${people.scimResource}->>'userName') = ${f.value.toLowerCase()}`);
    else if (attr === "externalid") clauses.push(eq(people.externalId, f.value));
    else if (attr === "id") clauses.push(isUuid(f.value) ? eq(people.id, f.value) : sql`false`);
    else if (attr === "emails" || attr === "emails.value" || /^emails\[.*\]\.value$/.test(attr)) {
      clauses.push(sql`lower(${people.email}) = ${f.value.toLowerCase()}`);
    } else if (attr === "displayname") clauses.push(sql`lower(${people.scimResource}->>'displayName') = ${f.value.toLowerCase()}`);
    else throw new ScimError(400, `Filtering Users on ${f.attr} is not supported`, "invalidFilter");
  }
  return clauses;
}

export function paging(query: URLSearchParams): { startIndex: number; count: number } {
  const start = Number.parseInt(query.get("startIndex") ?? "1", 10);
  const count = Number.parseInt(query.get("count") ?? String(MAX_RESULTS), 10);
  return {
    startIndex: Number.isFinite(start) && start > 0 ? start : 1,
    count: Number.isFinite(count) ? Math.min(Math.max(count, 0), MAX_RESULTS) : MAX_RESULTS,
  };
}

export async function listUsers(tenantId: string, query: URLSearchParams) {
  const where = and(eq(people.tenantId, tenantId), visible(), ...filterSql(query));
  const { startIndex, count } = paging(query);
  return withTenant(tenantId, async (tx) => {
    const [total] = await tx.select({ n: sql<number>`count(*)::int` }).from(people).where(where);
    const rows = count === 0 ? [] : await tx.select().from(people).where(where).orderBy(asc(people.createdAt), asc(people.id)).limit(count).offset(startIndex - 1);
    return {
      schemas: [SCHEMA_LIST],
      totalResults: total?.n ?? 0,
      startIndex,
      itemsPerPage: rows.length,
      Resources: rows.map(userResource),
    };
  });
}

async function findVisible(tenantId: string, id: string): Promise<PersonRow | null> {
  if (!isUuid(id)) return null;
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, id), visible()));
    return row ?? null;
  });
}

export async function getUser(tenantId: string, id: string): Promise<Json> {
  const row = await findVisible(tenantId, id);
  if (!row) throw new ScimError(404, `User ${id} not found`);
  return userResource(row);
}

/* ---------------- Writes ---------------- */

/** Strip what the server owns before storing: id and meta are ours, not the client's. */
function storable(resource: Json): Json {
  const { id: _id, meta: _meta, ...rest } = resource;
  return rest;
}

async function conflictFor(tenantId: string, u: DerivedUser, selfId: string | null): Promise<string | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: people.id, email: people.email, externalId: people.externalId, userName: sql<string | null>`${people.scimResource}->>'userName'` })
      .from(people)
      .where(
        and(
          eq(people.tenantId, tenantId),
          visible(),
          sql`(lower(${people.scimResource}->>'userName') = ${u.userName.toLowerCase()} or lower(${people.email}) = ${u.email}${u.externalId ? sql` or ${people.externalId} = ${u.externalId}` : sql``})`,
        ),
      );
    const other = rows.find((r) => r.id !== selfId);
    if (!other) return null;
    if (other.userName?.toLowerCase() === u.userName.toLowerCase()) return `userName ${u.userName} is already taken`;
    if (other.email.toLowerCase() === u.email) return `email ${u.email} is already taken`;
    return `externalId ${u.externalId} is already taken`;
  });
}

/** A row that exists but is not (or no longer) a SCIM resource: CSV import, manual, deleted. */
async function adoptable(tenantId: string, u: DerivedUser): Promise<PersonRow | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(people)
      .where(
        and(
          eq(people.tenantId, tenantId),
          isNull(people.scimResource),
          u.externalId ? sql`(lower(${people.email}) = ${u.email} or ${people.externalId} = ${u.externalId})` : sql`lower(${people.email}) = ${u.email}`,
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

function statusFor(u: DerivedUser, current: PersonRow["status"] | null): PersonRow["status"] {
  if (!u.active) return "suspended";
  const today = new Date().toISOString().slice(0, 10);
  if (u.leavesOn && u.leavesOn > today) return "leaving";
  if (u.leavesOn && u.leavesOn <= today && current === "departed") return "departed";
  return "active";
}

/**
 * Writes one SCIM user: the directory fields through the core, then the SCIM
 * specifics here. `existing` is the row being replaced (PUT/PATCH) or adopted.
 */
async function persistUser(tenantId: string, resource: Json, existing: PersonRow | null): Promise<PersonRow> {
  const u = deriveUser(resource);

  // The core finds a person by externalId, then by email. A rename at the IdP
  // (userName/UPN change) of a user without a stable externalId would
  // otherwise create a second person under the new address: move the row
  // (and its contact, unless the address is taken) first.
  if (existing && existing.email.toLowerCase() !== u.email && (!u.externalId || existing.externalId !== u.externalId)) {
    await withTenant(tenantId, async (tx) => {
      await tx.update(people).set({ email: u.email, updatedAt: new Date() }).where(and(eq(people.tenantId, tenantId), eq(people.id, existing.id)));
      const [clash] = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, u.email)));
      if (!clash) await tx.update(contacts).set({ email: u.email }).where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, existing.contactId)));
      await audit(tx, tenantId, SCIM_ACTOR, "desk.person.updated", { type: "person", id: existing.id }, { email: existing.email }, { fields: ["email"], email: u.email });
    });
  }

  const { personId } = await upsertPerson(
    tenantId,
    {
      email: u.email,
      name: u.name,
      title: u.title,
      department: u.department,
      startsOn: u.startsOn,
      leavesOn: u.leavesOn,
      externalId: u.externalId,
      source: "scim",
    },
    SCIM_ACTOR,
  );

  const managerId = u.managerScimId && isUuid(u.managerScimId) && u.managerScimId !== personId ? u.managerScimId : null;

  const row = await withTenant(tenantId, async (tx) => {
    const [before] = await tx.select().from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, personId)));
    if (!before) throw new Error("upsertPerson returned an unknown person");
    const status = statusFor(u, existing?.status ?? before.status);
    // The manager must be a person of this tenant; one not provisioned yet is
    // linked when it arrives (see linkPendingReports).
    let resolvedManager: string | null = null;
    if (managerId) {
      const [m] = await tx.select({ id: people.id }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, managerId)));
      resolvedManager = m?.id ?? null;
    }
    const [after] = await tx
      .update(people)
      .set({
        scimResource: storable(resource),
        externalId: u.externalId,
        source: "scim",
        status,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(people.tenantId, tenantId), eq(people.id, personId)))
      .returning();
    if (before.status !== status) {
      await audit(tx, tenantId, SCIM_ACTOR, `desk.person.${status === "suspended" ? "suspended" : "reactivated"}`, { type: "person", id: personId }, { status: before.status }, { status });
    }
    return { row: after!, resolvedManager, currentManager: before.managerId };
  });

  const wantManager = u.managerScimId ? row.resolvedManager : null;
  if (wantManager !== row.currentManager && (wantManager !== null || !u.managerScimId)) {
    await setManager(tenantId, personId, wantManager, SCIM_ACTOR);
  }
  await linkPendingReports(tenantId, personId);
  return (await findVisible(tenantId, personId)) ?? row.row;
}

/** People whose SCIM manager is this person but who arrived before it. */
async function linkPendingReports(tenantId: string, personId: string): Promise<void> {
  const reports = await withTenant(tenantId, (tx) =>
    tx
      .select({ id: people.id })
      .from(people)
      .where(
        and(
          eq(people.tenantId, tenantId),
          isNull(people.managerId),
          sql`${people.scimResource}->${SCHEMA_ENTERPRISE}->'manager'->>'value' = ${personId}`,
        ),
      ),
  );
  for (const r of reports) await setManager(tenantId, r.id, personId, SCIM_ACTOR);
}

function assertUserBody(body: unknown): Json {
  if (!isObject(body)) throw new ScimError(400, "Body must be a SCIM User", "invalidSyntax");
  return body;
}

export async function createUser(tenantId: string, body: unknown): Promise<Json> {
  const resource = assertUserBody(body);
  const u = deriveUser(resource);
  const conflict = await conflictFor(tenantId, u, null);
  if (conflict) throw new ScimError(409, conflict, "uniqueness");
  const existing = await adoptable(tenantId, u);
  return userResource(await persistUser(tenantId, resource, existing));
}

export async function replaceUser(tenantId: string, id: string, body: unknown): Promise<Json> {
  const existing = await findVisible(tenantId, id);
  if (!existing) throw new ScimError(404, `User ${id} not found`);
  const resource = assertUserBody(body);
  const conflict = await conflictFor(tenantId, deriveUser(resource), existing.id);
  if (conflict) throw new ScimError(409, conflict, "uniqueness");
  return userResource(await persistUser(tenantId, resource, existing));
}

export async function patchUser(tenantId: string, id: string, body: unknown): Promise<Json> {
  const existing = await findVisible(tenantId, id);
  if (!existing) throw new ScimError(404, `User ${id} not found`);
  const current = storable(userResource(existing));
  const next = applyPatch(current, body);
  const conflict = await conflictFor(tenantId, deriveUser(next), existing.id);
  if (conflict) throw new ScimError(409, conflict, "uniqueness");
  return userResource(await persistUser(tenantId, next, existing));
}

/**
 * DELETE: the person has left the identity provider. Status `departed`,
 * nothing destructive beyond that — the joiners-and-leavers workflow decides
 * what happens to the accesses.
 */
export async function deleteUser(tenantId: string, id: string): Promise<void> {
  const existing = await findVisible(tenantId, id);
  if (!existing) throw new ScimError(404, `User ${id} not found`);
  await withTenant(tenantId, async (tx) => {
    const today = new Date().toISOString().slice(0, 10);
    await tx
      .update(people)
      .set({ status: "departed", scimResource: null, leavesOn: existing.leavesOn ?? today, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(people.tenantId, tenantId), eq(people.id, existing.id)));
    // A deleted user is no member of any group the IdP manages.
    const scimGroups = tx.select({ id: peopleGroups.id }).from(peopleGroups).where(and(eq(peopleGroups.tenantId, tenantId), eq(peopleGroups.source, "scim")));
    await tx
      .delete(peopleGroupMembers)
      .where(and(eq(peopleGroupMembers.tenantId, tenantId), eq(peopleGroupMembers.personId, existing.id), inArray(peopleGroupMembers.groupId, scimGroups)));
    await audit(tx, tenantId, SCIM_ACTOR, "desk.person.departed", { type: "person", id: existing.id }, { status: existing.status }, { status: "departed", via: "scim_delete" });
  });
}
