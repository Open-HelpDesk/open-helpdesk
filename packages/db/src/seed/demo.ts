/**
 * Seed « demo » — jeu de données de démonstration FIGÉ (specs/03 § 4) + défauts design.
 * Workspace « Acme Support » (slug acme, accent #0B5F46), ticket de référence #4821.
 * Les défauts produit (macros, SLA, règles, équipes, champs) viennent de defaults.ts —
 * les mêmes que pour tout nouveau workspace.
 *
 * Usage : pnpm db:seed (rejouable — met à niveau une base déjà seedée).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../client";
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
  organizations,
  slaPolicies,
  teamMembers,
  teams,
  tenants,
  ticketFields,
  ticketForms,
  ticketMessages,
  tickets,
  users,
} from "../schema";
import { installDefaults } from "./defaults";

const HOUR = 3600 * 1000;

/* ---------- Boîte email ---------- */
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

/* ---------- Défauts design : purge de l'ancien seed ad hoc puis installation ---------- */
async function resetAndInstallDefaults(tenantId: string) {
  const [marker] = await db
    .select({ id: slaPolicies.id })
    .from(slaPolicies)
    .where(and(eq(slaPolicies.tenantId, tenantId), eq(slaPolicies.name, "Clients Premium")));
  if (marker) return; // défauts design déjà en place

  // Détacher les tickets des anciennes politiques/équipes/formulaires avant purge.
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

  await installDefaults(tenantId);
}

