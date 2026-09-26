import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESK_AUDIT_ACTIONS, describeDeskAudit, deskAuditLine } from "./audit";
import { domainT } from "./i18n";
import { renderDeskMail } from "./notify";

/**
 * The journal lines the screens show, and the emails the domain sends, in the
 * tenant's language — the design's own sentences ("Approuvé par Paul Mercier
 * (manager et propriétaire)") are the reference.
 */
const en = domainT("en");
const fr = domainT("fr");

describe("describeDeskAudit", () => {
  it("renders the design's lines", () => {
    expect(describeDeskAudit("desk.request.submitted", { actor: "Inès Haddad" }, fr)).toBe("Demande créée par Inès Haddad");
    expect(describeDeskAudit("desk.approval.approved", { actor: "Paul Mercier", step: "manager", merged: true }, fr)).toBe("Approuvé par Paul Mercier (manager et propriétaire)");
    expect(describeDeskAudit("desk.approval.approved", { actor: "Camille Dubois", step: "manager", merged: false }, fr)).toBe("Approuvé par Camille Dubois (manager)");
    expect(describeDeskAudit("desk.request.auto_approved", { rule: "group:x", group: "Équipe Tech" }, fr)).toBe("Auto-approuvée (règle : Équipe Tech)");
    expect(describeDeskAudit("desk.provisioning.done", { action: "create", connector: "entra" }, fr)).toBe("Compte créé via Entra ID");
    expect(describeDeskAudit("desk.approval.reminded", { automatic: true, approver: "Paul Mercier" }, fr)).toBe("Relance automatique envoyée à Paul Mercier");
  });

  it("tells an onboarding grant from a direct assignment", () => {
    expect(describeDeskAudit("desk.grant.direct", { actor: "Sarah Leroy", person: "Chloé Vasseur", app: "Slack", source: "onboarding" }, en)).toBe(
      "Onboarding: access to Slack granted to Chloé Vasseur by Sarah Leroy",
    );
  });

  it("appends the comment", () => {
    expect(describeDeskAudit("desk.approval.refused", { actor: "Paul Mercier", comment: "Pas pour ce trimestre" }, fr)).toBe("Refusé par Paul Mercier — « Pas pour ce trimestre »");
  });

  it("says when an admin decided in place of the approver", () => {
    expect(describeDeskAudit("desk.approval.approved", { actor: "Sarah Leroy", byAgent: true, approver: "Paul Mercier", step: "manager" }, en)).toBe(
      "Approved by Sarah Leroy (IT admin) in place of Paul Mercier",
    );
  });

  it("formats dates through the caller", () => {
    expect(describeDeskAudit("desk.grant.expired", { app: "Figma", person: "Léa Martin", date: "2026-10-01" }, en, () => "1 Oct 2026")).toBe(
      "Access to Figma expired on 1 Oct 2026 — revoked automatically",
    );
  });

  it("reads the name of a deleted item from `before`", () => {
    expect(describeDeskAudit("desk.group.deleted", null, en, undefined, { name: "Design" })).toBe("Group deleted: Design");
  });

  it("knows every action it declares", () => {
    for (const action of DESK_AUDIT_ACTIONS) expect(deskAuditLine(action, {}), action).not.toBeNull();
    expect(describeDeskAudit("desk.unknown.thing", {}, en)).toBe("desk.unknown.thing");
  });
});

/**
 * Every `desk.*` action written anywhere (packages/desk, ee/desk, the seed).
 * Maintained by hand — the scan below fails when a writer adds one that is
 * missing here, and the next test fails when one of these has no sentence.
 */
