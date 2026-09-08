/**
 * Gouvernance : ce que l'espace autorise, et le journal de chaque appel.
 * L'assistant propose, un humain publie — ce fichier est l'endroit où
 * « propose » est permis ou refusé, et retenu.
 *
 * Même forme que `@openincident/ai/governance` (exigence ISO, spec 18) :
 * `capabilityAllowed`, `runCapability`, `ask`. Ce qui s'y ajoute vient du
 * support client et de rien d'autre : le coût par appel, le décompte des
 * rédactions, et le quota de déflexion.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  aiCalls,
  aiCredits,
  aiDeflections,
  aiSettings,
  db,
  tickets,
  type AiCapability,
} from "@openhelpdesk/db";
import {
  byoProvider,
  chatComplete,
  embed,
  instanceProvider,
  type ChatMessage,
  type Completion,
  type ProviderConfig,
} from "./provider";
import { redact } from "./redact";

export const AI_CAPABILITIES: AiCapability[] = [
  "triage",
  "summary",
  "reply_draft",
  "rewrite",
  "kb_article",
  "macro_suggest",
  "deflect",
  "auto_reply",
  "kb_search",
];

/** Les capacités qui parlent au client final : les seules soumises au quota. */
export const CUSTOMER_FACING: readonly AiCapability[] = ["deflect", "auto_reply"];

export type AiSettingsView = {
  enabled: boolean;
  capabilities: Partial<Record<AiCapability, boolean>>;
  sources: { kb: boolean; macros: boolean; resolvedTickets: boolean; internalNotes: boolean };
  deflectionLocales: string[];
  deflectionThreshold: number;
  byo: { endpoint: string; model: string } | null;
};

export const DEFAULT_AI_SETTINGS: AiSettingsView = {
  enabled: true,
  capabilities: {},
  sources: { kb: true, macros: true, resolvedTickets: true, internalNotes: false },
  /* Vide : la déflexion est fermée jusqu'à ce que l'espace choisisse ses
     langues, parce qu'on ne sait mesurer la qualité que dans certaines
     (spec 18 § 8.1). Un défaut « toutes les langues » serait une promesse
     qu'aucun banc ne soutient. */
  deflectionLocales: [],
  deflectionThreshold: 70,
  byo: null,
};

export async function getAiSettings(tenantId: string): Promise<AiSettingsView> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.tenantId, tenantId));
  if (!row) return DEFAULT_AI_SETTINGS;
  return {
    enabled: row.enabled,
    capabilities: row.capabilities,
    sources: row.sources,
    deflectionLocales: row.deflectionLocales,
    deflectionThreshold: row.deflectionThreshold,
    byo:
      row.byoEndpoint && row.byoModel
        ? { endpoint: row.byoEndpoint, model: row.byoModel }
        : null,
  };
}

/**
 * Le fournisseur pour cet espace : le sien s'il en a apporté un, sinon celui
 * de l'instance. `decryptSecret` est injecté pour que ce paquet n'ait pas à
 * connaître la couche de chiffrement du produit.
 */
export async function providerFor(
  tenantId: string,
  decryptSecret: (stored: string) => string | null,
): Promise<ProviderConfig | null> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.tenantId, tenantId));
  if (row?.byoEndpoint && row.byoModel) {
    return byoProvider({
      endpoint: row.byoEndpoint,
      model: row.byoModel,
      secret: row.byoSecret ? decryptSecret(row.byoSecret) : null,
      embedModel: process.env.AI_EMBED_MODEL ?? null,
    });
  }
  return instanceProvider();
}

export type Allowance =
  | { ok: true }
  | {
      ok: false;
      reason: "unconfigured" | "disabled" | "capability_off" | "locale_closed" | "quota_reached";
    };

/**
 * Si une capacité peut tourner maintenant : instance ou modèle configuré,
 * espace allumé, capacité allumée — et, face au client, la langue ouverte et
 * le quota non atteint.
 *
 * L'ordre des refus n'est pas indifférent : on ne dit pas « quota atteint » à
 * quelqu'un dont la capacité est éteinte, sinon il achète des crédits pour
 * rien.
 */
export async function capabilityAllowed(
  tenantId: string,
  cap: AiCapability,
  opts: { locale?: string | null; provider?: ProviderConfig | null; quota?: number } = {},
): Promise<Allowance> {
  const provider = opts.provider ?? instanceProvider();
  if (!provider) return { ok: false, reason: "unconfigured" };
  const s = await getAiSettings(tenantId);
  if (!s.enabled) return { ok: false, reason: "disabled" };
  if (s.capabilities[cap] === false) return { ok: false, reason: "capability_off" };

  if (CUSTOMER_FACING.includes(cap)) {
    if (opts.locale && !s.deflectionLocales.includes(opts.locale)) {
      return { ok: false, reason: "locale_closed" };
    }
    /* Un modèle apporté par le client n'a pas de quota : il paie son
       inférence, nous ne comptons pas ce que nous n'avons pas payé. */
    if (!provider.byo && opts.quota !== undefined) {
      const left = await deflectionsLeft(tenantId, opts.quota);
      if (left <= 0) return { ok: false, reason: "quota_reached" };
    }
  }
  return { ok: true };
}

