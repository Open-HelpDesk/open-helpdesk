/**
 * The two gateways a phone can be reached through, and the dev provider that
 * stands in for them.
 *
 * Credentials are instance-level, not per workspace: a self-hosted instance
 * ships its own build of the app, so the signing key and the bundle id belong
 * to whoever ships it. Same shape as the mail package's providers, including the
 * `console` one that makes a local install work with nothing configured — the
 * notification is logged instead of sent, so the whole chain can be exercised
 * before an Apple key exists.
 *
 * Neither gateway needs a dependency: APNs is HTTP/2 with an ES256 token, FCM is
 * HTTPS with an RS256 service-account token, and Node signs both.
 */
import { createSign } from "node:crypto";
import { connect } from "node:http2";
import type { PushNotification } from "./payload";

export type PushPlatform = "ios" | "android";

export type SendResult = {
  ok: boolean;
  /**
   * The gateway says this token will never work again — the registration is
   * revoked rather than retried. Retrying a dead token forever is how a queue
   * fills up with deliveries for phones that were wiped months ago.
   */
  gone: boolean;
  detail?: string;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/* ---------- APNs ---------- */

type ApnsConfig = {
  teamId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
  host: string;
};

function apnsConfig(): ApnsConfig | null {
  const teamId = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!teamId || !keyId || !privateKey || !bundleId) return null;
  return {
    teamId,
    keyId,
    privateKey,
    bundleId,
    // The sandbox is a different host, not a flag: a build signed for
    // development can only be reached there, and sending its tokens to
    // production is the classic "why does nothing arrive".
    host: process.env.APNS_HOST ?? "https://api.push.apple.com",
  };
}

/** Provider tokens last an hour on Apple's side; this one is reused for fifty minutes. */
let apnsToken: { value: string; until: number } | null = null;

function apnsProviderToken(config: ApnsConfig): string {
  if (apnsToken && apnsToken.until > Date.now()) return apnsToken.value;
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) }),
  );
  // ES256 wants the raw r||s pair, not the DER structure Node signs by default.
  const signature = createSign("SHA256")
    .update(`${header}.${claims}`)
    .sign({ key: config.privateKey, dsaEncoding: "ieee-p1363" });
  const value = `${header}.${claims}.${base64url(signature)}`;
  apnsToken = { value, until: Date.now() + 50 * 60_000 };
  return value;
}

async function sendApns(
  config: ApnsConfig,
  deviceToken: string,
  notification: PushNotification,
): Promise<SendResult> {
  /*
   * `body` AND the loc-key, deliberately both.
   *
   * iOS renders `loc-key` against the app bundle's own `Localizable.strings`,
   * and displays the key verbatim when it is missing — so a payload carrying
   * only a key shows "push.ticketReply" to a real person until the app ships
   * those strings. The English sentence goes in `body` as the thing iOS will
   * actually display today; the key and its arguments travel alongside, for the
   * app (or a notification service extension) to rewrite in the reader's own
   * language when there is a translation to rewrite it with.
   *
   * `mutable-content` is what allows that rewriting to happen at all.
   */
  const body = JSON.stringify({
    aps: {
      alert: {
        body: notification.fallback,
        "loc-key": notification.locKey,
        "loc-args": notification.locArgs,
      },
      sound: "default",
      "mutable-content": 1,
    },
    ...notification.data,
    loc_key: notification.locKey,
    loc_args: notification.locArgs,
    fallback: notification.fallback,
  });

  return new Promise<SendResult>((resolve) => {
    const client = connect(config.host);
    const settle = (result: SendResult) => {
      client.close();
      resolve(result);
    };
    client.on("error", (err) => settle({ ok: false, gone: false, detail: String(err) }));

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${apnsProviderToken(config)}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let payload = "";
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    request.on("data", (chunk) => {
      payload += chunk;
    });
    request.on("error", (err) => settle({ ok: false, gone: false, detail: String(err) }));
    request.on("end", () => {
      if (status === 200) return settle({ ok: true, gone: false });
      // 410 Unregistered, or 400 with these reasons: the token is finished.
      const reason = (() => {
        try {
          return (JSON.parse(payload) as { reason?: string }).reason ?? "";
        } catch {
          return "";
        }
      })();
      const gone =
        status === 410 || reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic";
      settle({ ok: false, gone, detail: `apns ${status} ${reason}`.trim() });
    });
    request.setTimeout(10_000, () => settle({ ok: false, gone: false, detail: "apns timeout" }));
    request.end(body);
  });
}

