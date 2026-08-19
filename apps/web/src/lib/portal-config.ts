/**
 * Réglages ST-09 du portail client, lus depuis `tenants.portal_config`.
 *
 * Ces interrupteurs étaient enregistrés par l'écran d'administration mais aucun
 * n'était lu : couper « Portail client activé » ne coupait rien. Ce module est le
 * seul endroit qui les interprète, pour que la valeur par défaut et la
 * signification de chaque clé ne se réinventent pas d'un appelant à l'autre.
 *
 * Défauts : tout est ACTIF quand la clé est absente. Un tenant créé avant ces
 * réglages, ou dont la configuration est vide, doit continuer de servir son
 * portail — l'absence de réglage n'est pas une extinction.
 */

import { cache } from "react";
import { getPortalTenant } from "./portal-auth";

export type PortalSettings = {
  /** Le portail /help répond-il ? */
  portalEnabled: boolean;
  /** La base de connaissances est-elle servie sur le portail ? */
  kbPublished: boolean;
  /** « authenticated » : les articles exigent une session client. */
  kbVisibility: "public" | "authenticated";
  hidePoweredBy: boolean;
  welcomeText?: string;
  widget: { enabled: boolean; color?: string; position: "right" | "left"; title?: string };
};

type Raw = {
  portalEnabled?: boolean;
  kbPublished?: boolean;
  kbVisibility?: "public" | "authenticated";
  hidePoweredBy?: boolean;
  welcomeText?: string;
  widget?: { enabled?: boolean; color?: string; position?: "right" | "left"; title?: string };
};

export function readPortalSettings(portalConfig: unknown): PortalSettings {
  const raw = (portalConfig ?? {}) as Raw;
  return {
    portalEnabled: raw.portalEnabled !== false,
    kbPublished: raw.kbPublished !== false,
    kbVisibility: raw.kbVisibility === "authenticated" ? "authenticated" : "public",
    hidePoweredBy: raw.hidePoweredBy === true,
    welcomeText: raw.welcomeText,
    widget: {
      enabled: raw.widget?.enabled !== false,
      color: raw.widget?.color,
      position: raw.widget?.position === "left" ? "left" : "right",
      title: raw.widget?.title,
    },
  };
}

/** Réglages du tenant courant. Mémoïsé par requête, comme la langue. */
export const getPortalSettings = cache(async (): Promise<PortalSettings> => {
  const tenant = await getPortalTenant();
  return readPortalSettings(tenant?.portalConfig);
});

/**
 * La base de connaissances est-elle consultable par CE visiteur ?
 *
 * Deux conditions distinctes : elle doit être publiée, et si elle est réservée
 * aux personnes connectées, le visiteur doit l'être. Les demandes, elles,
 * restent accessibles — couper la base ne ferme pas le support.
 */
export async function canReadKb(hasSession: boolean): Promise<boolean> {
  const settings = await getPortalSettings();
  if (!settings.portalEnabled || !settings.kbPublished) return false;
  return settings.kbVisibility === "public" || hasSession;
}
