/**
 * "demo" seed — FROZEN demonstration data set + the install defaults.
 * Workspace "Acme Support" (slug acme, accent #0B5F46), reference ticket #4821.
 * The product defaults (macros, SLA, rules, teams, fields) come from defaults.ts —
 * the same ones as for any new workspace.
 *
 * Usage: pnpm db:seed (replayable — upgrades an already seeded database).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../client";
import { installDemoHistory } from "./history";
import {
  automationRules,
  businessHours,
  contactOrganizations,
  contacts,
  formFields,
  kbArticles,
  kbCategories,
  macros,
  mailboxes,
  orgAdminGrants,
  organizations,
  rejectedEmails,
  slaPolicies,
  teamMembers,
  teams,
  tenants,
  ticketFields,
  ticketForms,
  ticketMessages,
  tickets,
  users,
  verifiedDomains,
} from "../schema";
import { installDefaults } from "./defaults";

const HOUR = 3600 * 1000;

/* ---------- Mailbox ---------- */
async function ensureMailbox(tenantId: string) {
  await db
    .insert(mailboxes)
    .values({
      tenantId,
      address: "support@acme.example",
      kind: "provided",
      verified: true,
      senderName: "Acme Support",
    })
    .onConflictDoNothing();
}

/* ---------- Design defaults: purge the old ad hoc seed, then install ---------- */
async function resetAndInstallDefaults(tenantId: string) {
  // The example content follows the workspace's language, not the seed's.
  const [row] = await db
    .select({ locale: tenants.locale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  /* Defaults already in place. Recognised by the presence of a calendar, not by
     the name of a policy: the names are translated now, and looking for
     "Premium customers" stopped recognising a workspace in any other language —
     the seed would then wipe and reinstall its defaults on every single run,
     detaching the demo tickets from their policy each time. */
  const [marker] = await db
    .select({ id: businessHours.id })
    .from(businessHours)
    .where(eq(businessHours.tenantId, tenantId))
    .limit(1);
  if (marker) return;

  // Detach the tickets from the old policies/teams/forms before the purge.
  await db
    .update(tickets)
    .set({ slaPolicyId: null, teamId: null, formId: null })
    .where(eq(tickets.tenantId, tenantId));
  await db.delete(automationRules).where(eq(automationRules.tenantId, tenantId));
  await db.delete(macros).where(eq(macros.tenantId, tenantId));
  await db.delete(slaPolicies).where(eq(slaPolicies.tenantId, tenantId));
  await db.delete(formFields).where(eq(formFields.tenantId, tenantId));
  await db.delete(ticketForms).where(eq(ticketForms.tenantId, tenantId));
  await db.delete(ticketFields).where(eq(ticketFields.tenantId, tenantId));
  await db.delete(teamMembers).where(eq(teamMembers.tenantId, tenantId));
  await db.delete(teams).where(eq(teams.tenantId, tenantId));
  await db.delete(businessHours).where(eq(businessHours.tenantId, tenantId));

  await installDefaults(tenantId, row?.locale ?? "en");
}

/* ---------- Team memberships (ST-02 design) ---------- */
async function ensureMemberships(tenantId: string) {
  const agentRows = await db.select().from(users).where(eq(users.tenantId, tenantId));
  const teamRows = await db.select().from(teams).where(eq(teams.tenantId, tenantId));
  const agent = (name: string) => agentRows.find((a) => a.name === name)?.id;
  const team = (name: string) => teamRows.find((t) => t.name === name)?.id;

  const wanted: Array<[string, string]> = [
    ["Marie Dupont", "Tier 1"],
    ["Marie Dupont", "Escalation"],
    ["Thomas Roux", "Tier 1"],
    ["Claire Bonnet", "Sales"],
    ["Sofiane Amrani", "Tier 1"],
    ["Sofiane Amrani", "Product"],
    ["Élise Chabot", "Escalation"],
  ];
  for (const [agentName, teamName] of wanted) {
    const userId = agent(agentName);
    const tId = team(teamName);
    if (userId && tId) {
      await db
        .insert(teamMembers)
        .values({ tenantId, teamId: tId, userId })
        .onConflictDoNothing();
    }
  }
}

/* ---------- CSAT (ST-08) ---------- */
/**
 * Rejected-email log of the demonstration data set (ST-03 of the design): shows the
 * four reasons the pipeline is able to produce, with staggered dates.
 */
/**
 * The five demonstration portal requests (PT-05 of the design) and the complete thread
 * of ticket #4821 (PT-06: four alternating public messages). Without them, the
 * "Solved" tab falls back to the empty state and the tinted agent bubble never shows.
 * Replayable: each ticket is only created if it is missing.
 */
async function ensureDemoRequests(tenantId: string) {
  const [julien] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, "julien.lambert@nordfil.example")));
  const [marie] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, "marie.dupont@acme.example")));
  const [nordfil] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.tenantId, tenantId), eq(organizations.name, "Nordfil SAS")));
  if (!julien || !marie || !nordfil) return;

  const DAY = 24 * HOUR;
  const now = Date.now();

  // 1. The complete public thread of #4821 (the seed only had the first message).
  const [ref] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.number, 4821)));
  if (ref) {
    const base = ref.createdAt.getTime();
    // Idempotent message by message: the thread may already contain other replies.
    const present = await db
      .select({ body: ticketMessages.bodyText })
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ref.id));
    const has = (needle: string) => present.some((m) => (m.body ?? "").includes(needle));

    const thread = [
      {
        tenantId,
        ticketId: ref.id,
        kind: "public_reply" as const,
        authorType: "agent" as const,
        authorId: marie.id,
        bodyText:
          "Hello Julien, thank you for the report. I do reproduce the error on " +
          "invoices with more than 50 lines. I am passing it to the engineering team " +
          "and will get back to you before noon.",
        createdAt: new Date(base + 29 * 60 * 1000),
      },
      {
        tenantId,
        ticketId: ref.id,
        kind: "public_reply" as const,
        authorType: "contact" as const,
        authorId: julien.id,
        source: "email" as const,
        bodyText:
          "Thank you for the quick answer. Do you have an estimate? Our finance " +
          "department needs the export by Friday 5 pm at the latest.",
        createdAt: new Date(base + 166 * 60 * 1000),
      },
      {
        tenantId,
        ticketId: ref.id,
        kind: "public_reply" as const,
        authorType: "agent" as const,
        authorId: marie.id,
        bodyText:
          "The fix has been deployed since 2 pm. The export works again, large " +
          "invoices included. Could you confirm on your side?",
        createdAt: new Date(base + 308 * 60 * 1000),
      },
    ];

    const missing = thread.filter((m) => !has((m.bodyText ?? "").slice(0, 40)));
    if (missing.length > 0) await db.insert(ticketMessages).values(missing);
  }

  // 2. The four other requests of the demo inbox.
  const others = [
    {
      number: 4817,
      subject: "Question about annual billing",
      status: "waiting" as const,
      priority: "normal" as const,
      createdAt: new Date(now - 2 * DAY),
      body:
        "Hello, we would like to move to annual billing. Could you confirm how the " +
        "current month is prorated?",
      reply:
        "Hello, that is possible at any time. Could you confirm how many seats to " +
        "bill for the coming year?",
    },
    {
      number: 4790,
      subject: "Adding two users to the account",
      status: "resolved" as const,
      priority: "normal" as const,
      createdAt: new Date(now - 6 * DAY),
      resolvedAt: new Date(now - 4 * DAY),
      body: "We would like to add two colleagues to our workspace. What is the procedure?",
      reply:
        "Done: both accounts are created and have received their invitation. Do let " +
        "us know if an access is missing.",
    },
    {
      number: 4756,
      subject: "Question about automatic reminders",
      status: "resolved" as const,
      priority: "low" as const,
      createdAt: new Date(now - 17 * DAY),
      resolvedAt: new Date(now - 14 * DAY),
      body: "Can automatic reminders be turned off for our organization?",
      reply:
        "Yes, the setting lives in your organization's preferences. I have turned " +
        "it off for you.",
    },
    {
      number: 4702,
      subject: "Error on the first CSV import",
      status: "closed" as const,
      priority: "normal" as const,
      createdAt: new Date(now - 34 * DAY),
      resolvedAt: new Date(now - 31 * DAY),
      closedAt: new Date(now - 30 * DAY),
      body: "Importing our customer file fails with a format error on line 42.",
      reply:
        "The file used semicolons as separators. Once converted to commas, the import " +
        "goes through. I am closing the request.",
    },
  ];

  for (const t of others) {
    const [already] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.number, t.number)));
    if (already) continue;

    const [created] = await db
      .insert(tickets)
      .values({
        tenantId,
        number: t.number,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        channel: "portal",
        requesterId: julien.id,
        organizationId: nordfil.id,
        assigneeId: marie.id,
        createdAt: t.createdAt,
        updatedAt: t.resolvedAt ?? t.createdAt,
        firstRepliedAt: new Date(t.createdAt.getTime() + 2 * HOUR),
        resolvedAt: t.resolvedAt ?? null,
        closedAt: t.closedAt ?? null,
      })
      .returning();
    if (!created) continue;

    await db.insert(ticketMessages).values([
      {
        tenantId,
        ticketId: created.id,
        kind: "public_reply" as const,
        authorType: "contact" as const,
        authorId: julien.id,
        source: "portal" as const,
        bodyText: t.body,
        createdAt: t.createdAt,
      },
      {
        tenantId,
        ticketId: created.id,
        kind: "public_reply" as const,
        authorType: "agent" as const,
        authorId: marie.id,
        bodyText: t.reply,
        createdAt: new Date(t.createdAt.getTime() + 2 * HOUR),
      },
    ]);
  }
}