/**
 * Ce qui reste ce mois-ci : le quota du palier, plus les crédits achetés,
 * moins ce qui a été servi.
 *
 * « Servi » compte le provisoire **et** le confirmé : décrémenter seulement au
 * confirmé donnerait trois jours de déflexion gratuite à chaque fin de quota
 * (spec 18 § 3.1). Le rendu, lui, ne compte pas — c'est tout l'intérêt de la
 * reprise à 72 h.
 */
export async function deflectionsLeft(tenantId: string, monthlyQuota: number): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [served] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiDeflections)
    .where(
      and(
        eq(aiDeflections.tenantId, tenantId),
        gte(aiDeflections.createdAt, startOfMonth),
        sql`${aiDeflections.status} <> 'returned'`,
      ),
    );

  const [bought] = await db
    .select({ n: sql<number>`coalesce(sum(${aiCredits.resolutions}), 0)::int` })
    .from(aiCredits)
    .where(eq(aiCredits.tenantId, tenantId));

  return monthlyQuota + (bought?.n ?? 0) - (served?.n ?? 0);
}

export type Actor = {
  kind: "agent" | "contact" | "system" | "api";
  userId: string | null;
  name: string;
};

/**
 * Exécute une capacité : l'appel est journalisé quoi qu'il arrive, avec son
 * coût, sa durée et ce que la rédaction a masqué.
 *
 * Le journal est écrit **avant** que le résultat serve à quoi que ce soit : la
 * facturation et la confiance reposent dessus, donc un brouillon qui existe
 * sans sa ligne de journal serait pire qu'un brouillon absent.
 */
export async function runCapability<T>(
  tenantId: string,
  cap: AiCapability | "embed",
  actor: Actor,
  ticketId: string | null,
  work: () => Promise<{
    result: T;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
    redactions?: Record<string, number>;
    /** Un refus faute de source n'est pas une panne : il se journalise à part. */
    refused?: boolean;
  }>,
): Promise<T> {
  const started = Date.now();
  try {
    const out = await work();
    await db
      .insert(aiCalls)
      .values({
        tenantId,
        capability: cap,
        provider: out.provider,
        model: out.model,
        actorKind: actor.kind,
        actorUserId: actor.userId,
        actorName: actor.name,
        ticketId,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        costMicros: out.costMicros,
        durationMs: Date.now() - started,
        status: out.refused ? "refused" : "ok",
        redactions: out.redactions ?? {},
      })
      .catch(() => {});
    return out.result;
  } catch (err) {
    await db
      .insert(aiCalls)
      .values({
        tenantId,
        capability: cap,
        provider: "—",
        model: "—",
        actorKind: actor.kind,
        actorUserId: actor.userId,
        actorName: actor.name,
        ticketId,
        durationMs: Date.now() - started,
        status: "failed",
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      })
      .catch(() => {});
    throw err;
  }
}

/**
 * Les trois règles qui ne dépendent pas de l'appelant.
 *
 * Elles sont ici et pas dans chaque appel pour qu'aucun nouvel appel ne puisse
 * les oublier : c'est la seule garantie qui tienne quand le nombre de capacités
 * grandit.
 */
const RULES = [
  "Tu rédiges un brouillon, un humain le publie.",
  "N'invente jamais un fait absent du matériau fourni ; quand tu ne sais pas, dis-le.",
  "Garde la langue du matériau : un ticket en français reste en français.",
  "Pas de préambule, pas de formule d'introduction, pas de méta-commentaire.",
].join("\n");

/** Une complétion rédigée, avec les règles du produit et le décompte des masquages. */
export async function ask(
  provider: ProviderConfig,
  system: string,
  user: string,
  opts: {
    schema?: Record<string, unknown>;
    maxTokens?: number;
    /** Les adresses du fil, qui traversent la rédaction (voir redact.ts). */
    keep?: readonly string[];
  } = {},
): Promise<Completion & { redactions: Record<string, number> }> {
  const cleaned = redact(user, opts.keep ?? []);
  const messages: ChatMessage[] = [
    { role: "system", content: `${system}\n\n${RULES}` },
    { role: "user", content: cleaned.text },
  ];
  const completion = await chatComplete(provider, {
    messages,
    schema: opts.schema,
    maxTokens: opts.maxTokens,
  });
  return { ...completion, redactions: cleaned.counts };
}

/** Un embedding, journalisé comme le reste — c'est un appel payant. */
export async function embedText(
  provider: ProviderConfig,
  tenantId: string,
  actor: Actor,
  texts: string[],
): Promise<number[][]> {
  return runCapability(tenantId, "embed", actor, null, async () => {
    const cleaned = texts.map((t) => redact(t).text);
    const e = await embed(provider, cleaned);
    return {
      result: e.vectors,
      model: e.model,
      provider: provider.label,
      inputTokens: e.tokens,
      outputTokens: 0,
      costMicros: e.costMicros,
    };
  });
}

