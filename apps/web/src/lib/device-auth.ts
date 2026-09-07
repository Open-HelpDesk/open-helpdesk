/**
 * Per-device sessions for the mobile app (MO-xx) — minting, revoking, and the
 * SSO handover code.
 *
 * The v1 API authenticated workspace API keys and nothing else, which is a
 * credential a phone cannot carry: it belongs to the workspace rather than to
 * an agent (so "my tickets" has no answer), it is shared with every integration
 * (so a lost phone means rotating what a CRM also uses), and it is minted by an
 * administrator rather than by signing in. A device session fixes all three —
 * one row per phone, owned by one agent, revocable on its own.
 *
 * Nothing here is written in clear text: the token and the handover code are
 * stored as SHA-256, like `api_keys.hashed_key`. A dump of these tables hands
 * over no working credential.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  contacts,
  db,
  deviceAuthCodes,
  deviceSessions,
  pushDevices,
  users,
} from "@openhelpdesk/db";

/** Same shape as `ohd_live_` keys, a different prefix: 401s stay diagnosable. */
export const DEVICE_TOKEN_RE = /^ohd_app_[a-f0-9]{48}$/;

/**
 * The customer app's token (MC-xx), deliberately a different prefix.
 *
 * The row already says whether a session belongs to an agent or to a contact,
 * so the prefix is not what enforces the boundary — the separate resolvers are.
 * It is what makes the boundary visible: a token pasted into the wrong endpoint
 * gets an answer that names the mistake, rather than a 401 that reads like a
 * broken sign-in.
 */
export const PORTAL_TOKEN_RE = /^ohd_ptl_[a-f0-9]{48}$/;

/**
 * 90 days, slid forward on every authenticated call.
 *
 * An agent who opens the app during a working week is never signed out; a phone
 * left in a drawer for a quarter stops being a way into the workspace. A fixed
 * expiry would have to choose between those two, and both choices are wrong.
 */
export const DEVICE_SESSION_TTL_MS = 90 * 24 * 3600 * 1000;

/** The browser→app handover is a redirect and an HTTP call, not a human step. */
const AUTH_CODE_TTL_MS = 2 * 60 * 1000;

export type DevicePlatform = "ios" | "android";

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * What the sign-in call may say about the phone it runs on.
 *
 * All three fields are optional and none is trusted for anything but display:
 * the session list is there to let an agent recognise a device, so a name is a
 * label, not an identity.
 */
export type DeviceInfo = {
  deviceName: string | null;
  platform: DevicePlatform | null;
  appVersion: string | null;
};

export function readDeviceInfo(raw: unknown): DeviceInfo {
  const device = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof device.name === "string" ? device.name.trim().slice(0, 80) : "";
  const platform = device.platform === "ios" || device.platform === "android" ? device.platform : null;
  const version =
    typeof device.app_version === "string" ? device.app_version.trim().slice(0, 32) : "";
  return { deviceName: name || null, platform, appVersion: version || null };
}

export type MintedSession = {
  /** Returned once, never stored, never recoverable — like an API key. */
  token: string;
  id: string;
  expiresAt: Date;
};

/**
 * Who a session or a handover code belongs to.
 *
 * One shape rather than two nullable ids, so a caller cannot forget to say —
 * the database refuses a row with both or neither, and this makes that refusal
 * unreachable from the application.
 */
export type SessionOwner =
  | { kind: "agent"; userId: string }
  | { kind: "contact"; contactId: string };

function ownerColumns(owner: SessionOwner) {
  return owner.kind === "agent"
    ? { userId: owner.userId, contactId: null }
    : { userId: null, contactId: owner.contactId };
}