/**
 * The two invited agents of the design (ST-02): they make the "Invited" state and the
 * "Resend" action visible, both unreachable with five agents all active.
 * Nicolas is a Viewer (seat not counted), Amina is an Agent of the Produit team.
 */
/**
 * Last seen of the active agents (ST-02 of the design: "4 min ago" → "3 d ago").
 * Without these dates the column shows "—" everywhere and the screen looks unfinished.
 */
async function ensureLastSeen(tenantId: string) {
  const MIN = 60 * 1000;
  const seen: [string, number][] = [
    ["marie.dupont@acme.example", 4 * MIN],
    ["thomas.roux@acme.example", 22 * MIN],
    ["claire.bonnet@acme.example", 60 * MIN],
    ["sofiane.amrani@acme.example", 26 * HOUR],
    ["elise.chabot@acme.example", 3 * 24 * HOUR],
  ];
  for (const [email, ago] of seen) {
    await db
      .update(users)
      .set({ lastSeenAt: new Date(Date.now() - ago) })
      .where(and(eq(users.tenantId, tenantId), eq(users.email, email), isNull(users.lastSeenAt)));
  }
}

/**
 * One named contact per customer organization: the lists and the threads show a name,
 * not an address. Contacts created by email ingestion stay anonymous as long as no
 * name has been transmitted — here we complete those of the demonstration data set.
 */
