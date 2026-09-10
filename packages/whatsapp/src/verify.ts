/**
 * Inbound webhook verification.
 *
 * Meta signs every callback with `X-Hub-Signature-256`: HMAC-SHA256 of the
 * **raw body** using the app secret, prefixed `sha256=`. Two properties of that
 * sentence decide the implementation:
 *
 *  - **raw body.** Not the parsed object, not a re-serialised copy. `JSON.parse`
 *    then `JSON.stringify` changes key order and whitespace, and the signature
 *    stops matching for reasons that look like a wrong secret. The caller must
 *    hand us the bytes it received.
 *  - **it is the only thing standing between the internet and a sending
 *    gateway.** An unverified webhook lets anyone post a message into a
 *    customer's thread, and — through the outbound side — send WhatsApp
 *    messages in your name.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

/**
 * True when the header signs this exact body with this secret.
 *
 * Comparison is constant-time. A `===` on hex strings leaks, through timing,
 * how many leading characters were right — which is enough to forge a
 * signature one character at a time.
 */
export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;
  if (!header.startsWith(PREFIX)) return false;

  const received = header.slice(PREFIX.length).trim().toLowerCase();
  // Hex of SHA-256 is always 64 characters. Checking the length first keeps
  // timingSafeEqual from throwing on mismatched buffers, which would turn a
  // malformed header into a 500 instead of a clean refusal.
  if (received.length !== 64 || !/^[0-9a-f]+$/.test(received)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

/**
 * The subscription handshake: Meta calls the URL once with
 * `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge`, and expects the
 * challenge echoed back verbatim.
 *
 * The token is compared in constant time too. It is a shared secret of the same
 * nature as the app secret, and the fact that it is only used once does not
 * make it less worth protecting.
 */
export function challengeResponse(
  params: URLSearchParams,
  verifyToken: string,
): string | null {
  if (params.get("hub.mode") !== "subscribe") return null;
  const given = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge");
  if (!challenge || !verifyToken) return null;

  const a = Buffer.from(given);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? challenge : null;
}
