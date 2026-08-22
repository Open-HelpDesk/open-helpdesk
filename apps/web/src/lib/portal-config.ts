/**
 * ST-09 settings of the customer portal, read from `tenants.portal_config`.
 *
 * These switches were saved by the administration screen but none of them was
 * read: turning off "Customer portal enabled" turned nothing off. This module is
 * the only place that interprets them, so that the default value and the meaning
 * of each key are not reinvented from one caller to the next.
 *
 * Defaults: everything is ON when the key is absent. A tenant created before
 * these settings, or whose configuration is empty, must keep serving its
 * portal — the absence of a setting is not a shutdown.
 */

import { cache } from "react";
import { getPortalTenant } from "./portal-auth";

export type PortalSettings = {
  /** Does the /help portal respond? */
  portalEnabled: boolean;
  /** Is the knowledge base served on the portal? */
  kbPublished: boolean;
  /** "authenticated": articles require a customer session. */
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

/** Settings of the current tenant. Memoized per request, like the language. */
export const getPortalSettings = cache(async (): Promise<PortalSettings> => {
  const tenant = await getPortalTenant();
  return readPortalSettings(tenant?.portalConfig);
});

/**
 * Is the knowledge base readable by THIS visitor?
 *
 * Two distinct conditions: it must be published, and if it is restricted to
 * logged-in people, the visitor must be logged in. Requests, for their part,
 * stay accessible — turning off the knowledge base does not close support.
 */
export async function canReadKb(hasSession: boolean): Promise<boolean> {
  const settings = await getPortalSettings();
  if (!settings.portalEnabled || !settings.kbPublished) return false;
  return settings.kbVisibility === "public" || hasSession;
}