async function ensureNamedContacts(tenantId: string) {
  const wanted = [
    { name: "Marc Petit", email: "marc.petit@studiokaori.example", org: "Studio Kaori" },
  ];

  for (const person of wanted) {
    const [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, person.email)));

    const contactId =
      existing?.id ??
      (
        await db
          .insert(contacts)
          .values({ tenantId, name: person.name, email: person.email, locale: "en" })
          .returning()
      )[0]?.id;
    if (!contactId) continue;
    if (existing && !existing.name) {
      await db.update(contacts).set({ name: person.name }).where(eq(contacts.id, contactId));
    }

    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.tenantId, tenantId), eq(organizations.name, person.org)));
    if (org) {
      await db
        .insert(contactOrganizations)
        .values({ tenantId, contactId, organizationId: org.id })
        .onConflictDoNothing();
    }
  }
}

async function ensureInvitedAgents(tenantId: string) {
  const invited = [
    { name: "Nicolas Fabre", email: "nicolas.fabre@acme.example", role: "viewer" as const, team: null },
    { name: "Amina Traoré", email: "amina.traore@acme.example", role: "agent" as const, team: "Product" },
  ];

  for (const person of invited) {
    const [already] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, person.email)));
    if (already) continue;

    const [created] = await db
      .insert(users)
      .values({
        tenantId,
        name: person.name,
        email: person.email,
        role: person.role,
        status: "invited",
      })
      .returning();
    if (!created || !person.team) continue;

    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.tenantId, tenantId), eq(teams.name, person.team)));
    if (team) {
      await db
        .insert(teamMembers)
        .values({ tenantId, teamId: team.id, userId: created.id })
        .onConflictDoNothing();
    }
  }
}

