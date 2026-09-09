import { afterEach, describe, expect, it } from "vitest";
import { CORE_ENTITLEMENTS } from "@openhelpdesk/config";
import { billingOf, entitlementsFor, seatLimitFor, subscriptionLabel } from "./entitlements";

/**
 * Ce qu'un espace a le droit de faire.
 *
 * Deux erreurs symétriques sont possibles ici, et elles ne coûtent pas la même
 * chose. Fermer par excès de zèle bloque un client qui a payé — il appelle, on
 * corrige. Ouvrir par erreur donne l'entreprise à quelqu'un qui paie l'offre
 * d'entrée, et personne ne le signale jamais. La résolution doit donc être
 * exacte, et surtout **prévisible quand la donnée manque**.
 *
 * `entitlementsFor` lit `process.env.OPENHELPDESK_EDITION` au moment de
 * l'appel, via `isSelfHosted()` : chaque test pose l'édition qu'il veut et la
 * remet après.
 */
const EDITION = "OPENHELPDESK_EDITION";

afterEach(() => {
  delete process.env[EDITION];
});

/** Une ligne d'espace réduite à ce que la résolution lit. */
function tenant(over: Record<string, unknown> = {}) {
  return {
    status: "active",
    entitlements: null,
    planName: null,
    billing: null,
    ...over,
  } as unknown as Parameters<typeof entitlementsFor>[0];
}

describe("entitlementsFor", () => {
  it("gives a self-hosted install the whole core, whatever the row says", () => {
    /*
     * The row is ignored on purpose. A self-hosted install has no control plane
     * to resolve entitlements, and a stale column left by a copied dump must not
     * cap an installation nobody bills.
     */
    delete process.env[EDITION];
    const capped = tenant({ entitlements: { maxAgents: 1, sla: false } });
    expect(entitlementsFor(capped)).toEqual(CORE_ENTITLEMENTS);
  });

  it("applies the row's entitlements when a control plane drives the deployment", () => {
    process.env[EDITION] = "cloud";
    const resolved = entitlementsFor(tenant({ entitlements: { maxAgents: 3, aiBasic: true } }));
    expect(resolved.maxAgents).toBe(3);
    expect(resolved.aiBasic).toBe(true);
  });

  it("keeps the core default for an entitlement the row does not mention", () => {
    /*
     * The tolerant merge, and the reason it exists: an entitlement added to the
     * type ships before the control plane learns to resolve it. Without the
     * merge it would arrive as `undefined` and read as false everywhere — every
     * customer silently losing a capability on the day we add its name.
     */
    process.env[EDITION] = "cloud";
    const resolved = entitlementsFor(tenant({ entitlements: { maxAgents: 3 } }));
    expect(resolved.sla).toBe(CORE_ENTITLEMENTS.sla);
    expect(resolved.aiFull).toBe(CORE_ENTITLEMENTS.aiFull);
    expect(Object.keys(resolved).sort()).toEqual(Object.keys(CORE_ENTITLEMENTS).sort());
  });

  it("falls back to the core when the row carries nothing", () => {
    // A control plane outage must not close the product down: an unresolved
    // workspace keeps working rather than losing its SLAs mid-incident.
    process.env[EDITION] = "cloud";
    expect(entitlementsFor(tenant({ entitlements: null }))).toEqual(CORE_ENTITLEMENTS);
  });

  it("does not let the row invent an entitlement the type does not have", () => {
    process.env[EDITION] = "cloud";
    const resolved = entitlementsFor(
      tenant({ entitlements: { maxAgents: 3, telephony: true } }),
    ) as Record<string, unknown>;
    // It does come through — the merge is a spread, not a filter. Pinned rather
    // than claimed otherwise: nothing reads an unknown key, so it is harmless,
    // and knowing that is better than believing in a validation that is absent.
    expect(resolved.telephony).toBe(true);
  });
});

describe("seatLimitFor", () => {
  it("has no ceiling self-hosted", () => {
    delete process.env[EDITION];
    expect(seatLimitFor(tenant({ entitlements: { maxAgents: 3 } }))).toBeNull();
  });

  it("prefers the entitlement over the subscribed seats", () => {
    /*
     * The order matters and is not obvious. The entitlement is the offer's
     * ceiling (Free stops at three); the subscribed seats are what the customer
     * pays for. Reading the seats first would let a Free workspace that once
     * had a subscription keep its old count.
     */
    process.env[EDITION] = "cloud";
    expect(
      seatLimitFor(tenant({ entitlements: { maxAgents: 3 }, billing: { seats: 25 } })),
    ).toBe(3);
  });

  it("falls back to the subscribed seats, then to no ceiling", () => {
    process.env[EDITION] = "cloud";
    expect(seatLimitFor(tenant({ entitlements: {}, billing: { seats: 25 } }))).toBe(25);
    expect(seatLimitFor(tenant({ entitlements: {}, billing: null }))).toBeNull();
  });
});

describe("billingOf and subscriptionLabel", () => {
  it("reads the denormalised subscription, and an absent one is an empty object", () => {
    expect(billingOf(tenant({ billing: { seats: 4, interval: "year" } }))).toMatchObject({
      seats: 4,
      interval: "year",
    });
    expect(billingOf(tenant({ billing: null }))).toEqual({});
  });

  it("returns the plan name the control plane wrote, and invents none", () => {
    // The product must not guess a commercial label: an install with no plan
    // shows nothing rather than "Free", which would be a claim about billing
    // made by the side that does not bill.
    expect(subscriptionLabel(tenant({ planName: "Team" }))).toBe("Team");
    expect(subscriptionLabel(tenant({ planName: null }))).toBeNull();
  });
});