const WRITTEN_ACTIONS = [
  // packages/desk
  "desk.request.submitted",
  "desk.request.auto_approved",
  "desk.request.notified",
  "desk.request.cancelled",
  "desk.approval.approved",
  "desk.approval.refused",
  "desk.approval.reminded",
  "desk.approval.escalated",
  "desk.provisioning.manual_task",
  "desk.provisioning.done",
  "desk.provisioning.done_manually",
  "desk.provisioning.failed",
  "desk.grant.direct",
  "desk.grant.extended",
  "desk.grant.returned",
  "desk.grant.revoked",
  "desk.grant.expired",
  "desk.grant.expiry_notified",
  "desk.person.created",
  "desk.person.updated",
  "desk.person.manager_set",
  "desk.person.absence_set",
  "desk.person.suspended",
  "desk.person.reactivated",
  "desk.person.departed",
  "desk.group.created",
  "desk.group.updated",
  "desk.group.deleted",
  "desk.delegation.created",
  "desk.delegation.deleted",
  "desk.directory.imported",
  "desk.app.created",
  "desk.app.updated",
  "desk.app.tiers_set",
  "desk.app.auto_groups_set",
  "desk.app.archived",
  "desk.hardware.created",
  "desk.hardware.updated",
  "desk.hardware.assigned",
  "desk.hardware.problem_reported",
  "desk.hardware.imported",
  "desk.tool.requested",
  "desk.config.updated",
  // ee/desk — connectors and SCIM
  "desk.connector.created",
  "desk.connector.updated",
  "desk.connector.tested",
  "desk.connector.deleted",
  "desk.scim_token.rotated",
  // ee/desk — governance modules
  "desk.budget.set",
  "desk.licences.reclaimed",
  "desk.lifecycle.scheduled",
  "desk.lifecycle.cancelled",
  "desk.lifecycle.executed",
  "desk.lifecycle.task_done",
  "desk.lifecycle.task_reopened",
  "desk.pack.set",
  "desk.review.opened",
  "desk.review.decided",
  "desk.review.reminded",
  "desk.review.closed",
  "desk.shadow.discovered",
  "desk.shadow.status_changed",
  "desk.sod_rule.created",
  "desk.sod_rule.updated",
  "desk.sod_rule.deleted",
];

const REPO = join(__dirname, "../../..");
const WRITER_DIRS = ["packages/desk/src", "ee/desk/src", "apps/web/src", "ee/web/src", "apps/worker/src", "packages/db/src/seed"];

function sources(dir: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "i18n" ? [] : sources(path);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
  });
}

