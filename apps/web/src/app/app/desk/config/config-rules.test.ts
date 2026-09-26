import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESK_CONFIG } from "@openhelpdesk/desk";
import { sanitizeConfigPatch } from "./config-rules";
import { isPublicSiemTarget, signSiemBody, siemSigningSecret, validSiemUrl } from "./siem";
import { createHmac } from "node:crypto";

/**
 * SD-A9 autosave: a server action receives whatever the network sends. These
 * tests pin that only values a control can produce are stored.
 */
describe("sanitizeConfigPatch", () => {
  it("accepts every default value of every setting", () => {
    for (const [section, fields] of Object.entries(DEFAULT_DESK_CONFIG)) {
      for (const [key, value] of Object.entries(fields)) {
        if (value === null) continue;
        expect(sanitizeConfigPatch({ [section]: { [key]: value } }), `${section}.${key}`).toEqual({ [section]: { [key]: value } });
      }
    }
  });

  it("refuses a value no control offers", () => {
    expect(sanitizeConfigPatch({ approvals: { remindAfterHours: 5 } })).toBeNull();
    expect(sanitizeConfigPatch({ budgets: { mode: "approve_everything" } })).toBeNull();
    expect(sanitizeConfigPatch({ access: { revokeOnExpiry: "yes" } })).toBeNull();
    expect(sanitizeConfigPatch({ directory: { deleteAfterDays: "30" } })).toBeNull();
  });

  it("refuses unknown sections and keys, including prototype keys", () => {
    expect(sanitizeConfigPatch({ billing: { seats: 3 } })).toBeNull();
    expect(sanitizeConfigPatch({ approvals: { skipManager: true } })).toBeNull();
    expect(sanitizeConfigPatch(JSON.parse('{"approvals":{"__proto__":true}}'))).toBeNull();
    expect(sanitizeConfigPatch({ approvals: { toString: true } })).toBeNull();
  });

  it("refuses the whole patch when one leaf is wrong", () => {
    expect(sanitizeConfigPatch({ approvals: { remindAfterHours: 4, escalateAfterHours: 12 } })).toBeNull();
  });

  it("requires a notification cell to carry exactly the three channels as booleans", () => {
    expect(sanitizeConfigPatch({ notifications: { access_ready: { chat: false, email: true, portal: true } } })).not.toBeNull();
    expect(sanitizeConfigPatch({ notifications: { access_ready: { email: true } } })).toBeNull();
    expect(sanitizeConfigPatch({ notifications: { access_ready: { chat: false, email: true, portal: true, sms: true } } })).toBeNull();
    expect(sanitizeConfigPatch({ notifications: { unknown_event: { chat: false, email: true, portal: true } } })).toBeNull();
  });

  it("takes a finance approver as a uuid or null", () => {
    expect(sanitizeConfigPatch({ budgets: { financePersonId: null } })).toEqual({ budgets: { financePersonId: null } });
    expect(sanitizeConfigPatch({ budgets: { financePersonId: "0b8e3f9c-2c4a-4c1e-9d59-1f4f4b3a7e21" } })).not.toBeNull();
    expect(sanitizeConfigPatch({ budgets: { financePersonId: "'; drop table people; --" } })).toBeNull();
  });

  it("trims a SIEM URL and refuses anything that is not http(s)", () => {
    expect(sanitizeConfigPatch({ compliance: { siemWebhookUrl: "  https://siem.example.com/h  " } })).toEqual({
      compliance: { siemWebhookUrl: "https://siem.example.com/h" },
    });
    expect(sanitizeConfigPatch({ compliance: { siemWebhookUrl: "javascript:alert(1)" } })).toBeNull();
    expect(sanitizeConfigPatch({ compliance: { siemWebhookUrl: "file:///etc/passwd" } })).toBeNull();
  });
});

describe("SIEM signature", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses plain http in production only", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(validSiemUrl("http://siem.example.com/h")).toBeNull();
    expect(validSiemUrl("https://siem.example.com/h")).not.toBeNull();
    vi.stubEnv("NODE_ENV", "development");
    expect(validSiemUrl("http://localhost:9999/h")).not.toBeNull();
  });

  it("signs the exact body with the per-workspace secret, like the product's webhooks", () => {
    vi.stubEnv("ENCRYPTION_KEY", "a-test-key-that-is-long-enough");
    const body = JSON.stringify({ a: 1 });
    const secret = siemSigningSecret("tenant-a");
    expect(signSiemBody("tenant-a", body)).toBe(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
    expect(siemSigningSecret("tenant-b")).not.toBe(secret);
  });
});

describe("SIEM receiver in production", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses internal addresses, accepts public ones", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const internal of ["https://127.0.0.1/", "https://169.254.169.254/", "https://10.1.2.3/", "https://192.168.1.1/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[fd00::1]/"]) {
      expect(await isPublicSiemTarget(new URL(internal)), internal).toBe(false);
    }
    expect(await isPublicSiemTarget(new URL("https://1.1.1.1/"))).toBe(true);
  });
});
