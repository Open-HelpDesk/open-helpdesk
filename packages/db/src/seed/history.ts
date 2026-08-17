/**
 * Historique de démonstration — 90 jours d'activité pour le workspace Acme Support.
 *
 * Sans lui, les Rapports (AG-09), la carte de chaleur et la conformité SLA sont vides :
 * le design montre un workspace actif, pas un workspace neuf. Les tickets sont numérotés
 * SOUS #4821 (le ticket de référence des captures reste le plus récent).
 *
 * Entièrement déterministe (générateur congruentiel à graine fixe) : deux exécutions
 * produisent exactement le même jeu de données, condition pour que la démo reste figée.
 */
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../client";
import { contacts, csatResponses, ticketMessages, tickets, users } from "../schema/app";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** Premier numéro de l'historique — #4821 reste le ticket le plus récent. */
const FIRST_NUMBER = 4300;
const LAST_NUMBER = 4816;

/** Générateur congruentiel linéaire (Numerical Recipes) — reproductible. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return {
    /** Flottant dans [0, 1). */
    next(): number {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    int(maxExclusive: number): number {
      return Math.floor(this.next() * maxExclusive);
    },
    /** Tire une entrée selon des poids entiers. */
    weighted<T>(entries: [T, number][]): T {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = this.next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
    pick<T>(items: T[]): T {
      return items[this.int(items.length)]!;
    },
  };
}

const SUBJECTS = [
  "Export PDF des factures illisible",
  "Impossible de réinitialiser mon mot de passe",
  "Ajout d'un utilisateur sur le compte",
  "Facture en double sur le mois de juin",
  "Erreur 500 à l'ouverture du tableau de bord",
  "Demande de devis pour 20 licences",
  "Le filtre par date ne renvoie rien",
  "Synchronisation interrompue depuis hier",
  "Question sur la politique de rétention",
  "Changement d'adresse de facturation",
  "Import CSV rejeté sans message d'erreur",
  "Notifications non reçues depuis la mise à jour",
  "Demande d'accès à l'API",
  "Lenteur sur la liste des commandes",
  "Suppression d'un compte collaborateur",
  "問題 avec l'affichage des accents dans l'export",
  "Relance sur le ticket précédent",
  "Panne du connecteur comptable",
  "Documentation manquante sur les webhooks",
  "Demande de rappel téléphonique",
];

const TYPES = ["Question", "Incident", "Demande", "Réclamation"];

const COMMENTS_GOOD = [
  "Réponse rapide et efficace, merci.",
  "Problème résolu du premier coup.",
  "Très bon suivi, je recommande.",
  null,
  null,
];
const COMMENTS_BAD = [
  "Trop de temps pour obtenir une réponse.",
  "Le problème est revenu deux jours après.",
  null,
];

/**
 * Crée l'historique s'il manque. Idempotent : on ne fait rien si des tickets de la
 * plage historique existent déjà.
 */