/** The action literals passed to a journal writer: writeDeskAudit, ee's journal/audit, the seed's audit. */
function scannedActions(): Set<string> {
  const found = new Set<string>();
  for (const dir of WRITER_DIRS) {
    for (const file of sources(join(REPO, dir))) {
      const src = readFileSync(file, "utf8");
      // A call's arguments up to the target (`{ type: …` or `jobTarget(…)`) or, for the seed, its first string argument.
      for (const call of src.matchAll(/\b(?:writeDeskAudit|journal|audit)\(([^;]*?)(?:\{\s*type:|\b\w+Target\(|,\s*"[a-z_]+",\s*\w+)/g)) {
        for (const m of call[1]!.matchAll(/["'`](desk\.[a-z_]+\.[a-z_]+)["'`]/g)) found.add(m[1]!);
      }
      // `desk.person.${cond ? "suspended" : "reactivated"}` (SCIM)
      for (const m of src.matchAll(/`(desk\.[a-z_]+)\.\$\{[^}]*?"([a-z_]+)"\s*:\s*"([a-z_]+)"\s*\}`/g)) {
        found.add(`${m[1]}.${m[2]}`);
        found.add(`${m[1]}.${m[3]}`);
      }
    }
  }
  return found;
}

describe("journal coverage", () => {
  it("has a sentence for every action written anywhere", () => {
    const handled = new Set<string>(DESK_AUDIT_ACTIONS);
    const unhandled = WRITTEN_ACTIONS.filter((a) => !handled.has(a) || deskAuditLine(a, {}) === null);
    expect(unhandled).toEqual([]);
  });

  it("lists every action the writers use", () => {
    const scanned = scannedActions();
    // The scan must see the writers at all — an empty set would pass vacuously.
    expect(scanned.has("desk.review.decided")).toBe(true);
    expect(scanned.has("desk.request.submitted")).toBe(true);
    expect(scanned.has("desk.provisioning.done_manually")).toBe(true);
    expect(scanned.has("desk.person.reactivated")).toBe(true);
    expect([...scanned].filter((a) => !WRITTEN_ACTIONS.includes(a)).sort()).toEqual([]);
  });
});

describe("ee/desk journal lines", () => {
  const actor = "Marie Dupont";
  const money = (units: number) => en.fmt.amount(units);
  // [action, after, before, expected fragments] — payloads as ee/desk writes them.
  const cases: Array<[string, Record<string, unknown>, Record<string, unknown> | null, string[]]> = [
    ["desk.budget.set", { actor, department: "Design", amountCents: 45000 }, { department: "Design", amountCents: 30000 }, ["Design", "450.00", actor]],
    ["desk.budget.set", { actor, department: "Design", amountCents: 45000, period: "monthly" }, null, ["Design", "450.00", "per month", actor]],
    ["desk.licences.reclaimed", { actor, app: "Figma", revoked: 3, yearlySavingCents: 54000, inactiveAfterDays: 60, grantIds: [] }, null, ["3 inactive seats", "Figma", "540.00", actor]],
    ["desk.licences.reclaimed", { actor, app: "Figma", revoked: 1, yearlySavingCents: 18000 }, null, ["1 inactive seat on", "180.00"]],
    ["desk.lifecycle.scheduled", { actor, kind: "offboarding", person: "Léa Martin", executeAt: "2026-10-01T16:00:00.000Z", revokes: 4 }, null, ["Offboarding", "Léa Martin", "1 Oct", actor]],
    ["desk.lifecycle.scheduled", { actor, kind: "onboarding", person: "Chloé Vasseur", executeAt: "2026-10-05T07:00:00.000Z" }, null, ["Onboarding", "Chloé Vasseur", "5 Oct", actor]],
    ["desk.lifecycle.cancelled", { actor, kind: "offboarding", replaced: true }, null, ["offboarding", "replaced"]],
    ["desk.lifecycle.cancelled", { actor, kind: "onboarding" }, null, ["onboarding", actor]],
    ["desk.lifecycle.executed", { actor: "offboarding", kind: "offboarding", automaticDone: 5, manualOpen: 2, failures: [{ taskId: "t", key: "revoke:slack", error: "x" }] }, null, ["Offboarding", "5", "2", "failed: 1"]],
    ["desk.lifecycle.task_done", { actor, planId: "p", key: "transfer:drive" }, null, ["done", actor]],
    ["desk.lifecycle.task_reopened", { actor, planId: "p", key: "transfer:drive" }, null, ["reopened", actor]],
    ["desk.pack.set", { actor, department: "Sales", appIds: ["a", "b", "c"] }, { department: "Sales", appIds: [] }, ["Sales", "3 applications", actor]],
    ["desk.review.opened", { actor, name: "Q3 review", scope: "all", reviewers: "managers", dueOn: "2026-10-15", items: 42 }, null, ["Q3 review", "42 access lines", "15 Oct", actor]],
    ["desk.review.decided", { actor, decision: "keep", reviewId: "r", grantId: "g", person: "Léa Martin", app: "Figma" }, { decision: "pending" }, ["kept", "Figma", "Léa Martin", actor]],
    ["desk.review.decided", { actor, decision: "revoke", person: "Léa Martin", app: "Figma" }, { decision: "keep" }, ["revocation", "Figma", "Léa Martin", actor]],
    ["desk.review.reminded", { actor, reviewerPersonId: "x", reviewer: "Paul Mercier", email: "p@x", review: "Q3", pending: 7, dueOn: "2026-10-15" }, null, ["Paul Mercier", "7 lines", actor]],
    ["desk.review.closed", { actor, name: "Q3 review", revoked: 4, kept: 30, unanswered: 2, whenUnanswered: "keep" }, null, ["Q3 review", "revoked: 4", "kept: 30", "unanswered: 2", actor]],
    ["desk.shadow.discovered", { actor: null, source: "google_oauth", events: 120, found: 6 }, null, ["6 unknown applications"]],
    ["desk.shadow.status_changed", { actor, status: "added", name: "Miro", domain: "miro.com", appId: "a" }, { status: "new" }, ["Miro", "added", actor]],
    ["desk.shadow.status_changed", { actor, status: "blocked", name: "Miro", tokenRevocation: "not_automated" }, { status: "new" }, ["Miro", "blocked", "identity provider", actor]],
    ["desk.shadow.status_changed", { actor, status: "blocked", name: "Miro", tokenRevocation: null }, { status: "new" }, ["Miro", "blocked", actor]],
    ["desk.shadow.status_changed", { actor, status: "ignored", name: "Miro" }, { status: "new" }, ["Miro", "ignored", actor]],
    ["desk.sod_rule.created", { actor, tierAId: "a", tierBId: "b", reason: "Payments vs approvals", enabled: true }, null, ["created", "Payments vs approvals", actor]],
    ["desk.sod_rule.updated", { actor, reason: "Payments vs approvals", enabled: false }, { reason: "Payments vs approvals", enabled: true }, ["disabled", "Payments vs approvals"]],
    ["desk.sod_rule.updated", { actor, reason: "Payments vs approvals", enabled: true }, { reason: "Payments vs approvals", enabled: false }, ["enabled", "Payments vs approvals"]],
    ["desk.sod_rule.updated", { actor, reason: "New reason", enabled: true }, { reason: "Old", enabled: true }, ["changed", "New reason"]],
    ["desk.sod_rule.deleted", { actor }, { tierAId: "a", tierBId: "b", reason: "Payments vs approvals", enabled: true }, ["deleted", "Payments vs approvals", actor]],
  ];

  it.each(cases)("%s renders a sentence with its parameters", (action, after, before, fragments) => {
    const line = describeDeskAudit(action, after, en, (iso) => en.fmt.dateShort(new Date(iso)), before, money);
    expect(line).not.toBe(action);
    expect(line).not.toMatch(/desk\.|\{\w+\}|—:/);
    for (const f of fragments) expect(line).toContain(f);
  });

  it("formats amounts through the screen's t.fmt when no formatter is given", () => {
    expect(describeDeskAudit("desk.budget.set", { actor, department: "Design", amountCents: 123456 }, en)).toBe("Budget for Design set to €1,234.56 by Marie Dupont");
    expect(describeDeskAudit("desk.budget.set", { actor, department: "Design", amountCents: 45000, period: "monthly" }, fr)).toBe(
      "Budget de l’équipe Design fixé à 450,00 € par mois par Marie Dupont",
    );
  });

  it("renders the ee lines in languages with other plural rules", () => {
    const ee = cases.map(([a]) => a);
    for (const action of new Set(ee)) expect(WRITTEN_ACTIONS, action).toContain(action);
    for (const code of ["de", "pl", "ga", "fi"]) {
      const t = domainT(code);
      for (const [action, after, before] of cases) expect(describeDeskAudit(action, after, t, undefined, before), `${code} ${action}`).not.toMatch(/desk\.domain|\{\w+\}/);
    }
  });
});

describe("emails", () => {
  it("are written in the workspace language", () => {
    const mail = renderDeskMail(
      { id: "t", slug: "acme", name: "Acme", locale: "fr", timezone: "Europe/Paris" },
      {
        event: "request_to_approve",
        to: { email: "paul@acme.test", name: "Paul Mercier" },
        subject: ["desk.domain.mail.toApproveSubject", { app: "HubSpot", requester: "Inès Haddad" }],
        lines: [["desk.domain.mail.toApproveBody", { app: "HubSpot", tier: "Utilisateur", requester: "Inès Haddad" }]],
        quote: "Suivi des campagnes ABM",
        button: ["desk.domain.mail.buttonReview", "/desk/approvals"],
      },
    );
    expect(mail.subject).toBe("Demande d’accès à approuver : HubSpot pour Inès Haddad");
    expect(mail.text).toContain("Bonjour Paul Mercier,");
    expect(mail.text).toContain("« Suivi des campagnes ABM »");
    expect(mail.text).toContain("acme.");
    expect(mail.html).toContain("Examiner la demande");
  });

  it("review reminders count their lines in the language's plural", () => {
    expect(fr("desk.domain.mail.reviewReminderBody", { count: 1, campaign: "T3", date: "30 sept." })).toContain("1 ligne d’accès attend");
    expect(en("desk.domain.mail.reviewReminderBody", { count: 4, campaign: "Q3", date: "Sep 30" })).toContain("4 access lines are waiting");
  });

  it("plural durations follow the language", () => {
    expect(en("desk.domain.duration.days", { count: 1 })).toBe("1 day");
    expect(fr("desk.domain.duration.days", { count: 30 })).toBe("30 jours");
  });
});
