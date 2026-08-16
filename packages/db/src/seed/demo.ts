/**
 * Seed « demo » — jeu de données de démonstration FIGÉ.
 * Référence : specs/03-contraintes-implementation.md § 4.
 *
 * Le site vitrine et la documentation partagent des captures prises sur ce jeu ;
 * toute modification ici invalide les figures. Ne pas éditer sans recapturer.
 *
 * Usage : pnpm db:seed (DATABASE_URL doit pointer sur une base migrée).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import {
  automationRules,
  contactOrganizations,
  contacts,
  macros,
  mailboxes,
  organizations,
  slaPolicies,
  tenants,
  ticketMessages,
  tickets,
  users,
} from "../schema";

/** Boîte de réception démo — idempotent, rejouable sur une base déjà seedée. */
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

/** Politique SLA par défaut + règles de démo (ST-05/ST-07) — idempotent par nom. */
async function ensureProductivity(tenantId: string) {
  const [existingPolicy] = await db
    .select({ id: slaPolicies.id })
    .from(slaPolicies)
    .where(and(eq(slaPolicies.tenantId, tenantId), eq(slaPolicies.name, "Standard")));
  if (!existingPolicy) {
    await db.insert(slaPolicies).values({
      tenantId,
      name: "Standard",
      position: 0,
      isDefault: true,
      conditions: [],
      targets: {
        urgent: { firstReplyMin: 60, nextReplyMin: 120, resolveMin: 480 },
        high: { firstReplyMin: 240, nextReplyMin: 480, resolveMin: 1440 },
        normal: { firstReplyMin: 480, nextReplyMin: 960, resolveMin: 4320 },
        low: { firstReplyMin: 1440, nextReplyMin: 2880, resolveMin: 7200 },
      },
    });
  }

  const demoRules = [
    {
      kind: "trigger" as const,
      name: "Urgence détectée dans le sujet",
      position: 0,
      conditionsAll: [
        { field: "event", operator: "is", value: "ticket.created" },
        { field: "subject", operator: "contains", value: "urgent" },
      ],
      actions: [
        { type: "set_priority", value: "urgent" },
        { type: "add_tags", value: ["urgence"] },
      ],
    },
    {
      kind: "trigger" as const,
      name: "Accusé de réception",
      position: 1,
      conditionsAll: [
        { field: "event", operator: "is", value: "ticket.created" },
        { field: "channel", operator: "is", value: "email" },
      ],
      actions: [
        {
          type: "email_contact",
          value:
            "Bonjour {{contact.name}},\n\nNous avons bien reçu votre demande " +
            "« {{ticket.subject}} » (ticket #{{ticket.number}}). Un agent vous répondra " +
            "rapidement.\n\nAcme Support",
        },
      ],
    },
    {
      kind: "scheduled" as const,
      name: "Clôture automatique à 4 jours",
      position: 0,
      conditionsAll: [
        { field: "status", operator: "is", value: "resolved" },
        { field: "hours_since_updated", operator: "gte", value: 96 },
      ],
      actions: [{ type: "set_status", value: "closed" }],
    },
  ];

  for (const rule of demoRules) {
    const [existing] = await db
      .select({ id: automationRules.id })
      .from(automationRules)
      .where(and(eq(automationRules.tenantId, tenantId), eq(automationRules.name, rule.name)));
    if (!existing) {
      await db.insert(automationRules).values({ tenantId, active: true, ...rule });
    }
  }

  // CSAT activé par défaut sur le workspace de démo (ST-08).
  await db
    .update(tenants)
    .set({
      csatConfig: {
        enabled: true,
        question: "Comment évaluez-vous la réponse apportée à votre demande ?",
      },
    })
    .where(and(eq(tenants.id, tenantId), sql`${tenants.csatConfig} = '{}'::jsonb`));

  const [existingMacro] = await db
    .select({ id: macros.id })
    .from(macros)
    .where(and(eq(macros.tenantId, tenantId), eq(macros.name, "Demande de précisions")));
  if (!existingMacro) {
    await db.insert(macros).values({
      tenantId,
      name: "Demande de précisions",
      category: "Général",
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value:
            "Bonjour {{contact.name}},\n\nPour avancer sur votre demande (ticket " +
            "#{{ticket.number}}), pourriez-vous préciser les étapes exactes qui mènent " +
            "au problème, et joindre une capture d'écran si possible ?\n\nMerci !",
        },
        { type: "set_status", value: "waiting" },
      ],
    });
  }
}

const HOUR = 3600 * 1000;

async function seed() {
  console.log("Seed demo : workspace Acme Support…");

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: "acme",
      name: "Acme Support",
      branding: { accentColor: "#0B5F46" },
      plan: "pro",
    })
    .onConflictDoNothing({ target: tenants.slug })
    .returning();

  if (!tenant) {
    const [existing] = await db.select().from(tenants).where(eq(tenants.slug, "acme"));
    if (existing) {
      await ensureMailbox(existing.id);
      await ensureProductivity(existing.id);
    }
    console.log(
      "Le tenant acme existe déjà — seed ignoré (jeu figé), boîte email + SLA + règles vérifiés.",
    );
    return;
  }

  await ensureMailbox(tenant.id);
  await ensureProductivity(tenant.id);

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
        tenantId: tenant.id,
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
      ).map(([name, emailDomains]) => ({ tenantId: tenant.id, name, emailDomains })),
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
      locale: "fr",
    })
    .returning();

  await db.insert(contactOrganizations).values({
    tenantId: tenant.id,
    contactId: julien!.id,
    organizationId: nordfil.id,
  });

  // Ticket de référence #4821 — SLA dépassé (les captures montrent le badge rouge).
  const createdAt = new Date(Date.now() - 26 * HOUR);
  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId: tenant.id,
      number: 4821,
      subject: "Impossible d'exporter les factures en PDF",
      status: "open",
      priority: "high",
      channel: "email",
      requesterId: julien!.id,
      organizationId: nordfil.id,
      assigneeId: marie.id,
      tags: ["export", "facturation"],
      createdAt,
      firstReplyDueAt: new Date(createdAt.getTime() + 4 * HOUR), // dépassé
      resolveDueAt: new Date(createdAt.getTime() + 24 * HOUR), // dépassé
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
        "Bonjour, depuis la mise à jour de vendredi, le bouton « Exporter en PDF » " +
        "de l'écran Factures ne répond plus. Nous devons envoyer nos factures " +
        "clients avant la fin du mois. Merci de votre aide.",
      createdAt,
    },
    {
      tenantId: tenant.id,
      ticketId: ticket!.id,
      kind: "internal_note",
      authorType: "agent",
      authorId: marie.id,
      bodyText:
        "Reproduit en préprod. Piste : le worker d'export n'a pas redémarré après " +
        "le déploiement. À escalader si pas de correctif avant midi.",
      createdAt: new Date(createdAt.getTime() + 2 * HOUR),
    },
  ]);

  console.log(
    `OK — tenant ${tenant.slug}, ${agents.length} agents, ${orgs.length} organisations, ticket #4821.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
