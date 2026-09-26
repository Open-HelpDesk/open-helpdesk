/**
 * Plumbing shared by every desk module: tenant transactions, entitlements,
 * dates in the tenant's time zone, and side effects deferred until commit.
 */
import { and, eq } from "drizzle-orm";
import { CORE_ENTITLEMENTS, isSelfHosted, type Entitlements } from "@openhelpdesk/config";
import { deskSettings, people, tenants, users, withTenant, type Tx } from "@openhelpdesk/db";
import { resolveDeskConfig, type DeskConfig } from "./config";
import { DeskEntitlementError, DeskForbiddenError, DeskNotFoundError } from "./errors";
import type { Actor } from "./types";

export type TenantInfo = { id: string; slug: string; name: string; locale: string; timezone: string };

/**
 * Side effects (emails, rules engine) that must only happen once the
 * transaction has committed: an email announcing a request that then rolled
 * back would be a claim that is not true.
 */
export class Effects {
  private list: Array<() => Promise<unknown>> = [];
  add(fn: () => Promise<unknown>): void {
    this.list.push(fn);
  }
  async flush(): Promise<void> {
    const list = this.list;
    this.list = [];
    for (const fn of list) {
      try {
        await fn();
      } catch (err) {
        // A failed notification never undoes a committed decision; it is logged.
        console.error("[desk] post-commit effect failed:", err);
      }
    }
  }
}

/** Runs `fn` in a tenant transaction, then flushes the effects it queued. */
export async function inTenant<T>(tenantId: string, fn: (tx: Tx, fx: Effects) => Promise<T>): Promise<T> {
  const fx = new Effects();
  const out = await withTenant(tenantId, (tx) => fn(tx, fx));
  await fx.flush();
  return out;
}

export async function tenantInfo(tx: Tx, tenantId: string): Promise<TenantInfo> {
  const [row] = await tx
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name, locale: tenants.locale, timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!row) throw new DeskNotFoundError("tenant");
  return row;
}

/** Same resolution as apps/web `entitlementsFor`: tolerant merge onto the core set. */
export async function entitlementsOf(tx: Tx, tenantId: string): Promise<Entitlements> {
  if (isSelfHosted()) return CORE_ENTITLEMENTS;
  const [row] = await tx.select({ entitlements: tenants.entitlements }).from(tenants).where(eq(tenants.id, tenantId));
  const resolved = (row?.entitlements ?? null) as Partial<Entitlements> | null;
  return resolved ? { ...CORE_ENTITLEMENTS, ...resolved } : CORE_ENTITLEMENTS;
}

export async function requireEntitlement(tx: Tx, tenantId: string, ...keys: Array<keyof Entitlements>): Promise<Entitlements> {
  const ent = await entitlementsOf(tx, tenantId);
  for (const k of keys) if (!ent[k]) throw new DeskEntitlementError(k);
  return ent;
}

export async function loadConfig(tx: Tx, tenantId: string): Promise<DeskConfig> {
  const [row] = await tx.select({ config: deskSettings.config }).from(deskSettings).where(eq(deskSettings.tenantId, tenantId));
  return resolveDeskConfig(row?.config ?? {});
}

/* ---------------- Dates ---------------- */

/** YYYY-MM-DD of `now` in the given IANA time zone. */
export function dateIn(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/* ---------------- Actors ---------------- */

/** audit_events.actor_type / actor_id. Agents are written "user", as the rest of the journal does. */
export function actorColumns(actor: Actor): { actorType: string; actorId: string | null } {
  switch (actor.kind) {
    case "agent":
      return { actorType: "user", actorId: actor.userId };
    case "person":
      return { actorType: "person", actorId: actor.personId };
    case "rule":
      return { actorType: "rule", actorId: null };
    case "scim":
      return { actorType: "scim", actorId: null };
    case "system":
      return { actorType: "system", actorId: null };
  }
}

/** The display name of an actor, frozen into the journal line. */
export async function actorName(tx: Tx, actor: Actor): Promise<string | null> {
  if (actor.kind === "agent") {
    const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actor.userId));
    return u?.name ?? null;
  }
  if (actor.kind === "person") {
    const [p] = await tx.select({ name: people.name }).from(people).where(eq(people.id, actor.personId));
    return p?.name ?? null;
  }
  if (actor.kind === "rule") return actor.rule;
  return null;
}

export async function agentRole(tx: Tx, tenantId: string, userId: string): Promise<string | null> {
  const [u] = await tx
    .select({ role: users.role, status: users.status })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
  if (!u || u.status === "disabled") return null;
  return u.role;
}

/** Agent-only operations (IT). Viewers read, they do not act. */
export async function requireAgent(tx: Tx, tenantId: string, actor: Actor): Promise<string> {
  if (actor.kind !== "agent") throw new DeskForbiddenError("agent_only");
  const role = await agentRole(tx, tenantId, actor.userId);
  if (!role || role === "viewer") throw new DeskForbiddenError("agent_only");
  return role;
}

/** Only for jobs and ee callers: agents, rules, SCIM or the system — never an employee. */
export function requireNotPerson(actor: Actor): void {
  if (actor.kind === "person") throw new DeskForbiddenError("agent_only");
}

export function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(s: string): boolean {
  return EMAIL.test(s);
}
