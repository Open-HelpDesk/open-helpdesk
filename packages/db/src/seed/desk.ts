/**
 * Service desk demonstration data (spec 19 § 13) for the Acme workspace.
 *
 * Reproduces the design's story as-is (Service Desk.html): Inès asks for
 * HubSpot, Paul approves from Slack, Sarah watches the account being created.
 * The directory, catalogue, requests SD-1027 → SD-1042, grants, hardware
 * ACM-0105 → ACM-0441, the "Q3 2026" access review and the shadow IT findings
 * all come from the design's data, written in English like the rest of the
 * Acme workspace.
 *
 * Rows are written directly with drizzle, shaped exactly as the domain
 * (@openhelpdesk/desk) would write them — this file must not depend on it.
 *
 * Replayable: every desk row of the tenant (and the access-request tickets)
 * is deleted first, then everything is inserted again. Contacts are upserted
 * by email and never removed; existing Acme data (ticket #4821 included) is
 * never touched.
 *
 * Dates: the design is frozen on 26 Sept 2026. Every date below is written as
 * the design shows it and shifted by (anchor day − 26 Sept 2026), so the demo
 * tells the same story whenever it is seeded. The anchor is today, or
 * yesterday before 10:00 — "today 09:14" must never be in the future.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, like, max, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, type Tx } from "../client";
import {
  accessApprovals,
  accessGrants,
  accessRequests,
  accessReviewItems,
  accessReviews,
  auditEvents,
  contacts,
  deskAppAutoGroups,
  deskApps,
  deskAppTiers,
  deskBudgets,
  deskConnectorRuns,
  deskConnectors,
  deskDelegations,
  deskPackItems,
  deskPacks,
  deskSettings,
  deskSodRules,
  hardwareAssets,
  lifecyclePlans,
  lifecycleTasks,
  people,
  peopleGroupMembers,
  peopleGroups,
  provisioningJobs,
  shadowFindings,
  ticketMessages,
  tickets,
} from "../schema";

const DAY = 24 * 3600 * 1000;

/* ---------- Time ---------- */

const DESIGN_TODAY = { y: 2026, m: 9, d: 26 };

function makeClock(now = new Date()) {
  const anchor = new Date(now);
  anchor.setHours(0, 0, 0, 0);
  if (now.getHours() < 10) anchor.setDate(anchor.getDate() - 1);
  const designToday = new Date(DESIGN_TODAY.y, DESIGN_TODAY.m - 1, DESIGN_TODAY.d);
  const shift = Math.round((anchor.getTime() - designToday.getTime()) / DAY);

  const shifted = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    return new Date(y, m - 1, d + shift);
  };
  const ymd = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

  return {
    /** A design calendar date → the shifted `date` column value. */
    day: (iso: string) => ymd(shifted(iso)),
    /** A design date + local time → the shifted timestamp. */
    at: (iso: string, hhmm = "10:00") => {
      const dt = shifted(iso);
      const [h, mi] = hhmm.split(":").map(Number) as [number, number];
      dt.setHours(h, mi, 0, 0);
      return dt;
    },
    /** N days before the anchor day, at a local time ("yesterday 17:30" = ago(1, "17:30")). */
    ago: (days: number, hhmm = "10:00") => {
      const dt = new Date(anchor);
      dt.setDate(dt.getDate() - days);
      const [h, mi] = hhmm.split(":").map(Number) as [number, number];
      dt.setHours(h, mi, 0, 0);
      return dt;
    },
  };
}

/** "today" / "yesterday" / "N days ago" → a last sign-in timestamp. */
function lastSeen(clock: ReturnType<typeof makeClock>, v: string): Date {
  if (v === "today") return clock.ago(0, "08:40");
  if (v === "yesterday") return clock.ago(1, "16:20");
  return clock.ago(Number(v), "11:05");
}

/** Deterministic pseudo object id, the shape an identity provider gives. */
function fakeGuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function emailOf(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z]+/g, ".")
      .replace(/^\.|\.$/g, "") + "@acme.example"
  );
}