/* ---------- Appartenances aux équipes (design ST-02) ---------- */
async function ensureMemberships(tenantId: string) {
  const agentRows = await db.select().from(users).where(eq(users.tenantId, tenantId));
  const teamRows = await db.select().from(teams).where(eq(teams.tenantId, tenantId));
  const agent = (name: string) => agentRows.find((a) => a.name === name)?.id;
  const team = (name: string) => teamRows.find((t) => t.name === name)?.id;

  const wanted: Array<[string, string]> = [
    ["Marie Dupont", "Support N1"],
    ["Marie Dupont", "Escalade"],
    ["Thomas Roux", "Support N1"],
    ["Claire Bonnet", "Commercial"],
    ["Sofiane Amrani", "Support N1"],
    ["Sofiane Amrani", "Produit"],
    ["Élise Chabot", "Escalade"],
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
async function ensureCsat(tenantId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const config = (tenant?.csatConfig ?? {}) as { enabled?: boolean };
  if (config.enabled === undefined) {
    await db
      .update(tenants)
      .set({
        csatConfig: {
          enabled: true,
          question: "Comment évaluez-vous la réponse apportée à votre demande ?",
        },
      })
      .where(eq(tenants.id, tenantId));
  }
}

/* ---------- Base de connaissances (contenu du design, PT-01/PT-02/AG-10) ---------- */
async function ensureKb(tenantId: string) {
  const [migrated] = await db
    .select({ id: kbCategories.id })
    .from(kbCategories)
    .where(and(eq(kbCategories.tenantId, tenantId), eq(kbCategories.slug, "demarrage")));
  if (migrated) return;

  // Purge de l'ancien contenu ad hoc.
  await db.delete(kbArticles).where(eq(kbArticles.tenantId, tenantId));
  await db.delete(kbCategories).where(eq(kbCategories.tenantId, tenantId));

  const topCategories = [
    ["Démarrage", "demarrage", "◷", "Créer votre compte, inviter votre équipe et configurer vos premiers accès."],
    ["Facturation", "facturation", "€", "Factures, moyens de paiement, changements de plan et remboursements."],
    ["Utilisation quotidienne", "utilisation-quotidienne", "◈", "Les gestes du quotidien, des raccourcis aux vues personnalisées."],
    ["Intégrations", "integrations", "⇄", "Connecter vos outils : Slack, Jira, Salesforce et l'API publique."],
    ["Sécurité & conformité", "securite-conformite", "⛨", "Authentification, RGPD, hébergement des données et journaux."],
    ["Dépannage", "depannage", "⚙", "Résoudre les erreurs les plus fréquentes en quelques étapes."],
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

  // Sections de la catégorie Facturation (accordéons PT-02, arbre AG-10).
  const sections = [
    ["Factures et paiements", "factures-et-paiements"],
    ["Changer de plan", "changer-de-plan"],
    ["Remboursements", "remboursements"],
  ] as const;
  position = 0;
  for (const [name, slug] of sections) {
    const [row] = await db
      .insert(kbCategories)
      .values({
        tenantId,
        parentId: catIds.get("facturation"),
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
      cat: "factures-et-paiements",
      title: "Comment télécharger vos factures",
      slug: "comment-telecharger-vos-factures",
      views: 4128,
      up: 96,
      author: "Claire Bonnet",
      body:
        "Vos factures sont disponibles à tout moment depuis votre espace client. Elles " +
        "sont générées le premier jour de chaque mois pour la période écoulée, et " +
        "restent accessibles pendant dix ans.\n\n" +
        "## Depuis l'espace client\n\n" +
        "Ouvrez **Paramètres → Abonnement**, puis faites défiler jusqu'à la section " +
        "« Historique des factures ». Chaque ligne propose un téléchargement au format PDF.\n\n" +
        "> Seuls les utilisateurs avec le rôle Propriétaire ont accès à la section facturation.\n\n" +
        "## Recevoir les factures par email\n\n" +
        "Vous pouvez ajouter jusqu'à trois adresses de facturation qui recevront " +
        "automatiquement chaque facture émise, depuis **Abonnement → Adresse de facturation**.\n\n" +
        "```Format du nom de fichier\nACME-2026-08-FR12345.pdf\n```",
    },
    {
      cat: "factures-et-paiements",
      title: "Ajouter un moyen de paiement",
      slug: "ajouter-un-moyen-de-paiement",
      views: 1844,
      up: 52,
      author: "Thomas Roux",
      body:
        "Carte bancaire, prélèvement SEPA ou virement : comment enregistrer un moyen de " +
        "paiement.\n\n## Carte bancaire\n\nDepuis **Abonnement → Moyen de paiement**, " +
        "cliquez sur « Ajouter une carte ». La carte est vérifiée par une empreinte de " +
        "0 €.\n\n## Prélèvement SEPA\n\nRenseignez l'IBAN du compte à débiter ; un mandat " +
        "vous est envoyé pour signature électronique.",
    },
    {
      cat: "factures-et-paiements",
      title: "Que faire en cas d'échec de paiement",
      slug: "echec-de-paiement",
      views: 1205,
      up: 44,
      author: "Marie Dupont",
      body:
        "Les relances automatiques et la marche à suivre pour régulariser.\n\n" +
        "## Le calendrier des relances\n\nTrois tentatives sont effectuées : le jour de " +
        "l'échéance, à J+7 et à J+14. Passé ce délai, le compte est suspendu jusqu'à " +
        "régularisation.\n\n> Vos données restent conservées pendant toute la période de " +
        "suspension.\n\n## Régulariser\n\nMettez à jour votre moyen de paiement depuis " +
        "**Abonnement → Moyen de paiement** : la facture en attente est représentée " +
        "immédiatement.",
    },
    {
      cat: "changer-de-plan",
      title: "Passer d'un plan mensuel à annuel",
      slug: "passer-plan-mensuel-annuel",
      views: 2901,
      up: 71,
      author: "Claire Bonnet",
      body:
        "Économisez 20 % en basculant sur la facturation annuelle.\n\n## Comment basculer\n\n" +
        "Depuis **Abonnement → Changer de plan**, activez la bascule « Annuel ». Le " +
        "montant restant de votre période mensuelle en cours est déduit au prorata.",
    },
    {
      cat: "changer-de-plan",
      title: "Ajouter ou retirer des sièges",
      slug: "ajouter-retirer-sieges",
      views: 640,
      up: 22,
      author: "Claire Bonnet",
      body:
        "La facturation est ajustée au prorata dès la modification.\n\n## Ajouter des " +
        "sièges\n\nDepuis **Abonnement → Gérer les sièges**, augmentez le nombre de " +
        "sièges : les nouveaux agents peuvent être invités immédiatement.\n\n## Retirer " +
        "des sièges\n\nDésactivez d'abord les agents concernés ; le retrait prend effet " +
        "à la prochaine échéance.",
    },
    {
      cat: "remboursements",
      title: "Demander un remboursement",
      slug: "demander-un-remboursement",
      views: 983,
      up: 18,
      author: "Claire Bonnet",
      body:
        "Conditions et délais de traitement des demandes de remboursement.\n\n## " +
        "Conditions\n\nLes remboursements sont acceptés dans les 30 jours suivant la " +
        "facturation, sur demande motivée.\n\n## Délais\n\nUne fois accepté, le montant " +
        "est recrédité sous 5 à 10 jours ouvrés sur le moyen de paiement d'origine.",
    },
    {
      cat: "remboursements",
      title: "TVA et facturation intracommunautaire",
      slug: "tva-facturation-intracommunautaire",
      views: 742,
      up: 11,
      author: "Sofiane Amrani",
      body:
        "Numéro de TVA, autoliquidation et mentions obligatoires.\n\n## Renseigner votre " +
        "numéro de TVA\n\nDepuis **Abonnement → Adresse de facturation**, ajoutez votre " +
        "numéro de TVA intracommunautaire : il apparaîtra sur toutes les factures " +
        "suivantes.\n\n> Pour les clients établis hors de France dans l'UE, " +
        "l'autoliquidation s'applique dès que le numéro est validé.",
    },
    {
      cat: "facturation",
      title: "Comprendre la facturation au prorata",
      slug: "comprendre-facturation-prorata",
      views: 0,
      up: 0,
      author: "Marie Dupont",
      draft: true,
      body:
        "Brouillon — expliquer le calcul au prorata lors des changements de plan et de " +
        "sièges en cours de période.",
    },
    {
      cat: "facturation",
      title: "Historique des factures : export CSV",
      slug: "historique-factures-export-csv",
      views: 0,
      up: 0,
      author: "Thomas Roux",
      draft: true,
      body: "Brouillon — documenter l'export CSV de l'historique des factures.",
    },
    {
      cat: "demarrage",
      title: "Réinitialiser votre mot de passe",
      slug: "reinitialiser-votre-mot-de-passe",
      views: 3902,
      up: 64,
      author: "Marie Dupont",
      body:
        "## Depuis l'écran de connexion\n\nCliquez sur « Mot de passe oublié ? » et " +
        "saisissez votre email : un lien de réinitialisation valable 15 minutes vous est " +
        "envoyé.\n\n> Si votre organisation utilise la connexion par compte d'entreprise " +
        "(SSO), la réinitialisation se fait chez votre fournisseur d'identité.",
    },
    {
      cat: "demarrage",
      title: "Connecter votre boîte email",
      slug: "connecter-votre-boite-email",
      views: 2210,
      up: 41,
      author: "Thomas Roux",
      body:
        "## Le transfert automatique\n\nTransférez votre adresse de support vers " +
        "l'adresse fournie : chaque email devient un ticket, et les réponses de vos " +
        "agents partent de votre propre adresse.\n\n## Vérifier la configuration\n\n" +
        "Envoyez-vous un email de test : il doit apparaître dans l'inbox en moins " +
        "d'une minute.",
    },
    {
      cat: "utilisation-quotidienne",
      title: "Raccourcis clavier de l'inbox",
      slug: "raccourcis-clavier-inbox",
      views: 512,
      up: 19,
      author: "Sofiane Amrani",
      body:
        "## Navigation\n\n« j » et « k » pour se déplacer, « ↵ » pour ouvrir, « x » " +
        "pour sélectionner. La palette « ⌘K » cherche tickets, contacts et articles.",
    },
    {
      cat: "integrations",
      title: "Créer une clé API",
      slug: "creer-une-cle-api",
      views: 388,
      up: 9,
      author: "Sofiane Amrani",
      body:
        "## Depuis les paramètres\n\nOuvrez **Paramètres → API & webhooks** et créez une " +
        "clé scoppée. La clé complète ne s'affiche qu'une seule fois : copiez-la " +
        "immédiatement.\n\n> Préférez une clé « Lecture seule » pour les intégrations de " +
        "reporting.",
    },
    {
      cat: "securite-conformite",
      title: "Exercer un droit RGPD (suppression)",
      slug: "exercer-droit-rgpd",
      views: 154,
      up: 6,
      author: "Marie Dupont",
      body:
        "## Suppression d'un contact\n\nDepuis la fiche contact, l'action « Supprimer " +
        "(RGPD) » anonymise les tickets et supprime les données personnelles. " +
        "L'opération est journalisée dans l'audit log.",
    },
    {
      cat: "depannage",
      title: "Les emails n'arrivent plus dans l'inbox",
      slug: "emails-narrivent-plus",
      views: 890,
      up: 31,
      author: "Thomas Roux",
      body:
        "## Vérifier le transfert\n\nDans **Paramètres → Canal email**, l'adresse doit " +
        "être « Vérifiée ». Si elle est en échec, renvoyez un email de test après avoir " +
        "contrôlé la redirection chez votre fournisseur.\n\n> Le journal des emails " +
        "rejetés indique la raison exacte de chaque rejet (spam, boucle, expéditeur " +
        "bloqué).",
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

/* ---------- Seed principal ---------- */
async function seed() {
  console.log("Seed demo : workspace Acme Support…");

  let [tenant] = await db
    .insert(tenants)
    .values({
      slug: "acme",
      name: "Acme Support",
      branding: { accentColor: "#0B5F46" },
      plan: "pro",
    })
    .onConflictDoNothing({ target: tenants.slug })
    .returning();

  const isFresh = Boolean(tenant);
  if (!tenant) {
    [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "acme"));
  }
  if (!tenant) throw new Error("Impossible de créer ou retrouver le tenant acme");

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
        type: "Incident",
        requesterId: julien!.id,
        organizationId: nordfil.id,
        assigneeId: marie.id,
        tags: ["export", "facturation"],
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
          "Bonjour, depuis la mise à jour de mardi, le bouton « Exporter en PDF » de " +
          "l'écran Factures ne répond plus. Rien ne se passe au clic, et la console du " +
          "navigateur affiche une erreur 500. C'est bloquant pour notre clôture " +
          "mensuelle, prévue vendredi.",
        createdAt,
      },
      {
        tenantId: tenant.id,
        ticketId: ticket!.id,
        kind: "internal_note",
        authorType: "agent",
        authorId: marie.id,
        bodyText:
          "Reproduit en préproduction : le générateur PDF sature au-delà de 50 lignes. " +
          "Ticket JIRA OPS-2214 ouvert. Ne pas promettre de correctif avant le " +
          "déploiement de jeudi.",
        createdAt: new Date(createdAt.getTime() + 2 * HOUR),
      },
    ]);
  }

  await ensureMailbox(tenant.id);
  await resetAndInstallDefaults(tenant.id);
  await ensureMemberships(tenant.id);
  await ensureCsat(tenant.id);
  await ensureKb(tenant.id);

  console.log(
    `OK — tenant ${tenant.slug} : défauts design (SLA, macros, règles, équipes, champs) + KB installés.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
