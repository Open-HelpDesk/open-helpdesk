/**
 * The ee/ half of the service desk (licence: ../LICENSE). Every function checks
 * its entitlement (deskConnectors, deskAccessReviews, deskLifecycle,
 * deskBudgets, deskGovernance, deskLicences, deskShadowIt) and refuses with a
 * typed error when the tenant does not have it.
 */
export * from "./scim";
export * from "./connectors";
export * from "./licences";
export * from "./budgets";
export * from "./governance";
export * from "./reviews";
export * from "./lifecycle";
export * from "./shadow";
