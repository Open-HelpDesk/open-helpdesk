"use server";

/**
 * SD-A9 — the writes of the ee/ half of the configuration screen: inbound SCIM
 * token, provisioning connectors, separation-of-duties rules, budgets.
 *
 * Each action re-checks the role (requireManager) and leaves the entitlement
 * check to @openhelpdesk/ee-desk, which refuses without it. Errors come back as
 * values, not throws: the screen shows them in a toast and keeps its state.
 */
import { revalidatePath } from "next/cache";
import {
  deleteConnector,
  deleteSodRule,
  rotateScimToken,
  saveConnector,
  saveSodRule,
  setBudget,
  testConnector,
} from "@openhelpdesk/ee-desk";
import type { Actor } from "@openhelpdesk/desk";
import { requireManager } from "@/lib/session";
import { getT } from "@/i18n/server";

const PATH = "/app/desk/config";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

async function who(): Promise<{ tenantId: string; actor: Actor }> {
  const { tenant, agent } = await requireManager();
  return { tenantId: tenant.id, actor: { kind: "agent", userId: agent.id } };
}

async function run<T>(work: (tenantId: string, actor: Actor) => Promise<T>): Promise<Result<T>> {
  const t = await getT();
  const { tenantId, actor } = await who();
  try {
    const value = await work(tenantId, actor);
    revalidatePath(PATH);
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : t("desk.cfg.saveFailed") };
  }
}

/* ---------------- Inbound SCIM ---------------- */

/** The clear token comes back once, here; only its suffix is kept. */
export async function rotateScimTokenAction(): Promise<Result<{ token: string; suffix: string }>> {
  return run((tenantId, actor) => rotateScimToken(tenantId, actor));
}

/* ---------------- Connectors ---------------- */

/** Non-secret settings each kind accepts, and its write-only secrets. */
const CONNECTOR_FIELDS = {
  entra: { settings: ["tenantId", "clientId"], secrets: ["clientSecret"] },
  google: { settings: ["domain", "adminEmail"], secrets: ["serviceAccountKey"] },
  scim: { settings: [], secrets: [] },
} as const;

export type ConnectorForm = {
  id?: string;
  kind: "entra" | "google" | "scim";
  name: string;
  settings: Record<string, string>;
  /** Only the secrets typed in; empty ones are left unchanged. */
  secrets: Record<string, string>;
};

export async function saveConnectorAction(form: ConnectorForm): Promise<Result<string>> {
  const t = await getT();
  const fields = CONNECTOR_FIELDS[form.kind];
  if (!fields || (form.id && !UUID.test(form.id))) return { ok: false, error: t("desk.cfg.invalidValue") };
  const name = form.name.trim();
  if (!name) return { ok: false, error: t("desk.cfg.conn.nameRequired") };
  // saveConnector replaces the settings object: keys this form does not edit
  // (a group naming pattern, an API base URL) travel back unchanged.
  const settings: Record<string, string> = {};
  for (const [key, value] of Object.entries(form.settings ?? {}).slice(0, 30)) {
    if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key) && typeof value === "string") settings[key] = value.slice(0, 2000);
  }
  for (const key of fields.settings) settings[key] = String(form.settings[key] ?? "").trim();
  const secrets: Record<string, string> = {};
  for (const key of fields.secrets) {
    const v = String(form.secrets[key] ?? "").trim();
    if (v) secrets[key] = v;
  }
  if (form.kind === "google" && secrets.serviceAccountKey) {
    try {
      JSON.parse(secrets.serviceAccountKey);
    } catch {
      return { ok: false, error: t("desk.cfg.conn.badJson") };
    }
  }
  return run((tenantId, actor) =>
    saveConnector(tenantId, { id: form.id, kind: form.kind, name, settings, secrets: Object.keys(secrets).length ? secrets : undefined }, actor),
  );
}

export async function testConnectorAction(id: string): Promise<Result<{ ok: boolean; ms: number; message: string }>> {
  const t = await getT();
  if (!UUID.test(id)) return { ok: false, error: t("desk.cfg.invalidValue") };
  return run((tenantId, actor) => testConnector(tenantId, id, actor));
}

export async function deleteConnectorAction(id: string): Promise<Result> {
  const t = await getT();
  if (!UUID.test(id)) return { ok: false, error: t("desk.cfg.invalidValue") };
  return run(async (tenantId, actor) => {
    await deleteConnector(tenantId, id, actor);
    return undefined;
  });
}

/* ---------------- Separation of duties ---------------- */

export async function saveSodRuleAction(input: { id?: string; tierAId: string; tierBId: string; reason: string; enabled: boolean }): Promise<Result<string>> {
  const t = await getT();
  if ((input.id && !UUID.test(input.id)) || !UUID.test(input.tierAId) || !UUID.test(input.tierBId)) {
    return { ok: false, error: t("desk.cfg.sod.pickTwo") };
  }
  if (input.tierAId === input.tierBId) return { ok: false, error: t("desk.cfg.sod.sameTier") };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: t("desk.cfg.sod.reasonRequired") };
  return run((tenantId, actor) =>
    saveSodRule(tenantId, { id: input.id, tierAId: input.tierAId, tierBId: input.tierBId, reason, enabled: Boolean(input.enabled) }, actor),
  );
}

export async function deleteSodRuleAction(id: string): Promise<Result> {
  const t = await getT();
  if (!UUID.test(id)) return { ok: false, error: t("desk.cfg.invalidValue") };
  return run(async (tenantId, actor) => {
    await deleteSodRule(tenantId, id, actor);
    return undefined;
  });
}

/* ---------------- Budgets ---------------- */

export async function setBudgetAction(department: string, amountCents: number): Promise<Result> {
  const t = await getT();
  if (!department.trim() || !Number.isInteger(amountCents) || amountCents < 0 || amountCents > 2_000_000_000) {
    return { ok: false, error: t("desk.cfg.invalidValue") };
  }
  return run(async (tenantId, actor) => {
    await setBudget(tenantId, department, amountCents, actor);
    return undefined;
  });
}
