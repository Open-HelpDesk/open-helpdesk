/**
 * Constants shared between the apps and the worker.
 */

/** Ticket lifecycle. The SLA timers pause on waiting and on_hold. */
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

/** Statuses that suspend the SLA timers. */
export const SLA_PAUSED_STATUSES: readonly TicketStatus[] = ["waiting", "on_hold"];

/** System subdomains forbidden at signup (specs § 4). */
export const RESERVED_SUBDOMAINS = [
  // System
  "www", "console", "api", "status", "docs",
  // Product and routing
  "app", "help", "portal", "kb", "admin", "dashboard", "my", "go", "get", "widget",
  // Auth and billing
  "auth", "login", "signup", "sso", "billing", "pay", "checkout", "account",
  // Email and deliverability
  "mail", "smtp", "imap", "mx", "email", "mta", "bounce", "bounces",
  "postmaster", "abuse", "noreply", "no-reply", "newsletter", "ingress",
  "webhook", "webhooks",
  // Infra and tooling
  "cdn", "assets", "static", "files", "s3", "backup", "monitor", "metrics",
  "grafana", "sentry", "ns1", "ns2", "ftp", "vpn", "git", "registry", "ci",
  // Environments
  "staging", "stg", "dev", "test", "demo", "sandbox", "preview", "internal",
  // Public site and communication
  "blog", "pricing", "legal", "security", "about", "contact", "careers",
  "community", "forum", "press", "partners", "shop", "store",
] as const;

/** Days before a solved ticket is closed automatically (key journey no. 2). */
export const AUTO_CLOSE_AFTER_DAYS = 4;

/** Retention of a closed tenant before purge (key journey no. 4). */
export const TENANT_RETENTION_DAYS = 60;

/** Consumer domains refused by domain verification (15-sso § 2.2). */
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

/**
 * Domain of the provided email addresses — support@{slug}.MANAGED_MAIL_DOMAIN.
 * Sane fallback when self-hosted: the instance's BASE_DOMAIN, without the port.
 */
export function managedMailDomain(): string {
  const raw = process.env.MANAGED_MAIL_DOMAIN ?? process.env.BASE_DOMAIN ?? "open-helpdesk.local";
  return raw.split(":")[0] ?? raw;
}

export function providedMailboxAddress(slug: string): string {
  return `support@${slug}.${managedMailDomain()}`;
}

/** Prefix of the domain verification TXT record. */
export const DOMAIN_VERIFICATION_TXT_PREFIX = "ohd-verify=";

export * from "./edition";
export * from "./entitlements";