async function ensureRejectedEmails(tenantId: string) {
  const existing = await db
    .select({ id: rejectedEmails.id })
    .from(rejectedEmails)
    .where(eq(rejectedEmails.tenantId, tenantId));
  if (existing.length > 0) return;

  const now = Date.now();
  await db.insert(rejectedEmails).values([
    {
      tenantId,
      fromAddress: "no-reply@spamsource.xyz",
      subject: "Gagnez 3000 € par semaine",
      reason: "spam",
      detail: "score 9,2",
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      tenantId,
      fromAddress: "support@acme.fr",
      subject: "Re: Re: Re: Ticket #4788",
      reason: "loop",
      createdAt: new Date(now - 9 * HOUR),
    },
    {
      tenantId,
      fromAddress: "mailer-daemon@orange.fr",
      subject: "Undelivered Mail Returned to Sender",
      reason: "bounce",
      createdAt: new Date(now - 28 * HOUR),
    },
    {
      tenantId,
      fromAddress: "newsletter@partenaire.com",
      subject: "Votre lettre d'information de septembre",
      reason: "blocked_sender",
      createdAt: new Date(now - 52 * HOUR),
    },
  ]);
}

async function ensureCsat(tenantId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const config = (tenant?.csatConfig ?? {}) as { enabled?: boolean };
  if (config.enabled === undefined) {
    await db
      .update(tenants)
      .set({
        csatConfig: {
          enabled: true,
          question: "How would you rate the answer you received?",
        },
      })
      .where(eq(tenants.id, tenantId));
  }
}

