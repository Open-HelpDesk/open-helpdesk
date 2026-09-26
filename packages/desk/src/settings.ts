/**
 * The configuration screen (SD-A9) as data: read through `resolveDeskConfig`,
 * written as a deep patch, journaled as a diff of the paths that changed.
 */
import { deskSettings } from "@openhelpdesk/db";
import type { DeepPartial } from "./api";
import { writeDeskAudit } from "./audit";
import { DEFAULT_DESK_CONFIG, resolveDeskConfig, type DeskConfig } from "./config";
import { DeskValidationError } from "./errors";
import { inTenant, loadConfig, requireEntitlement } from "./internal";
import type { Actor } from "./types";

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

/** Leaves whose default is null accept a string (or null) instead. */
const NULLABLE = new Set(["budgets.financePersonId", "compliance.siemWebhookUrl"]);

function applyPatch(base: Plain, patch: Plain, defaults: Plain, path: string[] = []): Plain {
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in defaults)) continue; // unknown keys are dropped, as resolveDeskConfig does
    const here = [...path, k];
    const def = defaults[k];
    if (isPlain(def)) {
      if (v === undefined) continue;
      if (!isPlain(v)) throw new DeskValidationError("invalid_input", here.join("."));
      out[k] = applyPatch(isPlain(base[k]) ? (base[k] as Plain) : def, v, def, here);
      continue;
    }
    if (v === undefined) continue;
    const key = here.join(".");
    const ok = NULLABLE.has(key) ? v === null || typeof v === "string" : typeof v === typeof def;
    if (!ok) throw new DeskValidationError("invalid_input", key);
    out[k] = v;
  }
  return out;
}

export function diffPaths(a: unknown, b: unknown, path: string[] = []): Array<{ path: string; before: unknown; after: unknown }> {
  if (isPlain(a) && isPlain(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => diffPaths(a[k], b[k], [...path, k]));
  }
  return a === b ? [] : [{ path: path.join("."), before: a ?? null, after: b ?? null }];
}

export async function getDeskConfig(tenantId: string): Promise<DeskConfig> {
  return inTenant(tenantId, (tx) => loadConfig(tx, tenantId));
}

export async function updateDeskConfig(tenantId: string, patch: DeepPartial<DeskConfig>, actor: Actor): Promise<DeskConfig> {
  return inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const current = await loadConfig(tx, tenantId);
    const next = resolveDeskConfig(applyPatch(current as unknown as Plain, patch as Plain, DEFAULT_DESK_CONFIG as unknown as Plain));
    const changes = diffPaths(current, next);
    if (changes.length === 0) return current;
    await tx
      .insert(deskSettings)
      .values({ tenantId, config: next })
      .onConflictDoUpdate({ target: deskSettings.tenantId, set: { config: next, updatedAt: new Date() } });
    await writeDeskAudit(
      tx,
      tenantId,
      actor,
      "desk.config.updated",
      { type: "desk_settings", id: null },
      { paths: changes.map((c) => c.path), ...Object.fromEntries(changes.map((c) => [c.path, c.after])) },
      Object.fromEntries(changes.map((c) => [c.path, c.before])),
    );
    return next;
  });
}
