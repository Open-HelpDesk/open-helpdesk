/**
 * Seed « demo » — jeu de données de démonstration FIGÉ.
 * Référence : specs/03-contraintes-implementation.md § 4.
 *
 * Le site vitrine et la documentation partagent des captures prises sur ce jeu ;
 * toute modification ici invalide les figures. Ne pas éditer sans recapturer.
 *
 * Usage : pnpm db:seed (DATABASE_URL doit pointer sur une base migrée).
 */
import { db } from "../client";
import {
  contactOrganizations,
  contacts,
  organizations,
  tenants,
  ticketMessages,
  tickets,
  users,
} from "../schema";

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
    console.log("Le tenant acme existe déjà — seed ignoré (jeu figé, pas de mise à jour).");
    return;
  }

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