export async function installDemoHistory(tenantId: string): Promise<number> {
  const existing = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        eq(tickets.tenantId, tenantId),
        gte(tickets.number, FIRST_NUMBER),
        lt(tickets.number, LAST_NUMBER),
      ),
    );
  if (existing.length > 20) return 0;

  const agentRows = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  const agentIds = agentRows.filter((a) => a.status === "active" && a.role !== "viewer").map((a) => a.id);

  const contactRows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId));
  const contactIds = contactRows.map((c) => c.id);
  if (agentIds.length === 0 || contactIds.length === 0) return 0;

  const taken = new Set(existing.map(() => 0));
  const used = await db
    .select({ number: tickets.number })
    .from(tickets)
    .where(eq(tickets.tenantId, tenantId));
  for (const row of used) taken.add(row.number);

  const rnd = makeRandom(20260816);
  const now = Date.now();
  const newTickets: (typeof tickets.$inferInsert)[] = [];
  const pending: {
    number: number;
    contactId: string;
    subject: string;
    createdAt: Date;
    resolvedAt: Date | null;
    agentId: string;
  }[] = [];

  for (let number = FIRST_NUMBER; number <= LAST_NUMBER; number++) {
    if (taken.has(number)) continue;

    // Répartition sur 90 jours : les numéros croissants sont plus récents.
    const progress = (number - FIRST_NUMBER) / (LAST_NUMBER - FIRST_NUMBER);
    const daysAgo = Math.max(0, Math.round(90 - progress * 90 + (rnd.next() * 6 - 3)));

    // Heures ouvrées : 8 h → 18 h, creux à midi, très peu le week-end.
    const dayStart = new Date(now - daysAgo * DAY);
    dayStart.setHours(0, 0, 0, 0);
    const weekday = dayStart.getDay();
    if ((weekday === 0 || weekday === 6) && rnd.next() > 0.12) continue;

    const hour = rnd.weighted<number>([
      [8, 6], [9, 12], [10, 14], [11, 13], [12, 5], [13, 6],
      [14, 13], [15, 12], [16, 10], [17, 8], [18, 3],
    ]);
    const createdAt = new Date(dayStart.getTime() + hour * HOUR + rnd.int(60) * 60 * 1000);
    if (createdAt.getTime() > now) continue;

    const agentId = rnd.pick(agentIds);
    const contactId = rnd.pick(contactIds);
    const priority = rnd.weighted([
      ["low", 12],
      ["normal", 58],
      ["high", 22],
      ["urgent", 8],
    ] as [("low" | "normal" | "high" | "urgent"), number][]);
    const channel = rnd.weighted([
      ["email", 55],
      ["portal", 25],
      ["widget", 13],
      ["api", 7],
    ] as [("email" | "portal" | "widget" | "api"), number][]);

    // Cibles SLA selon la priorité (cohérentes avec la politique par défaut).
    const firstReplyTargetH = priority === "urgent" ? 0.5 : priority === "high" ? 2 : 4;
    const resolveTargetH = priority === "urgent" ? 4 : priority === "high" ? 8 : 48;

    // ~92 % des réponses tiennent la cible ; les autres la dépassent nettement.
    const onTime = rnd.next() < 0.92;
    const firstReplyH = onTime
      ? firstReplyTargetH * (0.15 + rnd.next() * 0.7)
      : firstReplyTargetH * (1.2 + rnd.next() * 2);
    const firstRepliedAt = new Date(createdAt.getTime() + firstReplyH * HOUR);

    // Un ticket ancien est presque toujours clos ; un ticket récent peut être ouvert.
    const status = rnd.weighted(
      daysAgo > 21
        ? ([["closed", 78], ["resolved", 20], ["on_hold", 2]] as [
            "closed" | "resolved" | "on_hold",
            number,
          ][])
        : daysAgo > 6
          ? ([["closed", 34], ["resolved", 40], ["open", 16], ["waiting", 10]] as [
              "closed" | "resolved" | "open" | "waiting",
              number,
            ][])
          : ([["resolved", 32], ["open", 30], ["waiting", 20], ["new", 18]] as [
              "resolved" | "open" | "waiting" | "new",
              number,
            ][]),
    );

    const resolvedAt =
      status === "resolved" || status === "closed"
        ? new Date(
            createdAt.getTime() +
              resolveTargetH * HOUR * (onTime ? 0.2 + rnd.next() * 0.7 : 1.1 + rnd.next() * 1.5),
          )
        : null;
    if (resolvedAt && resolvedAt.getTime() > now) continue;
    const closedAt =
      status === "closed" && resolvedAt ? new Date(resolvedAt.getTime() + 4 * DAY) : null;

    const replied = status !== "new";
    const subject = rnd.pick(SUBJECTS);

    newTickets.push({
      tenantId,
      number,
      subject,
      status,
      priority,
      channel,
      type: rnd.pick(TYPES),
      requesterId: contactId,
      assigneeId: status === "new" ? null : agentId,
      createdAt,
      updatedAt: closedAt ?? resolvedAt ?? firstRepliedAt,
      firstRepliedAt: replied ? firstRepliedAt : null,
      firstReplyDueAt: new Date(createdAt.getTime() + firstReplyTargetH * HOUR),
      resolveDueAt: new Date(createdAt.getTime() + resolveTargetH * HOUR),
      resolvedAt,
      closedAt: closedAt && closedAt.getTime() <= now ? closedAt : null,
    });
    pending.push({ number, contactId, subject, createdAt, resolvedAt, agentId });
  }

  if (newTickets.length === 0) return 0;

  // Insertion par lots (un INSERT de 500 lignes dépasse les limites de paramètres).
  const inserted: { id: string; number: number }[] = [];
  for (let i = 0; i < newTickets.length; i += 60) {
    const batch = await db
      .insert(tickets)
      .values(newTickets.slice(i, i + 60))
      .onConflictDoNothing()
      .returning({ id: tickets.id, number: tickets.number });
    inserted.push(...batch);
  }
  const idByNumber = new Map(inserted.map((t) => [t.number, t.id]));

  // Un message d'ouverture par ticket : le détail ne doit jamais être vide.
  const messages: (typeof ticketMessages.$inferInsert)[] = [];
  const responses: (typeof csatResponses.$inferInsert)[] = [];
  for (const t of pending) {
    const ticketId = idByNumber.get(t.number);
    if (!ticketId) continue;
    messages.push({
      tenantId,
      ticketId,
      kind: "public_reply",
      authorType: "contact",
      authorId: t.contactId,
      source: "email",
      bodyText: `${t.subject} — pouvez-vous regarder ? Merci d'avance.`,
      createdAt: t.createdAt,
    });

    // Enquête CSAT sur ~38 % des tickets résolus, 88 % de satisfaits.
    if (t.resolvedAt && rnd.next() < 0.38) {
      const good = rnd.next() < 0.88;
      const answeredAt = new Date(t.resolvedAt.getTime() + (2 + rnd.next() * 20) * HOUR);
      if (answeredAt.getTime() <= now) {
        responses.push({
          tenantId,
          ticketId,
          agentId: t.agentId,
          score: good ? "good" : "bad",
          comment: good ? rnd.pick(COMMENTS_GOOD) : rnd.pick(COMMENTS_BAD),
          createdAt: answeredAt,
        });
      }
    }
  }

  for (let i = 0; i < messages.length; i += 60) {
    await db.insert(ticketMessages).values(messages.slice(i, i + 60));
  }
  for (let i = 0; i < responses.length; i += 60) {
    await db.insert(csatResponses).values(responses.slice(i, i + 60));
  }

  return inserted.length;
}
