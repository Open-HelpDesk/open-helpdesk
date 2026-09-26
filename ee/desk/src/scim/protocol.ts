/**
 * SCIM 2.0 protocol pieces with no database: schemas URNs, the error shape,
 * the filter subset identity providers actually send, and a PATCH engine that
 * applies RFC 7644 §3.5.2 operations to a stored JSON resource.
 *
 * The PATCH engine works on the JSON document, not on database columns: the
 * resource is patched as the identity provider sees it, stored, and the
 * person row is then re-derived from it. That keeps GET faithful to what was
 * sent, and keeps one mapping (resource → person) instead of one per op.
 */

export const SCHEMA_USER = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCHEMA_GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const SCHEMA_ENTERPRISE = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
/** Our extension for what neither core nor enterprise schema carries: hire and leave dates. */
export const SCHEMA_OHD = "urn:ietf:params:scim:schemas:extension:openhelpdesk:2.0:User";
export const SCHEMA_LIST = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCHEMA_ERROR = "urn:ietf:params:scim:api:messages:2.0:Error";
export const SCHEMA_PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
export const SCHEMA_SPC = "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig";
export const SCHEMA_RT = "urn:ietf:params:scim:schemas:core:2.0:ResourceType";
export const SCHEMA_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Schema";

export const SCIM_CONTENT_TYPE = "application/scim+json";
export const SCIM_BASE_PATH = "/api/scim/v2";

export type ScimType =
  | "invalidFilter"
  | "tooMany"
  | "uniqueness"
  | "mutability"
  | "invalidSyntax"
  | "invalidPath"
  | "noTarget"
  | "invalidValue"
  | "invalidVers"
  | "sensitive";

export class ScimError extends Error {
  constructor(
    public status: number,
    message: string,
    public scimType?: ScimType,
  ) {
    super(message);
  }
}

export function errorBody(status: number, detail: string, scimType?: ScimType) {
  return {
    schemas: [SCHEMA_ERROR],
    status: String(status),
    ...(scimType ? { scimType } : {}),
    detail,
  };
}

/* ---------------- Filters ---------------- */

export type ScimFilter = { attr: string; op: "eq" | "ne" | "co" | "sw" | "ew" | "pr"; value: string | boolean | null };

/**
 * `userName eq "a@b.c"`, `externalId eq "…"`, `displayName eq "…"`,
 * optionally joined with `and`. That is what Entra ID, Okta, OneLogin and
 * JumpCloud send; anything richer is refused with `invalidFilter` rather than
 * silently widened into "everything".
 */
