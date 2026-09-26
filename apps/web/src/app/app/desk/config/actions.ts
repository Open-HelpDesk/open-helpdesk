"use server";

/**
 * SD-A9 — the writes of the configuration screen (core half).
 *
 * The screen autosaves one setting at a time: each call carries a one-key
 * patch, is checked against the values the screen offers (config-rules.ts),
 * and goes through `updateDeskConfig`, which writes the journal line.
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createDelegation, deleteDelegation, getDeskConfig, updateDeskConfig, type Actor } from "@/lib/desk";
import { requireManager } from "@/lib/session";
import { getT } from "@/i18n/server";
import type { ConfigPatch, SaveResult } from "@/components/desk/config/primitives";
import { isPublicSiemTarget, siemSigningSecret, signSiemBody, validSiemUrl } from "./siem";
import { UUID_RE as UUID, sanitizeConfigPatch } from "./config-rules";

const PATH = "/app/desk/config";

async function actor(): Promise<{ tenantId: string; actor: Actor }> {
  const { tenant, agent } = await requireManager();
  return { tenantId: tenant.id, actor: { kind: "agent", userId: agent.id } };
}

export async function saveDeskConfig(patch: ConfigPatch): Promise<SaveResult> {
  const t = await getT();
  const { tenantId, actor: who } = await actor();
  const clean = sanitizeConfigPatch(patch);
  if (!clean) return { ok: false, error: t("desk.cfg.invalidValue") };
  try {
    const config = await updateDeskConfig(tenantId, clean as ConfigPatch, who);
    revalidatePath(PATH);
    return { ok: true, config };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : t("desk.cfg.saveFailed") };
  }
}

/* ---------------- Delegations ---------------- */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addDelegation(input: { fromPersonId: string; toPersonId: string; startsOn: string; endsOn: string }): Promise<{ ok: boolean; error?: string }> {
  const t = await getT();
  const { tenantId, actor: who } = await actor();
  const { fromPersonId, toPersonId, startsOn, endsOn } = input;
  if (!UUID.test(fromPersonId) || !UUID.test(toPersonId) || !DATE.test(startsOn) || !DATE.test(endsOn)) {
    return { ok: false, error: t("desk.cfg.delegationIncomplete") };
  }
  if (fromPersonId === toPersonId) return { ok: false, error: t("desk.cfg.delegationSelf") };
  if (endsOn < startsOn) return { ok: false, error: t("desk.cfg.delegationDates") };
  try {
    await createDelegation(tenantId, fromPersonId, toPersonId, startsOn, endsOn, who);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : t("desk.cfg.saveFailed") };
  }
}

export async function removeDelegation(id: string): Promise<{ ok: boolean; error?: string }> {
  const t = await getT();
  const { tenantId, actor: who } = await actor();
  if (!UUID.test(id)) return { ok: false, error: t("desk.cfg.invalidValue") };
  try {
    await deleteDelegation(tenantId, id, who);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : t("desk.cfg.saveFailed") };
  }
}

/* ---------------- SIEM ---------------- */

/** The signing secret, on demand — never rendered into the page by default. */
export async function revealSiemSecret(): Promise<string> {
  const { tenantId } = await actor();
  return siemSigningSecret(tenantId);
}

/**
 * Posts one signed sample desk audit event to the saved SIEM webhook, and says
 * what came back. Nothing is written: a test is not a decision.
 */
export async function sendSiemTestEvent(): Promise<{ ok: boolean; status: number | null; ms: number; error?: string }> {
  const t = await getT();
  const { tenantId, actor: who } = await actor();
  const config = await getDeskConfig(tenantId);
  const url = config.compliance.siemWebhookUrl ? validSiemUrl(config.compliance.siemWebhookUrl) : null;
  if (!url) return { ok: false, status: null, ms: 0, error: t("desk.cfg.siemNoUrl") };
  if (!(await isPublicSiemTarget(url))) return { ok: false, status: null, ms: 0, error: t("desk.cfg.siemUnreachable") };

  const event = {
    id: randomUUID(),
    type: "desk.audit",
    test: true,
    occurredAt: new Date().toISOString(),
    tenantId,
    actor: { type: "agent", id: who.kind === "agent" ? who.userId : null },
    action: "access.granted",
    target: { type: "access_grant", id: null },
    data: { app: "Sample application", tier: "Member", person: "sample.employee@example.com", source: "request" },
  };
  const body = JSON.stringify(event);
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ohd-event": "desk.audit.test",
        "x-ohd-signature": signSiemBody(tenantId, body),
      },
      body,
      signal: controller.signal,
      redirect: "manual",
    });
    clearTimeout(timer);
    const ms = Date.now() - started;
    const ok = res.status >= 200 && res.status < 300;
    return { ok, status: res.status, ms, error: ok ? undefined : t("desk.cfg.siemHttpError", { status: String(res.status) }) };
  } catch {
    return { ok: false, status: null, ms: Date.now() - started, error: t("desk.cfg.siemUnreachable") };
  }
}