/* ---------- Knowledge base (PT-01/PT-02/AG-10) ---------- */
async function ensureKb(tenantId: string) {
  const [migrated] = await db
    .select({ id: kbCategories.id })
    .from(kbCategories)
    .where(and(eq(kbCategories.tenantId, tenantId), eq(kbCategories.slug, "getting-started")));
  if (migrated) return;

  // Purge of the old ad hoc content.
  await db.delete(kbArticles).where(eq(kbArticles.tenantId, tenantId));
  await db.delete(kbCategories).where(eq(kbCategories.tenantId, tenantId));

  const topCategories = [
    ["Getting started", "getting-started", "◷", "Create your account, invite your team and set up your first accesses."],
    ["Billing", "billing", "€", "Invoices, payment methods, subscription changes and refunds."],
    ["Day-to-day use", "day-to-day-use", "◈", "The everyday gestures, from shortcuts to custom views."],
    ["Integrations", "integrations", "⇄", "Connect your tools: Slack, Jira, Salesforce and the public API."],
    ["Security & compliance", "security-compliance", "⛨", "Authentication, GDPR, data hosting and logs."],
    ["Troubleshooting", "troubleshooting", "⚙", "Solve the most frequent errors in a few steps."],
  ] as const;
  const catIds = new Map<string, string>();
  let position = 0;
  for (const [name, slug, icon, description] of topCategories) {
    const [row] = await db
      .insert(kbCategories)
      .values({ tenantId, name, slug, icon, description, position: position++ })
      .returning({ id: kbCategories.id });
    catIds.set(slug, row!.id);
  }

  // Sections of the Billing category (PT-02 accordions, AG-10 tree).
  const sections = [
    ["Invoices and payments", "invoices-and-payments"],
    ["Subscription changes", "subscription-changes"],
    ["Refunds", "refunds"],
  ] as const;
  position = 0;
  for (const [name, slug] of sections) {
    const [row] = await db
      .insert(kbCategories)
      .values({
        tenantId,
        parentId: catIds.get("billing"),
        name,
        slug,
        position: position++,
      })
      .returning({ id: kbCategories.id });
    catIds.set(slug, row!.id);
  }

  const agents = await db.select().from(users).where(eq(users.tenantId, tenantId));
  const author = (name: string) => agents.find((a) => a.name === name)?.id ?? null;

  type Article = {
    cat: string;
    title: string;
    slug: string;
    body: string;
    views: number;
    up: number;
    author: string;
    draft?: boolean;
  };
  const articles: Article[] = [
    {
      cat: "invoices-and-payments",
      title: "How to download your invoices",
      slug: "how-to-download-your-invoices",
      views: 4128,
      up: 96,
      author: "Claire Bonnet",
      body:
        "Your invoices are available at any time from your customer area. They are " +
        "generated on the first day of each month for the period just ended, and stay " +
        "accessible for ten years.\n\n" +
        "## From the customer area\n\n" +
        "Open **Settings → Subscription**, then scroll down to the “Invoice history” " +
        "section. Every line offers a download in PDF format.\n\n" +
        "> Only users with the Owner role can reach the billing section.\n\n" +
        "## Receiving invoices by email\n\n" +
        "You can add up to three billing addresses that will automatically receive " +
        "every invoice issued, from **Subscription → Billing address**.\n\n" +
        "```File name format\nACME-2026-08-GB12345.pdf\n```",
    },
    {
      cat: "invoices-and-payments",
      title: "Adding a payment method",
      slug: "adding-a-payment-method",
      views: 1844,
      up: 52,
      author: "Thomas Roux",
      body:
        "Card, SEPA direct debit or bank transfer: how to register a payment " +
        "method.\n\n## Card\n\nFrom **Subscription → Payment method**, click “Add a " +
        "card”. The card is verified with a €0 authorisation.\n\n## SEPA direct " +
        "debit\n\nEnter the IBAN of the account to debit; a mandate is sent to you for " +
        "electronic signature.",
    },
    {
      cat: "invoices-and-payments",
      title: "What to do when a payment fails",
      slug: "failed-payment",
      views: 1205,
      up: 44,
      author: "Marie Dupont",
      body:
        "The automatic retries, and how to settle an outstanding invoice.\n\n" +
        "## The retry schedule\n\nThree attempts are made: on the due date, then after " +
        "7 and 14 days. Past that, the account is suspended until the invoice is " +
        "settled.\n\n> Your data is kept for the whole suspension period.\n\n" +
        "## Settling\n\nUpdate your payment method from **Subscription → Payment " +
        "method**: the outstanding invoice is charged again straight away.",
    },
    {
      cat: "subscription-changes",
      title: "Switching from monthly to annual billing",
      slug: "monthly-to-annual-billing",
      views: 2901,
      up: 71,
      author: "Claire Bonnet",
      body:
        "Save 20% by moving to annual billing.\n\n## How to switch\n\n" +
        "From **Subscription → Change plan**, turn on the “Annual” switch. What is left " +
        "of your current monthly period is deducted pro rata.",
    },
    {
      cat: "subscription-changes",
      title: "Adding or removing seats",
      slug: "adding-removing-seats",
      views: 640,
      up: 22,
      author: "Claire Bonnet",
      body:
        "Billing is adjusted pro rata as soon as the change is made.\n\n## Adding " +
        "seats\n\nFrom **Subscription → Manage seats**, raise the number of seats: the " +
        "new agents can be invited immediately.\n\n## Removing seats\n\nDeactivate the " +
        "agents concerned first; the removal takes effect on the next renewal.",
    },
    {
      cat: "refunds",
      title: "Requesting a refund",
      slug: "requesting-a-refund",
      views: 983,
      up: 18,
      author: "Claire Bonnet",
      body:
        "Conditions and processing times for refund requests.\n\n## " +
        "Conditions\n\nRefunds are accepted within 30 days of the invoice, on a " +
        "motivated request.\n\n## Processing time\n\nOnce accepted, the amount is " +
        "credited back within 5 to 10 business days to the original payment method.",
    },
    {
      cat: "refunds",
      title: "VAT and cross-border invoicing",
      slug: "vat-and-cross-border-invoicing",
      views: 742,
      up: 11,
      author: "Sofiane Amrani",
      body:
        "VAT number, reverse charge and mandatory statements.\n\n## Entering your VAT " +
        "number\n\nFrom **Subscription → Billing address**, add your intra-EU VAT " +
        "number: it will appear on every invoice issued from then on.\n\n> For " +
        "customers established in another EU country, the reverse charge applies as " +
        "soon as the number is validated.",
    },
    {
      cat: "billing",
      title: "Understanding prorated billing",
      slug: "understanding-prorated-billing",
      views: 0,
      up: 0,
      author: "Marie Dupont",
      draft: true,
      body:
        "Draft — explain how the pro rata is computed when the plan or the number of " +
        "seats changes mid-period.",
    },
    {
      cat: "billing",
      title: "Invoice history: CSV export",
      slug: "invoice-history-csv-export",
      views: 0,
      up: 0,
      author: "Thomas Roux",
      draft: true,
      body: "Draft — document the CSV export of the invoice history.",
    },
    {
      cat: "getting-started",
      title: "Resetting your password",
      slug: "resetting-your-password",
      views: 3902,
      up: 64,
      author: "Marie Dupont",
      body:
        "## From the sign-in screen\n\nClick “Forgot your password?” and enter your " +
        "email: a reset link valid for 15 minutes is sent to you.\n\n> If your " +
        "organization signs in with a company account (SSO), the reset happens at your " +
        "identity provider.",
    },
    {
      cat: "getting-started",
      title: "Connecting your mailbox",
      slug: "connecting-your-mailbox",
      views: 2210,
      up: 41,
      author: "Thomas Roux",
      body:
        "## Automatic forwarding\n\nForward your support address to the address " +
        "provided: every email becomes a ticket, and your agents' replies leave from " +
        "your own address.\n\n## Checking the setup\n\nSend yourself a test email: it " +
        "must show up in the inbox in under a minute.",
    },
    {
      cat: "day-to-day-use",
      title: "Inbox keyboard shortcuts",
      slug: "inbox-keyboard-shortcuts",
      views: 512,
      up: 19,
      author: "Sofiane Amrani",
      body:
        "## Navigation\n\n“j” and “k” to move, “↵” to open, “x” to select. The " +
        "“⌘K” palette searches tickets, contacts and articles.",
    },
    {
      cat: "integrations",
      title: "Creating an API key",
      slug: "creating-an-api-key",
      views: 388,
      up: 9,
      author: "Sofiane Amrani",
      body:
        "## From the settings\n\nOpen **Settings → API & webhooks** and create a " +
        "scoped key. The full key is shown only once: copy it straight away.\n\n> " +
        "Prefer a “Read only” key for reporting integrations.",
    },
    {
      cat: "security-compliance",
      title: "Exercising a GDPR right (deletion)",
      slug: "exercising-a-gdpr-right",
      views: 154,
      up: 6,
      author: "Marie Dupont",
      body:
        "## Deleting a contact\n\nFrom the contact page, the “Delete (GDPR)” action " +
        "anonymises the tickets and removes the personal data. The operation is " +
        "recorded in the audit log.",
    },
    {
      cat: "troubleshooting",
      title: "Emails no longer reach the inbox",
      slug: "emails-no-longer-arrive",
      views: 890,
      up: 31,
      author: "Thomas Roux",
      body:
        "## Checking the forwarding\n\nUnder **Settings → Email channel**, the address " +
        "must read “Verified”. If it is failing, send a test email again after checking " +
        "the redirection at your provider.\n\n> The rejected-email log gives the exact " +
        "reason for every rejection (spam, loop, blocked sender).",
    },
  ];

  for (const a of articles) {
    await db.insert(kbArticles).values({
      tenantId,
      categoryId: catIds.get(a.cat)!,
      title: a.title,
      slug: a.slug,
      bodyHtml: a.body,
      status: a.draft ? "draft" : "published",
      publishedAt: a.draft ? null : new Date(),
      authorId: author(a.author),
      viewCount: a.views,
      votesUp: a.up,
    });
  }
}