/** Les derniers appels, pour l'écran de gouvernance (ST-15). */
export async function recentAiCalls(tenantId: string, limit = 50) {
  const rows = await db
    .select({ call: aiCalls, ticketNumber: tickets.number })
    .from(aiCalls)
    .leftJoin(tickets, eq(tickets.id, aiCalls.ticketId))
    .where(eq(aiCalls.tenantId, tenantId))
    .orderBy(desc(aiCalls.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.call, ticketNumber: r.ticketNumber }));
}

/**
 * La consommation du mois, telle que l'écran l'affiche : ce qui a été servi,
 * ce qui est encore provisoire, et ce que tout cela nous a coûté.
 *
 * Le coût est la colonne que personne d'autre n'affiche, et c'est celle qui
 * permet de répondre à « combien nous coûte cet espace » sans exporter le
 * journal et le recalculer à la main.
 */
export async function monthlyUsage(tenantId: string): Promise<{
  deflections: { provisional: number; confirmed: number; returned: number };
  calls: number;
  costMicros: number;
}> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({ status: aiDeflections.status, n: sql<number>`count(*)::int` })
    .from(aiDeflections)
    .where(
      and(eq(aiDeflections.tenantId, tenantId), gte(aiDeflections.createdAt, startOfMonth)),
    )
    .groupBy(aiDeflections.status);

  const [totals] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      cost: sql<number>`coalesce(sum(${aiCalls.costMicros}), 0)::int`,
    })
    .from(aiCalls)
    .where(and(eq(aiCalls.tenantId, tenantId), gte(aiCalls.createdAt, startOfMonth)));

  const at = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return {
    deflections: {
      provisional: at("provisional"),
      confirmed: at("confirmed"),
      returned: at("returned"),
    },
    calls: totals?.calls ?? 0,
    costMicros: totals?.cost ?? 0,
  };
}

/**
 * Le balayage de tous les espaces qui ont une déflexion à trancher.
 *
 * Le worker appelle ceci et non `settleDeflections` par locataire : la liste
 * des espaces concernés se lit de la table, donc le worker n'a pas à savoir
 * combien il y a de locataires ni lesquels ont l'assistant. Un espace sans
 * déflexion en attente ne coûte rien : il n'apparaît pas dans le `distinct`.
 */
export async function sweepDeflections(): Promise<{
  tenants: number;
  confirmed: number;
  returned: number;
}> {
  const now = new Date();
  const rows = await db
    .selectDistinct({ tenantId: aiDeflections.tenantId })
    .from(aiDeflections)
    .where(
      and(
        eq(aiDeflections.status, "provisional"),
        sql`${aiDeflections.confirmAfter} <= ${now}`,
      ),
    );

  let confirmed = 0;
  let returned = 0;
  for (const row of rows) {
    const out = await settleDeflections(row.tenantId);
    confirmed += out.confirmed;
    returned += out.returned;
  }
  return { tenants: rows.length, confirmed, returned };
}

/**
 * La reprise à 72 h : une déflexion dont la fenêtre est passée sans qu'un
 * ticket arrive devient confirmée ; celle qu'un ticket a suivie rend son
 * crédit.
 *
 * Appelée par le worker. Elle ne crée rien et ne facture rien : elle ne fait
 * que trancher des lignes déjà écrites, ce qui la rend rejouable sans risque.
 */
export async function settleDeflections(tenantId: string): Promise<{
  confirmed: number;
  returned: number;
}> {
  const now = new Date();
  const due = await db
    .select()
    .from(aiDeflections)
    .where(
      and(
        eq(aiDeflections.tenantId, tenantId),
        eq(aiDeflections.status, "provisional"),
        sql`${aiDeflections.confirmAfter} <= ${now}`,
      ),
    )
    .limit(500);

  let confirmed = 0;
  let returned = 0;
  for (const row of due) {
    /* Un ticket du même contact créé après la réponse et avant la fin de la
       fenêtre : la déflexion a échoué, le crédit est rendu. Le silence, lui,
       confirme — mais seulement parce qu'une ligne n'existe ici QUE s'il y a
       eu un signal positif au départ. */
    const followUp = row.contactId
      ? await db
          .select({ id: tickets.id })
          .from(tickets)
          .where(
            and(
              eq(tickets.tenantId, tenantId),
              eq(tickets.requesterId, row.contactId),
              gte(tickets.createdAt, row.createdAt),
              sql`${tickets.createdAt} <= ${row.confirmAfter}`,
            ),
          )
          .limit(1)
      : [];

    if (followUp[0]) {
      await db
        .update(aiDeflections)
        .set({ status: "returned", ticketId: followUp[0].id })
        .where(eq(aiDeflections.id, row.id));
      returned++;
    } else {
      await db
        .update(aiDeflections)
        .set({ status: "confirmed" })
        .where(eq(aiDeflections.id, row.id));
      confirmed++;
    }
  }
  return { confirmed, returned };
}
