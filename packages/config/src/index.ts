/**
 * Constantes partagées entre les apps et le worker.
 * Référence : specs/01-produit-et-architecture.md § 5 (cycle de vie) et § 4 (domaines).
 */

/** Cycle de vie du ticket. Les compteurs SLA se suspendent sur waiting et on_hold. */
export const TICKET_STATUSES = [
  "new",
  "open",
  "waiting",
  "on_hold",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_CHANNELS = ["email", "portal", "widget", "api"] as const;
export type TicketChannel = (typeof TICKET_CHANNELS)[number];

export const USER_ROLES = ["owner", "admin", "agent", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CONSOLE_ROLES = ["super_admin", "ops", "finance", "support"] as const;
export type ConsoleRole = (typeof CONSOLE_ROLES)[number];

/** Statuts SLA suspendant les compteurs. */
export const SLA_PAUSED_STATUSES: readonly TicketStatus[] = ["waiting", "on_hold"];

/** Sous-domaines système interdits au signup (specs § 4). */
export const RESERVED_SUBDOMAINS = [
  "www",
  "console",
  "api",
  "status",
  "docs",
] as const;

/** Nombre de jours avant clôture automatique d'un ticket résolu (parcours clé n°2). */
export const AUTO_CLOSE_AFTER_DAYS = 4;

/** Rétention d'un tenant résilié avant purge (parcours clé n°4). */
export const TENANT_RETENTION_DAYS = 60;

/**
 * Plans cloud — quotas indicatifs, la vérité vit dans cloud.plans (CO-06).
 *
 * Free : jusqu'à 3 agents, une boîte email — ticketing, portail et KB complets.
 * Team (9 €/agent/mois à partir du 4ᵉ agent) : + SLA, automatisations, CSAT,
 * rapports, API, IA de triage et de résumé (aiBasic).
 * Enterprise (19 €/agent/mois, lancé avec le Lot 5) : + SSO SAML/SCIM, audit,
 * multi-marques, domaine custom, IA complète sans compteur (aiFull).
 */
export const PLAN_IDS = ["free", "team", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanEntitlements = {
  maxAgents: number | null;
  maxMailboxes: number | null;
  /** Stockage total des pièces jointes, en octets — null = illimité. */
  maxStorageBytes: number | null;
  automations: boolean;
  sla: boolean;
  csat: boolean;
  reports: boolean;
  /** IA de triage et de résumé (Team) — mesurée par un compteur d'usage. */
  aiBasic: boolean;
  /** IA complète, sans compteur : suggestions de réponse, ton… (Enterprise). */
  aiFull: boolean;
  agentSso: boolean;
  customerSso: boolean;
  customDomain: boolean;
  auditLog: boolean;
  multiBrand: boolean;
};

const GB = 1024 * 1024 * 1024;

export const DEFAULT_PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  free: {
    maxAgents: 3,
    maxMailboxes: 1,
    maxStorageBytes: 1 * GB,
    automations: false,
    sla: false,
    csat: false,
    reports: false,
    aiBasic: false,
    aiFull: false,
    agentSso: false,
    customerSso: false,
    customDomain: false,
    auditLog: false,
    multiBrand: false,
  },
  team: {
    maxAgents: null,
    maxMailboxes: null,
    maxStorageBytes: 20 * GB,
    automations: true,
    sla: true,
    csat: true,
    reports: true,
    aiBasic: true,
    aiFull: false,
    agentSso: false,
    customerSso: false,
    customDomain: false,
    auditLog: false,
    multiBrand: false,
  },
  enterprise: {
    maxAgents: null,
    maxMailboxes: null,
    maxStorageBytes: 100 * GB,
    automations: true,
    sla: true,
    csat: true,
    reports: true,
    aiBasic: true,
    aiFull: true,
    agentSso: true,
    customerSso: true,
    customDomain: true,
    auditLog: true,
    multiBrand: true,
  },
};

/** Domaines grand public refusés à la vérification de domaine (15-sso § 2.2). */
export const PUBLIC_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "free.fr",
  "orange.fr",
  "wanadoo.fr",
  "sfr.fr",
  "laposte.net",
  "gmx.com",
  "gmx.fr",
] as const;

/** Préfixe de l'enregistrement TXT de vérification de domaine. */
export const DOMAIN_VERIFICATION_TXT_PREFIX = "ohd-verify=";

export * from "./edition";