/* ---------- FCM ---------- */

type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

function fcmConfig(): FcmConfig | null {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

let fcmAccessToken: { value: string; until: number } | null = null;

/** Service-account JWT traded for an OAuth token, cached until it nearly expires. */
async function fcmAccessTokenFor(config: FcmConfig): Promise<string | null> {
  if (fcmAccessToken && fcmAccessToken.until > Date.now()) return fcmAccessToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(config.privateKey);
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.error("[push] FCM token exchange failed:", response.status, await response.text());
    return null;
  }
  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  fcmAccessToken = {
    value: json.access_token,
    until: Date.now() + ((json.expires_in ?? 3600) - 300) * 1000,
  };
  return json.access_token;
}

async function sendFcm(
  config: FcmConfig,
  deviceToken: string,
  notification: PushNotification,
): Promise<SendResult> {
  const accessToken = await fcmAccessTokenFor(config);
  if (!accessToken) return { ok: false, gone: false, detail: "fcm auth unavailable" };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          android: {
            priority: "high",
            notification: {
              // Same pairing as APNs: the sentence Android will show, plus the
              // key it would prefer if the app has a string for it.
              body: notification.fallback,
              body_loc_key: notification.locKey,
              body_loc_args: notification.locArgs,
            },
          },
          // FCM data values are strings, all of them, always.
          data: {
            kind: notification.data.kind,
            ticket_number: String(notification.data.ticket_number),
            surface: notification.data.surface,
            fallback: notification.fallback,
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.ok) return { ok: true, gone: false };
  const text = await response.text();
  // UNREGISTERED (404) is a phone that uninstalled; INVALID_ARGUMENT on the
  // token is one that never existed. Both are dead ends, not retries.
  const gone = response.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text);
  return { ok: false, gone, detail: `fcm ${response.status} ${text.slice(0, 200)}` };
}

/* ---------- Selection ---------- */

export type PushProvider = "console" | "apns" | "fcm";

/**
 * Which gateway answers for a platform, given what the instance has configured.
 *
 * `PUSH_PROVIDER=console` forces the dev provider even where credentials exist —
 * useful on a staging instance that shares a database with nothing to notify.
 */
export function providerFor(platform: PushPlatform): PushProvider {
  if (process.env.PUSH_PROVIDER === "console") return "console";
  if (platform === "ios") return apnsConfig() ? "apns" : "console";
  return fcmConfig() ? "fcm" : "console";
}

export async function sendPush(
  platform: PushPlatform,
  deviceToken: string,
  notification: PushNotification,
): Promise<SendResult> {
  switch (providerFor(platform)) {
    case "apns":
      return sendApns(apnsConfig()!, deviceToken, notification);
    case "fcm":
      return sendFcm(fcmConfig()!, deviceToken, notification);
    default:
      /*
       * No credentials: say what would have been sent and to whom, then report
       * success. A local install must not accumulate failed jobs for a gateway
       * it was never meant to reach — and the line is how one checks the
       * fan-out is right before any key exists.
       */
      console.log(
        `[push:console] ${platform} ${deviceToken.slice(0, 12)}… ${notification.locKey}(${notification.locArgs.join(
          ", ",
        )}) → ${notification.fallback}`,
      );
      return { ok: true, gone: false };
  }
}
