"use server";

/**
 * AG-04 — ce que l'écran ticket demande à l'assistant.
 *
 * Trois actions, une par capacité, et toutes rendent la même forme : soit une
 * sortie, soit **le motif** de son absence. C'est ce motif qui permet à l'écran
 * de dire « rien dans la base ne répond à ceci » plutôt que d'afficher un
 * brouillon vide — et de proposer la suite utile, qui est d'écrire l'article
 * manquant.
 *
 * Rien ici ne décide de ce qui est permis : `capabilityAllowed` le fait dans
 * `ee/ai`, au plus près du journal. Ces fonctions ne font que traduire une
 * intention d'écran en appel gouverné.
 */
import { decryptSecret } from "@openhelpdesk/crypto";
import {
  draftReply,
  providerFor,
  summarizeThread,
  suggestMacro,
  type OutcomeReason,
} from "@openhelpdesk/ee-ai";
import { requireAgent } from "@/lib/session";
import { entitlementsFor } from "@/lib/entitlements";

export type AiResult<T> = { ok: true; value: T } | { ok: false; reason: OutcomeReason };

export type DraftPayload = {
  text: string;
  sources: { title: string; refId: string; source: string }[];
};

/** L'acteur, tel que le journal le retiendra : l'agent qui a cliqué. */
async function context() {
  const { tenant, agent } = await requireAgent();
  const provider = await providerFor(tenant.id, decryptSecret);
  return {
    tenantId: tenant.id,
    provider,
    entitlements: entitlementsFor(tenant),
    actor: { kind: "agent" as const, userId: agent.id, name: agent.name },
  };
}

export async function aiSummary(ticketId: string): Promise<AiResult<string>> {
  const { tenantId, provider, actor } = await context();
  if (!provider) return { ok: false, reason: "unconfigured" };
  try {
    return await summarizeThread(provider, tenantId, ticketId, actor);
  } catch {
    /* Le fournisseur a échoué ou coupé la réponse. L'appel est déjà journalisé
       par `runCapability` ; l'écran n'a besoin que de savoir qu'il n'y a rien. */
    return { ok: false, reason: "no_source" };
  }
}

export async function aiDraft(ticketId: string): Promise<AiResult<DraftPayload>> {
  const { tenantId, provider, entitlements, actor } = await context();
  if (!provider) return { ok: false, reason: "unconfigured" };
  /* Le brouillon est une capacité de l'offre complète. Le contrôle est ici en
     plus de la gouvernance parce que l'entitlement n'est pas un réglage
     d'espace : un client ne peut pas se l'accorder en cochant une case. */
  if (!entitlements.aiFull) return { ok: false, reason: "capability_off" };
  try {
    const out = await draftReply(provider, tenantId, ticketId, actor);
    if (!out.ok) return out;
    return {
      ok: true,
      value: {
        text: out.value.text,
        sources: out.value.sources.map((s) => ({
          title: s.title,
          refId: s.refId,
          source: s.source,
        })),
      },
    };
  } catch {
    return { ok: false, reason: "no_source" };
  }
}

export async function aiMacro(
  ticketId: string,
): Promise<AiResult<{ refId: string; title: string }>> {
  const { tenantId, provider, actor } = await context();
  if (!provider) return { ok: false, reason: "unconfigured" };
  try {
    const out = await suggestMacro(provider, tenantId, ticketId, actor);
    return out.ok ? { ok: true, value: { refId: out.value.refId, title: out.value.title } } : out;
  } catch {
    return { ok: false, reason: "no_source" };
  }
}
