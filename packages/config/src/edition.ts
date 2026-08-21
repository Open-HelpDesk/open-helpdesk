/**
 * Édition d'exécution — open-core (specs/01-produit-et-architecture.md § 6).
 *
 * `OPENHELPDESK_EDITION` se lit CÔTÉ SERVEUR uniquement (server components,
 * server actions, route handlers, worker). Jamais de `NEXT_PUBLIC_` : la même
 * image sert les deux éditions, et `process.env` est vide dans le navigateur —
 * un composant client qui appellerait ces fonctions y verrait silencieusement
 * le défaut. Les composants client reçoivent l'édition en props.
 */
import type { PlanEntitlements } from "./index";

export const EDITIONS = ["self-hosted", "cloud"] as const;
export type Edition = (typeof EDITIONS)[number];

/** Édition courante — self-hosted par défaut : un clone qui démarre est auto-hébergé. */
export function getEdition(): Edition {
  return process.env.OPENHELPDESK_EDITION === "cloud" ? "cloud" : "self-hosted";
}

export function isCloud(): boolean {
  return getEdition() === "cloud";
}

export function isSelfHosted(): boolean {
  return getEdition() === "self-hosted";
}

/**
 * Auto-hébergé : tout le cœur AGPL est débloqué, sans notion de plan ni de
 * quota de sièges ; les fonctionnalités /ee restent verrouillées (licence
 * commerciale — voir ee/LICENSE).
 */
export const SELF_HOSTED_ENTITLEMENTS: PlanEntitlements = {
  maxAgents: null,
  maxMailboxes: null,
  maxStorageBytes: null,
  automations: true,
  sla: true,
  csat: true,
  reports: true,
  aiBasic: false,
  aiFull: false,
  agentSso: false,
  customerSso: false,
  customDomain: false,
  auditLog: false,
  multiBrand: false,
};