function slugify(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ---------- The design's data ---------- */

type PersonDef = {
  name: string;
  title: string;
  department: string;
  manager: string | null;
  startsOn: string;
  leavesOn?: string;
};

const PEOPLE: PersonDef[] = [
  { name: "Claire Morel", title: "Chief Financial Officer", department: "Finance", manager: null, startsOn: "2018-01-08" },
  { name: "Paul Mercier", title: "Head of Sales", department: "Sales", manager: "Claire Morel", startsOn: "2021-09-01" },
  { name: "Camille Dubois", title: "Design Lead", department: "Design", manager: "Claire Morel", startsOn: "2020-02-03" },
  { name: "Nicolas Petit", title: "Chief Technology Officer", department: "Engineering", manager: "Claire Morel", startsOn: "2019-11-04" },
  { name: "Élodie Faure", title: "Head of Marketing", department: "Marketing", manager: "Claire Morel", startsOn: "2021-04-06" },
  { name: "Sarah Leroy", title: "IT Manager", department: "Support", manager: "Claire Morel", startsOn: "2019-06-03" },
  { name: "Inès Haddad", title: "Account Executive", department: "Sales", manager: "Paul Mercier", startsOn: "2024-03-04" },
  { name: "Julien Roche", title: "Account Manager", department: "Sales", manager: "Paul Mercier", startsOn: "2023-01-09", leavesOn: "2026-09-30" },
  { name: "Karim Benali", title: "Business Developer", department: "Sales", manager: "Paul Mercier", startsOn: "2026-06-01" },
  { name: "Sofia Nguyen", title: "Sales Ops", department: "Sales", manager: "Paul Mercier", startsOn: "2025-02-03" },
  { name: "Léa Martin", title: "Product Designer", department: "Design", manager: "Camille Dubois", startsOn: "2023-05-02" },
  { name: "Thomas Girard", title: "Software Engineer", department: "Engineering", manager: "Nicolas Petit", startsOn: "2022-10-03" },
  /* Not named in the design: the Engineering reviewer has 11 lines to decide,
     and Thomas alone holds five accesses. */
  { name: "Maxime Lefèvre", title: "Backend Engineer", department: "Engineering", manager: "Nicolas Petit", startsOn: "2024-09-02" },
  { name: "Hugo Blanc", title: "Marketing Specialist", department: "Marketing", manager: "Élodie Faure", startsOn: "2025-01-06" },
  { name: "Nadia Colin", title: "Office Manager", department: "Operations", manager: "Claire Morel", startsOn: "2022-04-04" },
  { name: "Chloé Vasseur", title: "Account Executive", department: "Sales", manager: "Paul Mercier", startsOn: "2026-10-06" },
];

const DEPARTMENTS = ["Sales", "Design", "Engineering", "Marketing", "Operations", "Support", "Finance"];
const EVERYONE = "All employees";
const teamGroup = (d: string) => `Team ${d}`;

type ConnKey = "entra" | "google" | "scim" | "manual";

type AppDef = {
  key: string;
  name: string;
  category: string;
  color: string;
  /** simple-icons slug (or our own mark) — null: initials on `color`. */
  iconKey: string | null;
  description: string;
  owner: string;
  levels: 0 | 1 | 2;
  auto: string[];
  conn: ConnKey;
  tiers: Array<[string, number, boolean?]>;
  seats: number;
  renewsOn: string;
  /** SCIM token expiry (TOK in the design). */
  scimTokenExpiresOn?: string | null;
  scimBaseUrl?: string;
};

const APPS: AppDef[] = [
  { key: "figma", name: "Figma", category: "Design", color: "#7C3AED", iconKey: "figma", description: "Mockups, prototypes and the design system", owner: "Sarah Leroy", levels: 2, auto: [teamGroup("Design")], conn: "scim", tiers: [["Viewer", 0], ["Editor", 1500]], seats: 40, renewsOn: "2027-01-12", scimTokenExpiresOn: "2027-03-03", scimBaseUrl: "https://www.figma.com/scim/v2/acme" },
  { key: "slack", name: "Slack", category: "Communication", color: "#B45309", iconKey: null, description: "Team messaging and project channels", owner: "Sarah Leroy", levels: 0, auto: [EVERYONE], conn: "entra", tiers: [["Member", 725]], seats: 220, renewsOn: "2027-03-01" },
  { key: "gws", name: "Google Workspace", category: "Productivity", color: "#0E7A58", iconKey: "google", description: "Email, calendar, Drive and video meetings", owner: "Sarah Leroy", levels: 0, auto: [EVERYONE], conn: "google", tiers: [["Business Standard", 1150]], seats: 225, renewsOn: "2027-07-01" },
  { key: "notion", name: "Notion", category: "Productivity", color: "#51625B", iconKey: "notion", description: "Documentation, wikis and team notes", owner: "Sarah Leroy", levels: 1, auto: [], conn: "scim", tiers: [["Member", 1000]], seats: 120, renewsOn: "2026-11-15", scimTokenExpiresOn: "2026-10-08", scimBaseUrl: "https://api.notion.com/scim/v2" },
  { key: "miro", name: "Miro", category: "Productivity", color: "#B45309", iconKey: "miro", description: "Collaborative whiteboard for workshops", owner: "Sarah Leroy", levels: 0, auto: [EVERYONE], conn: "scim", tiers: [["Member", 800]], seats: 60, renewsOn: "2026-11-28", scimTokenExpiresOn: "2027-02-01", scimBaseUrl: "https://miro.com/api/v1/scim" },
  { key: "salesforce", name: "Salesforce", category: "Sales", color: "#1D4ED8", iconKey: null, description: "CRM: accounts, opportunities and forecasts", owner: "Paul Mercier", levels: 2, auto: [], conn: "entra", tiers: [["User", 7500], ["Admin", 7500, true]], seats: 35, renewsOn: "2026-10-30" },
  { key: "hubspot", name: "HubSpot", category: "Marketing", color: "#C0342B", iconKey: "hubspot", description: "Email campaigns, automation and lead scoring", owner: "Élodie Faure", levels: 1, auto: [teamGroup("Marketing")], conn: "manual", tiers: [["User", 4500]], seats: 20, renewsOn: "2026-12-20" },
  { key: "adobe", name: "Adobe Creative Cloud", category: "Design", color: "#C0342B", iconKey: null, description: "Creative suite and Acrobat Pro", owner: "Sarah Leroy", levels: 1, auto: [teamGroup("Design")], conn: "entra", tiers: [["Acrobat Pro", 1800], ["Creative Cloud All Apps", 6200]], seats: 15, renewsOn: "2027-04-05" },
  { key: "github", name: "GitHub", category: "Development", color: "#0D1C17", iconKey: "github", description: "Source code, code reviews and continuous integration", owner: "Nicolas Petit", levels: 2, auto: [teamGroup("Engineering")], conn: "scim", tiers: [["Member", 1900]], seats: 60, renewsOn: "2027-02-03", scimTokenExpiresOn: "2026-12-19", scimBaseUrl: "https://api.github.com/scim/v2/enterprises/acme" },
  { key: "jira", name: "Jira", category: "Development", color: "#1D4ED8", iconKey: "jira", description: "Product issue and sprint tracking", owner: "Nicolas Petit", levels: 1, auto: [teamGroup("Engineering")], conn: "scim", tiers: [["Member", 860]], seats: 75, renewsOn: "2027-02-03", scimTokenExpiresOn: "2026-12-19", scimBaseUrl: "https://api.atlassian.com/scim/directory/acme" },
  { key: "pennylane", name: "Pennylane", category: "Finance", color: "#0E7A58", iconKey: null, description: "Accounting, expense reports and invoices", owner: "Claire Morel", levels: 2, auto: [], conn: "manual", tiers: [["Viewer", 0], ["Accountant", 3000, true]], seats: 8, renewsOn: "2026-12-31" },
  { key: "ohd", name: "Open HelpDesk", category: "Support", color: "#0B5F46", iconKey: "openhelpdesk", description: "Customer support: tickets, SLAs and knowledge base", owner: "Sarah Leroy", levels: 1, auto: [teamGroup("Support")], conn: "scim", tiers: [["Agent", 2900]], seats: 15, renewsOn: "2027-01-01", scimTokenExpiresOn: null, scimBaseUrl: "https://acme.open-helpdesk.com/scim/v2" },
];

/** [app, tier, since, last sign-in ("today" | "yesterday" | days), expiresOn?] */
type GrantDef = [string, string, string, string, string?];
const base = (since: string): GrantDef[] => [
  ["gws", "Business Standard", since, "today"],
  ["slack", "Member", since, "today"],
];

const GRANTS: Record<string, GrantDef[]> = {
  "Inès Haddad": [...base("2024-03-04"), ["salesforce", "User", "2024-03-04", "yesterday"], ["notion", "Member", "2024-04-02", "3"], ["miro", "Member", "2026-09-01", "12", "2026-10-14"]],
  "Julien Roche": [...base("2023-01-09"), ["salesforce", "User", "2023-01-09", "2"], ["hubspot", "User", "2024-03-04", "41"], ["notion", "Member", "2023-01-09", "6"], ["miro", "Member", "2024-06-03", "30"], ["figma", "Viewer", "2025-02-03", "58"], ["pennylane", "Viewer", "2024-01-08", "20"]],
  "Paul Mercier": [...base("2021-09-01"), ["salesforce", "Admin", "2021-09-01", "today"], ["notion", "Member", "2021-09-01", "yesterday"], ["pennylane", "Viewer", "2023-01-02", "4"]],
  "Karim Benali": [...base("2026-06-01"), ["miro", "Member", "2026-06-01", "90"]],
  "Sofia Nguyen": [...base("2025-02-03"), ["salesforce", "User", "2025-02-03", "yesterday"], ["pennylane", "Viewer", "2025-03-03", "64"]],
  "Léa Martin": [...base("2023-05-02"), ["figma", "Viewer", "2023-05-02", "today"], ["adobe", "Creative Cloud All Apps", "2023-05-02", "yesterday"], ["notion", "Member", "2023-05-02", "yesterday"], ["miro", "Member", "2023-05-02", "5"]],
  "Thomas Girard": [...base("2022-10-03"), ["jira", "Member", "2022-10-03", "today"], ["notion", "Member", "2022-10-03", "2"]],
  "Maxime Lefèvre": [...base("2024-09-02"), ["github", "Member", "2024-09-02", "today"], ["jira", "Member", "2024-09-02", "today"], ["notion", "Member", "2024-09-02", "3"], ["figma", "Viewer", "2025-01-13", "20"]],
  "Hugo Blanc": [...base("2025-01-06"), ["notion", "Member", "2025-01-06", "yesterday"], ["miro", "Member", "2025-01-06", "8"], ["figma", "Viewer", "2025-03-03", "15"]],
  "Nadia Colin": [...base("2022-04-04"), ["notion", "Member", "2022-04-04", "7"], ["pennylane", "Viewer", "2022-04-04", "2"]],
  "Sarah Leroy": [...base("2019-06-03"), ["ohd", "Agent", "2019-06-03", "today"], ["notion", "Member", "2019-06-03", "today"]],
  "Camille Dubois": [...base("2020-02-03"), ["figma", "Editor", "2020-02-03", "today"], ["adobe", "Creative Cloud All Apps", "2020-02-03", "2"], ["notion", "Member", "2020-02-03", "today"], ["miro", "Member", "2020-02-03", "4"]],
  "Nicolas Petit": [...base("2019-11-04"), ["github", "Member", "2019-11-04", "today"], ["jira", "Member", "2019-11-04", "today"], ["notion", "Member", "2019-11-04", "yesterday"]],
  "Élodie Faure": [...base("2021-04-06"), ["hubspot", "User", "2021-04-06", "today"], ["notion", "Member", "2021-04-06", "yesterday"], ["miro", "Member", "2021-04-06", "6"]],
  "Claire Morel": [...base("2018-01-08"), ["pennylane", "Accountant", "2018-01-08", "today"], ["notion", "Member", "2018-01-08", "3"]],
};

type Step = { step: "manager" | "owner"; approver: string; merged?: boolean; decidedAt?: [string, string]; via?: "slack" | "portal" | "web" };
type RequestDef = {
  sd: string;
  who: string;
  app: string;
  tier: string;
  why: string;
  created: [string, string];
  levels: number;
  state: "awaiting_manager" | "awaiting_owner" | "provisioning" | "active";
  steps: Step[];
  autoGroup?: string;
  remindedAt?: [string, string];
  provisioned?: [string, string];
  /** The last-seen value of the resulting grant ("today" | "yesterday" | days). */
  lastSeen?: string;
};

const REQUESTS: RequestDef[] = [
  { sd: "SD-1027", who: "Karim Benali", app: "salesforce", tier: "User", why: "New joiner, prospecting key accounts.", created: ["2026-09-16", "09:02"], levels: 2, state: "active", steps: [{ step: "manager", approver: "Paul Mercier", merged: true, decidedAt: ["2026-09-16", "09:30"], via: "slack" }], provisioned: ["2026-09-16", "09:31"], lastSeen: "today" },
  { sd: "SD-1030", who: "Julien Roche", app: "adobe", tier: "Acrobat Pro", why: "Signing and annotating customer contracts.", created: ["2026-09-19", "15:40"], levels: 1, state: "active", steps: [{ step: "manager", approver: "Paul Mercier", decidedAt: ["2026-09-19", "16:05"], via: "slack" }], provisioned: ["2026-09-19", "16:06"], lastSeen: "yesterday" },
  { sd: "SD-1035", who: "Thomas Girard", app: "github", tier: "Member", why: "Access to the mobile app repository.", created: ["2026-09-23", "10:12"], levels: 0, state: "active", steps: [], autoGroup: teamGroup("Engineering"), provisioned: ["2026-09-23", "10:13"], lastSeen: "today" },
  { sd: "SD-1036", who: "Hugo Blanc", app: "hubspot", tier: "User", why: "Running the email campaigns for the product launch.", created: ["2026-09-25", "09:40"], levels: 1, state: "provisioning", steps: [{ step: "manager", approver: "Élodie Faure", decidedAt: ["2026-09-25", "10:02"], via: "portal" }] },
  { sd: "SD-1038", who: "Léa Martin", app: "figma", tier: "Editor", why: "Sign-up flow redesign: I need to edit the product team’s mockups.", created: ["2026-09-25", "11:05"], levels: 2, state: "awaiting_owner", steps: [{ step: "manager", approver: "Camille Dubois", decidedAt: ["2026-09-25", "14:20"], via: "portal" }, { step: "owner", approver: "Sarah Leroy" }] },
  { sd: "SD-1039", who: "Sofia Nguyen", app: "salesforce", tier: "Admin", why: "Setting up the new pipelines and the Q4 assignment rules.", created: ["2026-09-25", "17:30"], levels: 2, state: "awaiting_manager", steps: [{ step: "manager", approver: "Paul Mercier", merged: true }], remindedAt: ["2026-09-26", "09:00"] },
  { sd: "SD-1041", who: "Karim Benali", app: "notion", tier: "Member", why: "Access to the sales knowledge base and the product sheets.", created: ["2026-09-26", "08:52"], levels: 1, state: "awaiting_manager", steps: [{ step: "manager", approver: "Paul Mercier" }] },
  { sd: "SD-1042", who: "Inès Haddad", app: "hubspot", tier: "User", why: "I’m taking over the ABM campaigns with marketing from October.", created: ["2026-09-26", "09:14"], levels: 1, state: "awaiting_manager", steps: [{ step: "manager", approver: "Paul Mercier" }] },
];

/** [tag, model, type, holder, status, warranty end] */
const HARDWARE: Array<[string, string, string, string | null, "assigned" | "in_stock" | "in_repair" | "to_recover", string, number]> = [
  ["ACM-0198", 'MacBook Air 13" M3', "Laptop", "Inès Haddad", "assigned", "2027-03-31", 129900],
  ["ACM-0377", "iPhone 15", "Phone", "Inès Haddad", "assigned", "2027-03-31", 96900],
  ["ACM-0231", 'MacBook Pro 14" M3', "Laptop", "Julien Roche", "to_recover", "2026-01-31", 219900],
  ["ACM-0412", "iPhone 15", "Phone", "Julien Roche", "to_recover", "2027-02-28", 96900],
  ["ACM-0105", 'MacBook Pro 14" M3', "Laptop", "Paul Mercier", "assigned", "2027-09-30", 219900],
  ["ACM-0112", "Jabra Evolve2 65 headset", "Accessory", "Paul Mercier", "assigned", "2026-11-30", 29900],
  ["ACM-0420", 'MacBook Air 13" M3', "Laptop", "Karim Benali", "assigned", "2028-06-30", 129900],
  ["ACM-0287", 'MacBook Pro 16" M3 Max', "Laptop", "Léa Martin", "assigned", "2026-05-31", 399900],
  ["ACM-0301", 'Dell U2723QE 27" monitor', "Monitor", "Léa Martin", "assigned", "2028-05-31", 62900],
  ["ACM-0156", "ThinkPad X1 Carbon", "Laptop", "Thomas Girard", "in_repair", "2025-10-31", 189900],
  ["ACM-0433", 'MacBook Air 13" M3', "Laptop", null, "in_stock", "2029-08-31", 129900],
  ["ACM-0434", 'MacBook Air 13" M3', "Laptop", null, "in_stock", "2029-08-31", 129900],
  ["ACM-0441", "iPhone 15", "Phone", null, "in_stock", "2028-08-31", 96900],
];

const BUDGETS: Record<string, number> = { Sales: 80000, Design: 40000, Engineering: 90000, Marketing: 30000, Operations: 15000 };

const PACKS: Record<string, string[]> = {
  Sales: ["gws", "slack", "salesforce", "notion", "miro"],
  Design: ["gws", "slack", "figma", "adobe", "notion", "miro"],
  Engineering: ["gws", "slack", "github", "jira", "notion"],
};

const SOD: Array<[[string, string], [string, string], string]> = [
  [["pennylane", "Accountant"], ["salesforce", "Admin"], "The same person could create a sale and invoice it."],
  [["github", "Member"], ["ohd", "Agent"], "Keeps a developer from handling customer tickets about their own code without a review."],
];

/** Paul's scope in the design (REV): [person, app, signal, detail]. */
const REVIEW_PAUL: Array<[string, string, ("leaving" | "unused")?, string?]> = [
  ["Inès Haddad", "salesforce"],
  ["Inès Haddad", "notion"],
  ["Julien Roche", "salesforce", "leaving", "2026-09-30"],
  ["Julien Roche", "hubspot", "unused", "41"],
  ["Karim Benali", "salesforce"],
  ["Karim Benali", "miro", "unused", "90"],
  ["Sofia Nguyen", "salesforce"],
  ["Sofia Nguyen", "pennylane", "unused", "64"],
];

/** [name, domain, iconKey, source, users, monthly spend (cents, 0 = free), risk, reason, first seen (days ago)] */
const SHADOW: Array<[string, string, string | null, "google_oauth" | "entra_signins" | "expenses", number, number, "low" | "medium" | "high", string, number]> = [
  ["ChatGPT", "chatgpt.com", null, "expenses", 23, 46000, "high", "Customer data pasted into a service hosted outside the EU", 40],
  ["Zapier", "zapier.com", "zapier", "google_oauth", 3, 6900, "high", "Full access to Salesforce and Gmail", 21],
  ["Canva", "canva.com", null, "google_oauth", 14, 0, "medium", "Reads Drive files", 63],
  ["WeTransfer", "wetransfer.com", "wetransfer", "entra_signins", 9, 0, "medium", "File sharing outside the company", 30],
  ["Calendly", "calendly.com", "calendly", "google_oauth", 6, 7200, "low", "Reads the calendar", 55],
  ["Loom", "loom.com", "loom", "google_oauth", 5, 0, "low", "Profile and email address", 12],
];

/** [connector, day offset, time, message, level] — RUNS in the design. */
const RUNS: Array<[ConnKey, number, string, string, "ok" | "warn" | "error"]> = [
  ["entra", 0, "09:00", "Sync: 3 accounts created, 1 disabled", "ok"],
  ["entra", 0, "08:00", "Sync: no changes", "ok"],
  ["entra", 0, "07:00", "Adobe Creative Cloud: no licence left, assignment pending", "error"],
  ["entra", 0, "06:00", "Sync: no changes", "ok"],
  ["google", 0, "09:00", "Groups synced: 2 added", "ok"],
  ["google", 0, "08:00", "No changes", "ok"],
  ["scim", 0, "09:12", "Figma: account created for Léa Martin", "ok"],
  ["scim", 0, "09:05", "Notion: token expires in 12 days", "warn"],
  ["scim", 0, "08:40", "GitHub: account disabled after a departure", "ok"],
  ["manual", 1, "10:02", "HubSpot: task created for Hugo Blanc", "ok"],
  ["manual", 7, "14:10", "Pennylane: task closed in 2 h", "ok"],
];

const REVIEW_NAME = "Quarterly access review — Q3 2026";

/* ---------- Purge ---------- */

async function purge(tx: Tx, tenantId: string) {
  const t = (col: PgColumn) => eq(col, tenantId);
  await tx.delete(auditEvents).where(and(t(auditEvents.tenantId), like(auditEvents.action, "desk.%")));
  // An access request IS a ticket: its ticket goes with it.
  const reqTickets = await tx.select({ id: accessRequests.ticketId }).from(accessRequests).where(t(accessRequests.tenantId));
  await tx.delete(lifecycleTasks).where(t(lifecycleTasks.tenantId));
  await tx.delete(lifecyclePlans).where(t(lifecyclePlans.tenantId));
  await tx.delete(accessReviewItems).where(t(accessReviewItems.tenantId));
  await tx.delete(accessReviews).where(t(accessReviews.tenantId));
  await tx.delete(provisioningJobs).where(t(provisioningJobs.tenantId));
  await tx.delete(accessApprovals).where(t(accessApprovals.tenantId));
  await tx.delete(accessRequests).where(t(accessRequests.tenantId));
  const ticketIds = reqTickets.map((r) => r.id);
  if (ticketIds.length) await tx.delete(tickets).where(and(t(tickets.tenantId), inArray(tickets.id, ticketIds)));
  await tx.delete(tickets).where(and(t(tickets.tenantId), eq(tickets.type, "access_request")));
  await tx.delete(accessGrants).where(t(accessGrants.tenantId));
  await tx.delete(hardwareAssets).where(t(hardwareAssets.tenantId));
  await tx.delete(deskPackItems).where(t(deskPackItems.tenantId));
  await tx.delete(deskPacks).where(t(deskPacks.tenantId));
  await tx.delete(deskSodRules).where(t(deskSodRules.tenantId));
  await tx.delete(deskAppAutoGroups).where(t(deskAppAutoGroups.tenantId));
  await tx.delete(deskAppTiers).where(t(deskAppTiers.tenantId));
  await tx.delete(deskApps).where(t(deskApps.tenantId));
  await tx.delete(deskConnectorRuns).where(t(deskConnectorRuns.tenantId));
  await tx.delete(deskConnectors).where(t(deskConnectors.tenantId));
  await tx.delete(deskBudgets).where(t(deskBudgets.tenantId));
  await tx.delete(deskDelegations).where(t(deskDelegations.tenantId));
  await tx.delete(peopleGroupMembers).where(t(peopleGroupMembers.tenantId));
  await tx.delete(peopleGroups).where(t(peopleGroups.tenantId));
  await tx.delete(people).where(t(people.tenantId));
  await tx.delete(shadowFindings).where(t(shadowFindings.tenantId));
  await tx.delete(deskSettings).where(t(deskSettings.tenantId));
}

/* ---------- Seed ---------- */

export type DeskSeedSummary = {
  people: number;
  apps: number;
  requests: number;
  grants: number;
  hardware: number;
  auditEvents: number;
  ticketNumbers: [number, number];
};

export async function seedDeskDemo(tenantId: string, now = new Date()): Promise<DeskSeedSummary> {
  const clock = makeClock(now);
  return db.transaction(async (tx) => {
    await purge(tx, tenantId);

    const audits: Array<typeof auditEvents.$inferInsert> = [];
    const audit = (
      actor: { type: "person"; id: string } | { type: "system" } | { type: "rule" } | { type: "agent"; id: string },
      action: string,
      targetType: string,
      targetId: string,
      after: Record<string, unknown>,
      createdAt: Date,
    ) =>
      audits.push({
        tenantId,
        actorType: actor.type,
        actorId: "id" in actor ? actor.id : null,
        action,
        targetType,
        targetId,
        after,
        createdAt,
      });

    const syncedAt = clock.ago(0, "09:00");

    /* Directory: a contact (portal identity, ticket requester) + a person. */
    const personId = new Map<string, string>();
    const contactId = new Map<string, string>();
    const personDept = new Map<string, string>();
    for (const p of PEOPLE) {
      const email = emailOf(p.name);
      await tx.insert(contacts).values({ tenantId, email, name: p.name, locale: "en" })
        // Earlier seeds wrote these contacts with locale "fr": only the locale is realigned.
        .onConflictDoUpdate({ target: [contacts.tenantId, contacts.email], set: { locale: "en" } });
      const [c] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)));
      contactId.set(p.name, c!.id);
      const [row] = await tx
        .insert(people)
        .values({
          tenantId,
          contactId: c!.id,
          email,
          name: p.name,
          title: p.title,
          department: p.department,
          startsOn: clock.day(p.startsOn),
          leavesOn: p.leavesOn ? clock.day(p.leavesOn) : null,
          status: p.leavesOn ? "leaving" : "active",
          source: "entra",
          externalId: fakeGuid(`entra:${email}`),
          lastSyncedAt: syncedAt,
          // The directory was connected in March 2026; later hires were synced a few days before their first day.
          createdAt: clock.at(p.startsOn < "2026-03-02" ? "2026-03-02" : p.startsOn > "2026-09-22" ? "2026-09-22" : p.startsOn, "09:00"),
        })
        .returning({ id: people.id });
      personId.set(p.name, row!.id);
      personDept.set(p.name, p.department);
    }
    for (const p of PEOPLE) {
      if (!p.manager) continue;
      await tx
        .update(people)
        .set({ managerId: personId.get(p.manager)! })
        .where(eq(people.id, personId.get(p.name)!));
    }
    const pid = (n: string) => {
      const id = personId.get(n);
      if (!id) throw new Error(`Unknown person ${n}`);
      return id;
    };

    /* Groups: everyone + one per department (computed). */
    const groupId = new Map<string, string>();
    const [everyone] = await tx
      .insert(peopleGroups)
      .values({ tenantId, name: EVERYONE, kind: "everyone", source: "manual" })
      .returning({ id: peopleGroups.id });
    groupId.set(EVERYONE, everyone!.id);
    for (const d of DEPARTMENTS) {
      const [g] = await tx
        .insert(peopleGroups)
        .values({ tenantId, name: teamGroup(d), kind: `department:${d}`, source: "manual" })
        .returning({ id: peopleGroups.id });
      groupId.set(teamGroup(d), g!.id);
    }
    await tx.insert(peopleGroupMembers).values(
      PEOPLE.flatMap((p) => [
        { tenantId, groupId: everyone!.id, personId: pid(p.name) },
        { tenantId, groupId: groupId.get(teamGroup(p.department))!, personId: pid(p.name) },
      ]),
    );

    /* Settings: the stored config is read through resolveDeskConfig, so an
       empty object IS the default configuration (the design's DEF). */
    await tx.insert(deskSettings).values({ tenantId, config: {}, directorySource: "entra", lastDirectorySyncAt: syncedAt });

    /* Connectors — non-secret settings only, no credentials in a seed. */
    const connectorId = new Map<ConnKey, string>();
    const connectorDefs: Array<[ConnKey, "entra" | "google" | "scim" | "manual", string, Record<string, unknown>]> = [
      ["entra", "entra", "Microsoft Entra ID", { tenantId: "acme.onmicrosoft.com", groupPattern: "app-{app}-{tier}" }],
      ["google", "google", "Google Workspace", { domain: "acme.example" }],
      ["scim", "scim", "SCIM 2.0", {}],
      ["manual", "manual", "No connector", { slaHours: 4 }],
    ];
    for (const [key, kind, name, settings] of connectorDefs) {
      // No credentials are seeded, so no connector can claim to be connected: a
      // "connected" connector makes the catalogue promise automatic creation.
      const status = kind === "manual" ? ("connected" as const) : ("pending" as const);
      const lastRun = RUNS.find((r) => r[0] === key)!;
      const lastAt = clock.ago(lastRun[1], lastRun[2]);
      const [row] = await tx
        .insert(deskConnectors)
        .values({ tenantId, kind, name, settings, status, lastOkAt: kind === "manual" ? lastAt : null, lastRunAt: lastAt, createdAt: clock.at("2026-03-02", "09:00") })
        .returning({ id: deskConnectors.id });
      connectorId.set(key, row!.id);
    }
    await tx.insert(deskConnectorRuns).values(
      RUNS.map(([key, days, time, message, level]) => ({ tenantId, connectorId: connectorId.get(key)!, level, message, createdAt: clock.ago(days, time) })),
    );

    /* Catalogue. */
    const appId = new Map<string, string>();
    const appName = new Map<string, string>();
    const appConn = new Map<string, ConnKey>();
    const tierId = new Map<string, string>(); // `${app}|${tier}`
    for (const a of APPS) {
      const slug = slugify(a.name);
      const [row] = await tx
        .insert(deskApps)
        .values({
          tenantId,
          slug,
          name: a.name,
          category: a.category,
          description: a.description,
          iconKey: a.iconKey,
          color: a.color,
          ownerPersonId: pid(a.owner),
          approvalLevels: a.levels,
          maxDurationDays: null,
          visible: true,
          connectorId: connectorId.get(a.conn)!,
          scimBaseUrl: a.conn === "scim" ? (a.scimBaseUrl ?? null) : null,
          scimTokenExpiresOn: a.scimTokenExpiresOn ? clock.day(a.scimTokenExpiresOn) : null,
          seatsPurchased: a.seats,
          renewsOn: clock.day(a.renewsOn),
          createdAt: clock.at("2026-03-02", "09:00"),
        })
        .returning({ id: deskApps.id });
      appId.set(a.key, row!.id);
      appName.set(a.key, a.name);
      appConn.set(a.key, a.conn);
      for (const [i, [tier, cents, privileged]] of a.tiers.entries()) {
        const [tr] = await tx
          .insert(deskAppTiers)
          .values({
            tenantId,
            appId: row!.id,
            name: tier,
            monthlyCostCents: cents,
            privileged: privileged ?? false,
            externalGroup: a.conn === "manual" ? null : `app-${slug}-${slugify(tier)}`,
            position: i,
          })
          .returning({ id: deskAppTiers.id });
        tierId.set(`${a.key}|${tier}`, tr!.id);
      }
      for (const g of a.auto) {
        await tx.insert(deskAppAutoGroups).values({ tenantId, appId: row!.id, groupId: groupId.get(g)! });
      }
    }
    const tid = (app: string, tier: string) => {
      const id = tierId.get(`${app}|${tier}`);
      if (!id) throw new Error(`Unknown tier ${app} / ${tier}`);
      return id;
    };

    /* Governance, packs, budgets. */
    await tx.insert(deskSodRules).values(
      SOD.map(([a, b, reason]) => ({ tenantId, tierAId: tid(a[0], a[1]), tierBId: tid(b[0], b[1]), reason, enabled: true })),
    );
    for (const [dept, apps] of Object.entries(PACKS)) {
      const [pk] = await tx.insert(deskPacks).values({ tenantId, department: dept }).returning({ id: deskPacks.id });
      await tx.insert(deskPackItems).values(
        apps.map((k) => ({ tenantId, packId: pk!.id, appId: appId.get(k)!, tierId: tid(k, APPS.find((a) => a.key === k)!.tiers[0]![0]) })),
      );
    }
    await tx.insert(deskBudgets).values(Object.entries(BUDGETS).map(([department, amountCents]) => ({ tenantId, department, amountCents })));

    /* Grants that predate the desk (imported with the directory). */
    const grantId = new Map<string, string>(); // `${person}|${app}`
    /** Active (reviewable) grants per person, in insertion order. */
    const activeApps = new Map<string, string[]>();
    const addActive = (who: string, app: string) => activeApps.set(who, [...(activeApps.get(who) ?? []), app]);
    for (const [who, list] of Object.entries(GRANTS)) {
      for (const [app, tier, since, last, expires] of list) {
        const [g] = await tx
          .insert(accessGrants)
          .values({
            tenantId,
            personId: pid(who),
            appId: appId.get(app)!,
            tierId: tid(app, tier),
            source: expires ? "direct" : "import",
            grantedAt: clock.at(since, "09:30"),
            expiresOn: expires ? clock.day(expires) : null,
            lastSeenAt: lastSeen(clock, last),
            externalAccountId: appConn.get(app) === "manual" ? null : fakeGuid(`${app}:${who}`),
            createdAt: clock.at(since, "09:30"),
          })
          .returning({ id: accessGrants.id });
        grantId.set(`${who}|${app}`, g!.id);
        addActive(who, app);
      }
    }

    /* Requests — each one a ticket numbered after the workspace's last one. */
    const [maxRow] = await tx.select({ n: max(tickets.number) }).from(tickets).where(eq(tickets.tenantId, tenantId));
    let number = maxRow?.n ?? 0;
    const firstNumber = number + 1;
    const ticketStatus = { awaiting_manager: "on_hold", awaiting_owner: "on_hold", provisioning: "open", active: "resolved" } as const;
    const connVia = { entra: "entra", google: "google", scim: "scim", manual: "manual" } as const;

    for (const r of REQUESTS) {
      number += 1;
      const createdAt = clock.at(...r.created);
      const app = appName.get(r.app)!;
      const requester = pid(r.who);
      const lastStep = r.steps.filter((s) => s.decidedAt).at(-1);
      const decidedAt = r.state === "active" || r.state === "provisioning" ? (lastStep?.decidedAt ? clock.at(...lastStep.decidedAt) : createdAt) : null;
      const doneAt = r.provisioned ? clock.at(...r.provisioned) : null;
      const updatedAt = doneAt ?? decidedAt ?? (r.remindedAt ? clock.at(...r.remindedAt) : createdAt);

      const [ticket] = await tx
        .insert(tickets)
        .values({
          tenantId,
          number,
          subject: `Access: ${app} — ${r.tier}`,
          status: ticketStatus[r.state],
          priority: "normal",
          channel: "portal",
          type: "access_request",
          requesterId: contactId.get(r.who)!,
          tags: ["access"],
          createdAt,
          updatedAt,
          resolvedAt: r.state === "active" ? doneAt : null,
        })
        .returning({ id: tickets.id });
      await tx.insert(ticketMessages).values({
        tenantId,
        ticketId: ticket!.id,
        kind: "public_reply",
        authorType: "contact",
        authorId: contactId.get(r.who)!,
        bodyText: r.why,
        source: "portal",
        createdAt,
      });

      const [req] = await tx
        .insert(accessRequests)
        .values({
          tenantId,
          ticketId: ticket!.id,
          personId: requester,
          appId: appId.get(r.app)!,
          tierId: tid(r.app, r.tier),
          durationDays: null,
          justification: r.why,
          state: r.state,
          effectiveLevels: r.levels,
          autoRule: r.autoGroup ? `group:${groupId.get(r.autoGroup)!}` : null,
          source: "portal",
          decidedAt,
          createdAt,
          updatedAt,
        })
        .returning({ id: accessRequests.id });
      const reqId = req!.id;
      const target = (after: Record<string, unknown>) => ({ number, requester: r.who, app, tier: r.tier, ...after });

      audit({ type: "person", id: requester }, "desk.request.submitted", "access_request", reqId, target({ actor: r.who, via: "portal", durationDays: null }), createdAt);
      if (r.autoGroup) {
        audit({ type: "rule" }, "desk.request.auto_approved", "access_request", reqId, target({ rule: "group", group: r.autoGroup }), new Date(createdAt.getTime() + 1000));
      }

      for (const [i, s] of r.steps.entries()) {
        const stepCreated = i === 0 ? createdAt : clock.at(...r.steps[i - 1]!.decidedAt!);
        const merged = s.merged ? ["manager", "owner"] : [];
        await tx.insert(accessApprovals).values({
          tenantId,
          requestId: reqId,
          step: s.step,
          position: i + 1,
          approverPersonId: pid(s.approver),
          mergedSteps: merged,
          decision: s.decidedAt ? "approved" : "pending",
          via: s.decidedAt ? (s.via ?? "web") : null,
          remindedAt: !s.decidedAt && r.remindedAt ? clock.at(...r.remindedAt) : null,
          decidedAt: s.decidedAt ? clock.at(...s.decidedAt) : null,
          createdAt: stepCreated,
        });
        audit({ type: "system" }, "desk.request.notified", "access_request", reqId, target({ approver: s.approver, step: merged.length ? "owner" : s.step, mergedSteps: merged, via: "slack" }), new Date(stepCreated.getTime() + 1000));
        if (!s.decidedAt && r.remindedAt) {
          audit({ type: "system" }, "desk.approval.reminded", "access_request", reqId, target({ approver: s.approver, step: s.step, automatic: true, via: "slack" }), clock.at(...r.remindedAt));
        }
        if (s.decidedAt) {
          audit({ type: "person", id: pid(s.approver) }, "desk.approval.approved", "access_request", reqId, target({ actor: s.approver, approver: s.approver, step: s.step, merged: merged.length > 0, mergedSteps: merged, via: s.via ?? "web" }), clock.at(...s.decidedAt));
        }
      }

      if (r.state === "provisioning" || r.state === "active") {
        const conn = appConn.get(r.app)!;
        const [g] = await tx
          .insert(accessGrants)
          .values({
            tenantId,
            personId: requester,
            appId: appId.get(r.app)!,
            tierId: tid(r.app, r.tier),
            requestId: reqId,
            source: "request",
            grantedAt: doneAt ?? decidedAt!,
            lastSeenAt: r.lastSeen ? lastSeen(clock, r.lastSeen) : null,
            externalAccountId: doneAt && conn !== "manual" ? fakeGuid(`${r.app}:${r.who}`) : null,
            createdAt: decidedAt!,
          })
          .returning({ id: accessGrants.id });
        grantId.set(`${r.who}|${r.app}`, g!.id);
        if (doneAt) addActive(r.who, r.app);
        await tx.insert(provisioningJobs).values({
          tenantId,
          grantId: g!.id,
          requestId: reqId,
          action: "create",
          state: doneAt ? "done" : conn === "manual" ? "manual" : "queued",
          connectorKind: conn,
          attempts: doneAt ? 1 : 0,
          runAfter: decidedAt!,
          createdAt: decidedAt!,
          updatedAt: doneAt ?? decidedAt!,
        });
        if (conn === "manual" && !doneAt) {
          audit({ type: "system" }, "desk.provisioning.manual_task", "access_request", reqId, target({ action: "create", assignedTo: "it_team" }), decidedAt!);
        }
        if (doneAt) {
          audit({ type: "system" }, "desk.provisioning.done", "access_request", reqId, target({ action: "create", connector: connVia[conn], via: connVia[conn] }), doneAt);
        }
      }
    }

    /* Hardware. */
    await tx.insert(hardwareAssets).values(
      HARDWARE.map(([tag, model, type, who, status, warranty, costCents], i) => {
        const years = type === "Laptop" ? 3 : 2;
        const w = warranty.split("-");
        const purchased = `${Number(w[0]) - years}-${w[1]}-01`;
        return {
          tenantId,
          tag,
          model,
          type,
          serial: `${type === "Laptop" ? "C02" : "F4G"}${createHash("sha1").update(tag).digest("hex").slice(0, 8).toUpperCase()}`,
          assignedPersonId: who ? pid(who) : null,
          status,
          warrantyEndsOn: clock.day(warranty),
          purchasedOn: clock.day(purchased),
          costCents,
          notes: status === "in_repair" ? "Faulty keyboard — sent back for repair" : null,
          createdAt: clock.at("2026-03-02", "09:00"),
          updatedAt: clock.ago(i % 9, "09:00"),
        };
      }),
    );

    /* Access review — "Quarterly access review — Q3 2026". */
    const opensOn = "2026-09-15";
    const [review] = await tx
      .insert(accessReviews)
      .values({
        tenantId,
        name: REVIEW_NAME,
        frameworks: ["ISO 27001 · A.5.18", "NIS2 · art. 21"],
        scope: "sensitive",
        reviewers: "managers",
        state: "open",
        opensOn: clock.day(opensOn),
        dueOn: clock.day("2026-10-15"),
        createdAt: clock.at(opensOn, "08:00"),
      })
      .returning({ id: accessReviews.id });

    const reviewItems: Array<typeof accessReviewItems.$inferInsert> = [];
    for (const [who, app, signal, detail] of REVIEW_PAUL) {
      reviewItems.push({
        tenantId,
        reviewId: review!.id,
        grantId: grantId.get(`${who}|${app}`)!,
        reviewerPersonId: pid("Paul Mercier"),
        signal: signal ?? null,
        signalDetail: signal === "leaving" ? clock.day(detail!) : (detail ?? null),
      });
    }
    // Other reviewers: every grant of their reports; [reviewer, reports, decided count, first decision day].
    const others: Array<[string, string[], number, string]> = [
      ["Nicolas Petit", ["Thomas Girard", "Maxime Lefèvre"], 11, "2026-09-17"],
      ["Camille Dubois", ["Léa Martin"], 4, "2026-09-22"],
      ["Élodie Faure", ["Hugo Blanc"], 0, "2026-09-22"],
    ];
    for (const [reviewer, reports, decidedCount, firstDay] of others) {
      const lines = reports.flatMap((who) => (activeApps.get(who) ?? []).map((app) => [who, app] as const));
      lines.forEach(([who, app], i) => {
        const decided = i < decidedCount;
        const at = clock.at(firstDay, `${String(9 + (i % 8)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`);
        const gid = grantId.get(`${who}|${app}`)!;
        reviewItems.push({
          tenantId,
          reviewId: review!.id,
          grantId: gid,
          reviewerPersonId: pid(reviewer),
          decision: decided ? "keep" : "pending",
          decidedAt: decided ? at : null,
        });
        if (decided) {
          audit({ type: "person", id: pid(reviewer) }, "desk.review.decided", "access_grant", gid, { review: REVIEW_NAME, reviewer, person: who, app: appName.get(app), decision: "keep" }, at);
        }
      });
    }
    await tx.insert(accessReviewItems).values(reviewItems);
    audit({ type: "system" }, "desk.review.opened", "access_review", review!.id, { actor: "Sarah Leroy", name: REVIEW_NAME, frameworks: ["ISO 27001 · A.5.18", "NIS2 · art. 21"], items: reviewItems.length, dueOn: clock.day("2026-10-15") }, clock.at(opensOn, "08:00"));

    /* Shadow IT. */
    await tx.insert(shadowFindings).values(
      SHADOW.map(([name, domain, iconKey, source, users, spend, risk, riskReason, firstSeen]) => ({
        tenantId,
        name,
        domain,
        iconKey,
        source,
        users,
        monthlySpendCents: spend,
        risk,
        riskReason,
        status: "new" as const,
        firstSeenAt: clock.ago(firstSeen, "07:00"),
        lastSeenAt: clock.ago(0, "07:00"),
      })),
    );

    if (audits.length) await tx.insert(auditEvents).values(audits);

    const [grantCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(accessGrants).where(eq(accessGrants.tenantId, tenantId));
    return {
      people: PEOPLE.length,
      apps: APPS.length,
      requests: REQUESTS.length,
      grants: grantCount?.n ?? 0,
      hardware: HARDWARE.length,
      auditEvents: audits.length,
      ticketNumbers: [firstNumber, number],
    };
  });
}