/* ---------- PT-08: Julien = organization admin of Nordfil ---------- */
async function ensureOrgAdmin(tenantId: string) {
  const [julien] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, "julien.lambert@nordfil.example")));
  const [nordfil] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.tenantId, tenantId), eq(organizations.name, "Nordfil SAS")));
  if (!julien || !nordfil) return;
  await db
    .insert(orgAdminGrants)
    .values({
      tenantId,
      contactId: julien.id,
      organizationId: nordfil.id,
      grantedByType: "agent",
    })
    .onConflictDoNothing();
  await db
    .insert(verifiedDomains)
    .values({
      tenantId,
      organizationId: nordfil.id,
      domain: "nordfil.example",
      verificationToken: "8f2c91ab44de7013c5a6b2e9f0d18374",
      status: "verified",
      lastCheckedAt: new Date(),
    })
    .onConflictDoNothing();
}

/* ---------- Main seed ---------- */
async function seed() {
  console.log("Demo seed: Acme Support workspace…");

  let [tenant] = await db
    .insert(tenants)
    .values({
      slug: "acme",
      name: "Acme Support",
      // Explicit, even though it is the default: the demo is a frozen reference,
      // and the smoke suite asserts the wording of the screens it renders.
      locale: "en",
      branding: { accentColor: "#0B5F46" },
    })
    .onConflictDoNothing({ target: tenants.slug })
    .returning();

  const isFresh = Boolean(tenant);
  if (!tenant) {
    [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "acme"));
  }
  if (!tenant) throw new Error("Could not create or find the acme tenant");

  if (isFresh) {
    const agents = await db
      .insert(users)
      .values(
        (
          [
            ["Claire Bonnet", "claire.bonnet@acme.example", "owner"],
            ["Marie Dupont", "marie.dupont@acme.example", "admin"],
            ["Thomas Roux", "thomas.roux@acme.example", "agent"],
            ["Sofiane Amrani", "sofiane.amrani@acme.example", "agent"],
            ["Élise Chabot", "elise.chabot@acme.example", "agent"],
          ] as const
        ).map(([name, email, role]) => ({
          tenantId: tenant!.id,
          name,
          email,
          role,
          status: "active" as const,
        })),
      )
      .returning();

    const orgs = await db
      .insert(organizations)
      .values(
        (
          [
            ["Nordfil SAS", ["nordfil.example"]],
            ["Vertigo Media", ["vertigo-media.example"]],
            ["Groupe Halbran", ["halbran.example"]],
            ["Studio Kaori", ["studiokaori.example"]],
            ["Delta Logistique", ["delta-logistique.example"]],
          ] as [string, string[]][]
        ).map(([name, emailDomains]) => ({ tenantId: tenant!.id, name, emailDomains })),
      )
      .returning();

    const nordfil = orgs.find((o) => o.name === "Nordfil SAS")!;
    const marie = agents.find((a) => a.name === "Marie Dupont")!;

    const [julien] = await db
      .insert(contacts)
      .values({
        tenantId: tenant.id,
        name: "Julien Lambert",
        email: "julien.lambert@nordfil.example",
        locale: "en",
      })
      .returning();
    await db.insert(contactOrganizations).values({
      tenantId: tenant.id,
      contactId: julien!.id,
      organizationId: nordfil.id,
    });

    // Reference ticket #4821 — SLA breached, so the red badge has something to show.
    const createdAt = new Date(Date.now() - 26 * HOUR);
    const [ticket] = await db
      .insert(tickets)
      .values({
        tenantId: tenant.id,
        number: 4821,
        subject: "Cannot export invoices to PDF",
        status: "open",
        priority: "high",
        channel: "email",
        type: "Incident",
        requesterId: julien!.id,
        organizationId: nordfil.id,
        assigneeId: marie.id,
        tags: ["export", "billing"],
        createdAt,
        firstReplyDueAt: new Date(createdAt.getTime() + 4 * HOUR),
        resolveDueAt: new Date(createdAt.getTime() + 24 * HOUR),
      })
      .returning();

    await db.insert(ticketMessages).values([
      {
        tenantId: tenant.id,
        ticketId: ticket!.id,
        kind: "public_reply",
        authorType: "contact",
        authorId: julien!.id,
        source: "email",
        bodyText:
          "Hello, since Tuesday's update the “Export to PDF” button on the Invoices " +
          "screen no longer responds. Nothing happens on click, and the browser console " +
          "shows a 500 error. This is blocking our monthly close, due on Friday.",
        createdAt,
      },
      {
        tenantId: tenant.id,
        ticketId: ticket!.id,
        kind: "internal_note",
        authorType: "agent",
        authorId: marie.id,
        bodyText:
          "Reproduced on staging: the PDF generator saturates beyond 50 lines. JIRA " +
          "ticket OPS-2214 opened. Do not promise a fix before Thursday's deployment.",
        createdAt: new Date(createdAt.getTime() + 2 * HOUR),
      },
    ]);
  }

  await ensureMailbox(tenant.id);
  await resetAndInstallDefaults(tenant.id);
  await ensureMemberships(tenant.id);
  await ensureCsat(tenant.id);
  await ensureNamedContacts(tenant.id);
  await ensureInvitedAgents(tenant.id);
  await ensureLastSeen(tenant.id);
  await ensureDemoRequests(tenant.id);
  await ensureRejectedEmails(tenant.id);
  const historyCount = await installDemoHistory(tenant.id);
  if (historyCount > 0) console.log(`OK — ${historyCount} history tickets (90 days) generated.`);
  await ensureKb(tenant.id);
  await ensureOrgAdmin(tenant.id);

  console.log(
    `OK — tenant ${tenant.slug}: defaults (SLA, macros, rules, teams, fields) + KB installed.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