export function parseFilter(input: string | null): ScimFilter[] {
  if (!input || !input.trim()) return [];
  const parts = input.split(/\s+and\s+/i);
  return parts.map((part) => {
    const m = part
      .trim()
      .match(/^([A-Za-z0-9:._\-[\]" ]+?)\s+(eq|ne|co|sw|ew)\s+("(?:[^"\\]|\\.)*"|true|false|null)$/i);
    if (m) {
      const raw = m[3]!;
      const value = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw === "null" ? null : raw.toLowerCase() === "true";
      return { attr: m[1]!.trim(), op: m[2]!.toLowerCase() as ScimFilter["op"], value };
    }
    const pr = part.trim().match(/^([A-Za-z0-9:._-]+)\s+pr$/i);
    if (pr) return { attr: pr[1]!, op: "pr" as const, value: null };
    throw new ScimError(400, `Unsupported filter: ${part.trim()}`, "invalidFilter");
  });
}

/* ---------------- Attribute paths ---------------- */

export type ParsedPath = {
  /** Lower-cased schema URN when the path is fully qualified, else null. */
  urn: string | null;
  attr: string;
  /** `emails[type eq "work"]` → the filter inside the brackets. */
  filter: ScimFilter | null;
  sub: string | null;
};

const KNOWN_URNS = [SCHEMA_ENTERPRISE, SCHEMA_OHD, SCHEMA_USER, SCHEMA_GROUP];

/**
 * `name.givenName`, `emails[type eq "work"].value`, `members[value eq "x"]`,
 * `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager`,
 * `urn:…:enterprise:2.0:User:manager.value`.
 */
export function parsePath(path: string): ParsedPath {
  let rest = path.trim();
  let urn: string | null = null;
  for (const known of KNOWN_URNS) {
    if (rest.toLowerCase().startsWith(known.toLowerCase() + ":")) {
      urn = known.toLowerCase();
      rest = rest.slice(known.length + 1);
      break;
    }
  }
  if (!urn && rest.toLowerCase().startsWith("urn:")) {
    // Unknown extension: keep the URN as everything up to the last colon.
    const idx = rest.lastIndexOf(":");
    urn = rest.slice(0, idx).toLowerCase();
    rest = rest.slice(idx + 1);
  }
  const m = rest.match(/^([A-Za-z0-9_$-]+)(?:\[(.+)\])?(?:\.([A-Za-z0-9_$-]+))?$/);
  if (!m) throw new ScimError(400, `Invalid path: ${path}`, "invalidPath");
  const filter = m[2] ? parseFilter(m[2])[0] ?? null : null;
  // A core-schema URN prefix adds nothing: `urn:…:core:2.0:User:userName` is `userName`.
  if (urn === SCHEMA_USER.toLowerCase() || urn === SCHEMA_GROUP.toLowerCase()) urn = null;
  return { urn, attr: m[1]!, filter, sub: m[3] ?? null };
}

/* ---------------- JSON helpers (case-insensitive attribute names, RFC 7643 §2.1) ---------------- */

export type Json = Record<string, unknown>;

export function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function keyOf(obj: Json, name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.keys(obj).find((k) => k.toLowerCase() === lower);
}

export function getAttr(obj: Json | undefined | null, name: string): unknown {
  if (!obj) return undefined;
  const k = keyOf(obj, name);
  return k === undefined ? undefined : obj[k];
}

function setAttr(obj: Json, name: string, value: unknown): void {
  const k = keyOf(obj, name) ?? name;
  obj[k] = value;
}

function deleteAttr(obj: Json, name: string): void {
  const k = keyOf(obj, name);
  if (k !== undefined) delete obj[k];
}

/** The container a parsed path addresses: the root, or an extension object. */
function containerFor(resource: Json, urn: string | null, create: boolean): Json | null {
  if (!urn) return resource;
  const k = Object.keys(resource).find((key) => key.toLowerCase() === urn);
  if (k && isObject(resource[k])) return resource[k] as Json;
  if (!create) return null;
  const canonical = KNOWN_URNS.find((u) => u.toLowerCase() === urn) ?? urn;
  const fresh: Json = {};
  resource[canonical] = fresh;
  const schemas = Array.isArray(resource.schemas) ? (resource.schemas as string[]) : [];
  if (!schemas.some((s) => s.toLowerCase() === urn)) resource.schemas = [...schemas, canonical];
  return fresh;
}

export function matches(item: unknown, filter: ScimFilter): boolean {
  if (!isObject(item)) return false;
  const actual = getAttr(item, filter.attr);
  if (filter.op === "pr") return actual !== undefined && actual !== null && actual !== "";
  const a = typeof actual === "string" ? actual.toLowerCase() : actual;
  const b = typeof filter.value === "string" ? filter.value.toLowerCase() : filter.value;
  switch (filter.op) {
    case "eq":
      return a === b;
    case "ne":
      return a !== b;
    case "co":
      return typeof a === "string" && typeof b === "string" && a.includes(b);
    case "sw":
      return typeof a === "string" && typeof b === "string" && a.startsWith(b);
    case "ew":
      return typeof a === "string" && typeof b === "string" && a.endsWith(b);
  }
  return false;
}

/** Entra ID sends booleans as the strings "True"/"False" in PATCH. */
export function coerceBool(v: unknown): unknown {
  if (typeof v === "string" && /^(true|false)$/i.test(v)) return v.toLowerCase() === "true";
  return v;
}

/* ---------------- PATCH ---------------- */

export type PatchOp = { op: string; path?: string; value?: unknown };

/** Attributes that are complex but single-valued: a string value is their `.value`. */
const REFERENCE_ATTRS = new Set(["manager"]);
const BOOLEAN_ATTRS = new Set(["active", "primary"]);

function normaliseValue(attr: string, value: unknown): unknown {
  if (BOOLEAN_ATTRS.has(attr.toLowerCase())) return coerceBool(value);
  if (REFERENCE_ATTRS.has(attr.toLowerCase()) && (typeof value === "string" || value === null)) {
    return value === null || value === "" ? null : { value };
  }
  return value;
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Multi-valued add: merge by `value` so re-adding the same member is a no-op (RFC 7644 §3.5.2.1). */
function mergeMulti(existing: unknown, incoming: unknown): unknown[] {
  const out = asArray(existing).slice();
  for (const item of asArray(incoming)) {
    const v = isObject(item) ? getAttr(item, "value") : item;
    const idx = out.findIndex((e) => (isObject(e) ? getAttr(e, "value") : e) === v && v !== undefined);
    if (idx >= 0) out[idx] = isObject(out[idx]) && isObject(item) ? { ...(out[idx] as Json), ...item } : item;
    else out.push(item);
  }
  return out;
}

export const MULTI_VALUED = new Set(["emails", "phonenumbers", "addresses", "members", "groups", "roles", "entitlements", "ims", "photos", "x509certificates"]);

function applyAtPath(resource: Json, op: "add" | "replace" | "remove", path: string, rawValue: unknown): void {
  const p = parsePath(path);
  const container = containerFor(resource, p.urn, op !== "remove");
  if (!container) {
    if (op === "remove") return;
    throw new ScimError(400, `No target for path ${path}`, "noTarget");
  }
  const isMulti = MULTI_VALUED.has(p.attr.toLowerCase());

  // emails[type eq "work"].value, members[value eq "x"]
  if (p.filter) {
    const list = asArray(getAttr(container, p.attr));
    const hits = list.filter((item) => matches(item, p.filter!));
    if (op === "remove") {
      if (p.sub) {
        for (const item of hits) deleteAttr(item as Json, p.sub);
        setAttr(container, p.attr, list);
      } else {
        setAttr(container, p.attr, list.filter((item) => !matches(item, p.filter!)));
      }
      return;
    }
    if (hits.length === 0) {
      // Entra ID replaces `emails[type eq "work"].value` on a user that has none yet:
      // create the element the filter describes (only for an `eq` filter).
      if (p.filter.op !== "eq") throw new ScimError(400, `No target for path ${path}`, "noTarget");
      const created: Json = { [p.filter.attr]: p.filter.value };
      if (p.sub) created[p.sub] = normaliseValue(p.sub, rawValue);
      else if (isObject(rawValue)) Object.assign(created, rawValue);
      setAttr(container, p.attr, [...list, created]);
      return;
    }
    for (const item of hits) {
      if (p.sub) setAttr(item as Json, p.sub, normaliseValue(p.sub, rawValue));
      else if (isObject(rawValue)) Object.assign(item as Json, rawValue);
    }
    setAttr(container, p.attr, list);
    return;
  }

  if (p.sub) {
    // name.givenName, manager.value
    if (op === "remove") {
      const parent = getAttr(container, p.attr);
      if (isObject(parent)) deleteAttr(parent, p.sub);
      return;
    }
    let parent = getAttr(container, p.attr);
    if (!isObject(parent)) {
      parent = {};
      setAttr(container, p.attr, parent);
    }
    setAttr(parent as Json, p.sub, normaliseValue(p.sub, rawValue));
    return;
  }

  if (op === "remove") {
    if (isMulti && rawValue !== undefined) {
      // Remove specific members: {"op":"remove","path":"members","value":[{"value":"id"}]}
      const drop = new Set(asArray(rawValue).map((v) => (isObject(v) ? getAttr(v, "value") : v)));
      setAttr(
        container,
        p.attr,
        asArray(getAttr(container, p.attr)).filter((e) => !drop.has(isObject(e) ? getAttr(e, "value") : e)),
      );
      return;
    }
    deleteAttr(container, p.attr);
    return;
  }

  const value = normaliseValue(p.attr, rawValue);
  if (isMulti) {
    setAttr(container, p.attr, op === "add" ? mergeMulti(getAttr(container, p.attr), value) : asArray(value));
    return;
  }
  const current = getAttr(container, p.attr);
  if (op === "add" && isObject(current) && isObject(value)) {
    setAttr(container, p.attr, { ...current, ...value });
    return;
  }
  if (value === null) deleteAttr(container, p.attr);
  else setAttr(container, p.attr, value);
}

/**
 * A path-less add/replace carries an object of attributes (Okta:
 * `{"op":"replace","value":{"active":false}}`). Its keys may themselves be
 * paths (`name.givenName`) or fully qualified (`urn:…:User:department`), or a
 * whole extension object keyed by its schema URN.
 */
function applyPathless(resource: Json, op: "add" | "replace", value: unknown): void {
  if (!isObject(value)) throw new ScimError(400, "A PATCH operation without path needs an object value", "invalidValue");
  for (const [key, v] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower === "schemas" || lower === "id" || lower === "meta") continue;
    // `urn:…:enterprise:2.0:User` (an extension object) vs `urn:…:2.0:User:manager` (a path).
    const isSchemaKey = lower.startsWith("urn:") && /:(user|group)$/i.test(lower);
    if (isSchemaKey && isObject(v)) {
      for (const [sub, sv] of Object.entries(v)) applyAtPath(resource, op, `${key}:${sub}`, sv);
      continue;
    }
    applyAtPath(resource, op, key, v);
  }
}

export function applyPatch(resource: Json, body: unknown): Json {
  if (!isObject(body)) throw new ScimError(400, "Body must be a PatchOp message", "invalidSyntax");
  const ops = getAttr(body, "Operations");
  if (!Array.isArray(ops)) throw new ScimError(400, "PatchOp needs an Operations array", "invalidSyntax");
  const next = structuredClone(resource);
  for (const raw of ops) {
    if (!isObject(raw)) throw new ScimError(400, "Invalid operation", "invalidSyntax");
    const op = String(getAttr(raw, "op") ?? "").toLowerCase();
    const path = getAttr(raw, "path") as string | undefined;
    const value = getAttr(raw, "value");
    if (op !== "add" && op !== "replace" && op !== "remove") {
      throw new ScimError(400, `Unknown operation ${op}`, "invalidSyntax");
    }
    if (!path) {
      if (op === "remove") throw new ScimError(400, "A remove operation needs a path", "noTarget");
      applyPathless(next, op, value);
    } else {
      applyAtPath(next, op, path, value);
    }
  }
  return next;
}