export async function createDeviceSession(
  tenantId: string,
  owner: SessionOwner,
  device: DeviceInfo,
): Promise<MintedSession> {
  const prefix = owner.kind === "agent" ? "ohd_app_" : "ohd_ptl_";
  const token = `${prefix}${randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(Date.now() + DEVICE_SESSION_TTL_MS);
  const [row] = await db
    .insert(deviceSessions)
    .values({
      tenantId,
      ...ownerColumns(owner),
      hashedToken: hashSecret(token),
      deviceName: device.deviceName,
      platform: device.platform,
      appVersion: device.appVersion,
      lastSeenAt: new Date(),
      expiresAt,
    })
    .returning({ id: deviceSessions.id });
  return { token, id: row!.id, expiresAt };
}

/**
 * Sign out one phone.
 *
 * Its push registrations go with it: a device that can no longer read the
 * workspace has no business being told a ticket was assigned to whoever used to
 * be signed in on it.
 */
export async function revokeDeviceSession(tenantId: string, sessionId: string): Promise<void> {
  const now = new Date();
  await db
    .update(deviceSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(deviceSessions.tenantId, tenantId),
        eq(deviceSessions.id, sessionId),
        isNull(deviceSessions.revokedAt),
      ),
    );
  await db
    .update(pushDevices)
    .set({ revokedAt: now })
    .where(
      and(
        eq(pushDevices.tenantId, tenantId),
        eq(pushDevices.sessionId, sessionId),
        isNull(pushDevices.revokedAt),
      ),
    );
}

/* ---------- SSO handover (PKCE) ---------- */

/** base64url(SHA-256(verifier)), 43 characters — S256 and nothing else. */
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

export function isValidChallenge(value: string): boolean {
  return CHALLENGE_RE.test(value);
}

/**
 * The code an identity provider's redirect leaves for the app to collect.
 *
 * Bound to a challenge the app never sent anywhere else, because a custom URL
 * scheme is not exclusive to one installed app: another app registering
 * `openhelpdesk://` would receive the redirect too, and a code without a
 * verifier is worthless to it.
 */
export async function createAuthCode(
  tenantId: string,
  owner: SessionOwner,
  codeChallenge: string,
): Promise<string> {
  const code = randomBytes(32).toString("hex");
  await db.insert(deviceAuthCodes).values({
    tenantId,
    ...ownerColumns(owner),
    hashedCode: hashSecret(code),
    codeChallenge,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return code;
}

/**
 * Trade a code for the agent it was minted for, once.
 *
 * Single-use is enforced by the UPDATE itself rather than by a read followed by
 * a write: two calls racing on the same code would both pass a check-then-act,
 * and the loser of that race is a second device session nobody asked for.
 */
export async function consumeAuthCode(
  code: string,
  verifier: string,
): Promise<{ tenantId: string; owner: SessionOwner } | null> {
  if (!VERIFIER_RE.test(verifier)) return null;
  const [row] = await db
    .update(deviceAuthCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(deviceAuthCodes.hashedCode, hashSecret(code)),
        isNull(deviceAuthCodes.usedAt),
        gt(deviceAuthCodes.expiresAt, sql`now()`),
      ),
    )
    .returning({
      tenantId: deviceAuthCodes.tenantId,
      userId: deviceAuthCodes.userId,
      contactId: deviceAuthCodes.contactId,
      codeChallenge: deviceAuthCodes.codeChallenge,
    });
  if (!row) return null;

  const expected = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(row.codeChallenge);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const owner: SessionOwner | null = row.userId
    ? { kind: "agent", userId: row.userId }
    : row.contactId
      ? { kind: "contact", contactId: row.contactId }
      : null;
  if (!owner) return null;

  return { tenantId: row.tenantId, owner };
}

/* ---------- Scopes ---------- */

/**
 * What a phone may do, derived from the role rather than chosen at sign-in.
 *
 * A device session is the agent, so it can do what the agent can do in the web
 * workspace and no more. A Viewer reads: granting write here would hand out
 * through the API a permission the product denies on its own screens.
 */
export function scopesForRole(role: string): string[] {
  if (role === "viewer") return ["read"];
  return ["read", "write", "ticket:create"];
}

/** The agent behind a device session, or null when they are no longer one. */
export async function sessionAgent(tenantId: string, userId: string) {
  const [agent] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
  if (!agent || agent.status === "disabled") return null;
  return agent;
}

/**
 * The customer behind a portal session, or null when they may no longer sign in.
 *
 * Blocked is checked here, on every call, for the same reason the agent's
 * status is: blocking someone whose phone keeps working is not blocking them.
 */
export async function sessionContact(tenantId: string, contactId: string) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));
  if (!contact || contact.blocked) return null;
  return contact;
}
