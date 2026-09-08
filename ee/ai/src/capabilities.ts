/**
 * Les capacités, une fonction chacune (spec 18 § 4 et § 5).
 *
 * Toutes passent par `capabilityAllowed` puis `runCapability` : la première dit
 * si l'espace le permet, la seconde journalise l'appel avec son coût quoi qu'il
 * arrive. Aucune ne devrait être appelée directement par un écran sans elles —
 * c'est pour ça qu'elles sont ici et pas dans les Server Actions.
 *
 * Les instructions au modèle sont en anglais parce qu'elles s'adressent au
 * modèle et non à un humain ; le contenu, lui, garde sa langue, c'est la
 * troisième règle du système (`governance.ts`). Un prompt français n'améliore
 * pas une réponse française : c'est le matériau qui la commande.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  contacts,
  db,
  teams,
  tenants,
  ticketMessages,
  tickets,
  type AiCapability,
} from "@openhelpdesk/db";
import { findPassages, type Passage } from "./knowledge";
import {
  ask,
  capabilityAllowed,
  getAiSettings,
  logRefusal,
  runCapability,
  type Actor,
} from "./governance";
import { parseJson, type ProviderConfig } from "./provider";

/**
 * Ce qu'une capacité renvoie : une sortie, ou la raison de son absence.
 *
 * Les cinq premiers motifs viennent de la gouvernance et ont chacun leur phrase
 * à l'écran. `no_source` est le sixième, et le seul qui ne soit pas un refus de
 * permission : la question n'a pas de réponse dans le matériau autorisé. C'est
 * une issue normale, pas une panne, et l'écran la traite autrement — il propose
 * d'écrire l'article manquant.
 */
export type OutcomeReason =
  | "unconfigured"
  | "disabled"
  | "capability_off"
  | "locale_closed"
  | "quota_reached"
  | "no_source";

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: OutcomeReason };

type Thread = {
  subject: string;
  requesterEmail: string | null;
  text: string;
  /** Les adresses des participants, qui traversent la rédaction (redact.ts). */
  keep: string[];
};

const MAX_THREAD_CHARS = 12_000;

/**
 * Le fil, tel que le modèle le lira.
 *
 * Les notes internes n'entrent que si l'espace l'a explicitement autorisé, et
 * ce contrôle est ici — au plus près de la lecture — plutôt que chez chaque
 * appelant, pour qu'aucun nouvel appelant ne puisse l'oublier.
 */
async function threadFor(
  tenantId: string,
  ticketId: string,
  includeNotes: boolean,
): Promise<Thread | null> {
  const [ticket] = await db
    .select({ subject: tickets.subject, requesterId: tickets.requesterId })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
  if (!ticket) return null;

  const kinds = includeNotes
    ? (["public_reply", "internal_note"] as const)
    : (["public_reply"] as const);
  const rows = await db
    .select({
      kind: ticketMessages.kind,
      authorType: ticketMessages.authorType,
      body: ticketMessages.bodyText,
    })
    .from(ticketMessages)
    .where(
      and(
        eq(ticketMessages.tenantId, tenantId),
        eq(ticketMessages.ticketId, ticketId),
        inArray(ticketMessages.kind, [...kinds]),
      ),
    )
    .orderBy(asc(ticketMessages.createdAt))
    .limit(60);

  let requesterEmail: string | null = null;
  if (ticket.requesterId) {
    const [contact] = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, ticket.requesterId));
    requesterEmail = contact?.email ?? null;
  }

  const text = rows
    .filter((r) => r.body)
    .map((r) => {
      const who =
        r.kind === "internal_note"
          ? "INTERNAL NOTE"
          : r.authorType === "agent"
            ? "AGENT"
            : "CUSTOMER";
      return `${who}: ${r.body}`;
    })
    .join("\n\n")
    /* On garde la FIN du fil : ce qui bloque maintenant est dans les derniers
       messages, et un troncage par le début couperait la demande initiale — que
       le sujet porte déjà. */
    .slice(-MAX_THREAD_CHARS);

  return {
    subject: ticket.subject,
    requesterEmail,
    text,
    keep: requesterEmail ? [requesterEmail] : [],
  };
}

/* ---------- AI-01 · Triage ---------- */

export type Triage = {
  category: string | null;
  priority: "low" | "normal" | "high" | "urgent" | null;
  locale: string | null;
  teamId: string | null;
};

/**
 * Le schéma se décrit dans le prompt et non dans `response_format`.
 *
 * Ce n'est pas un choix esthétique : mesuré contre l'API, le schéma strict de
 * ce fournisseur casse la sortie de ce modèle (voir `provider.ts`). Décrit en
 * prose et demandé en `json_object`, il est respecté — et pour vingt fois moins
 * de jetons.
 */
const TRIAGE_SHAPE = [
  "Reply with a JSON object and nothing else, with exactly these keys:",
  '  "category": a short label for the ticket, or null',
  '  "priority": one of "low", "normal", "high", "urgent", or null',
  '  "locale": the ticket\'s own language as a two-letter code (fr, en, de…), or null',
  '  "team": the destination team, chosen by name from the list below, or null',
].join("\n");

/**
 * Une langue valide, ou rien.
 *
 * Le modèle a répondu `"N/A"` en test là où le prompt demandait `null`, et sans
 * ce filtre l'inbox aurait affiché une suggestion de langue `n/a`. On n'accepte
 * que deux lettres — ce qui écarte aussi `"unknown"`, `"none"` et le reste du
 * répertoire des façons de dire « je ne sais pas ».
 */
function validLocale(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase().slice(0, 2);
  return /^[a-z]{2}$/.test(v) ? v : null;
}

/**
 * La langue de l'espace, celle dans laquelle son équipe travaille.
 *
 * C'est la langue des sorties destinées à l'agent — le résumé, le triage —
 * indépendamment de celle du client. Une équipe française qui reçoit un ticket
 * en portugais veut un résumé en français ; c'est l'inverse pour le brouillon,
 * qui part chez le client.
 */
async function workspaceLocale(tenantId: string): Promise<string> {
  const [row] = await db
    .select({ locale: tenants.locale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return validLocale(row?.locale) ?? "en";
}

/**
 * Le nom anglais d'une langue, pour l'écrire dans un prompt.
 *
 * Un code ISO seul ne suffit pas : « write in mt » est compris beaucoup moins
 * sûrement que « write in Maltese », et c'est précisément sur les langues rares
 * que la confusion coûte cher. `Intl.DisplayNames` porte déjà les 25, donc rien
 * à maintenir à la main ; le code brut reste le repli.
 */
function languageName(locale: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

/**
 * Propose une catégorie, une priorité, une langue et une équipe.
 *
 * **Refuse en dessous de quinze mots utiles.** Un « bonjour, ça ne marche
 * pas » ne se trie pas, et prétendre le contraire dégrade l'inbox de tout le
 * monde : une suggestion fausse coûte plus qu'une suggestion absente, parce
 * qu'un agent finit par ignorer la pastille.
 */
export async function triageTicket(
  provider: ProviderConfig,
  tenantId: string,
  ticketId: string,
  actor: Actor,
): Promise<Outcome<Triage>> {
  const allowed = await capabilityAllowed(tenantId, "triage", { provider });
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  const thread = await threadFor(tenantId, ticketId, false);
  if (!thread) return { ok: false, reason: "no_source" };
  const words = thread.text.split(/\s+/).filter((w) => w.length > 2).length;
  if (words < 15) return { ok: false, reason: "no_source" };

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tenantId, tenantId));
  /* La catégorie s'affiche dans l'inbox : elle est pour l'agent, donc dans la
     langue de l'espace. Le champ `locale`, lui, reste celui du client — c'est
     tout son objet. */
  const locale = await workspaceLocale(tenantId);

  return runCapability(tenantId, "triage", actor, ticketId, async () => {
    const out = await ask(
      provider,
      [
        "You triage an incoming support ticket.",
        TRIAGE_SHAPE,
        teamRows.length > 0
          ? `The teams are: ${teamRows.map((t) => t.name).join(", ")}.`
          : "There are no teams: return null for team.",
        `Write "category" in ${languageName(locale)}. "locale" stays the ticket's own language.`,
        "Use null for anything the material does not support. A guess is worse than a null.",
      ].join("\n"),
      `Subject: ${thread.subject}\n\n${thread.text}`,
      { json: true, maxTokens: 400, keep: thread.keep },
    );

    const parsed = parseJson<{
      category?: string | null;
      priority?: string | null;
      locale?: string | null;
      team?: string | null;
    }>(out.text);

    const priority = (["low", "normal", "high", "urgent"] as const).find(
      (p) => p === parsed?.priority,
    );
    const team = teamRows.find(
      (t) => t.name.toLowerCase() === String(parsed?.team ?? "").toLowerCase(),
    );

    return {
      result: {
        category: parsed?.category?.trim() || null,
        priority: priority ?? null,
        locale: validLocale(parsed?.locale),
        teamId: team?.id ?? null,
      } satisfies Triage,
      model: out.model,
      provider: provider.label,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      costMicros: out.costMicros,
      redactions: out.redactions,
      refused: !parsed,
    };
  }).then((value) => ({ ok: true as const, value }));
}

/* ---------- AI-02 · Résumé de fil ---------- */

/**
 * Un paragraphe pour celui qui reprend le ticket maintenant : ce que demande le
 * client, ce qui a été tenté, ce qui bloque.
 *
 * Les notes internes entrent ici si l'espace les autorise — c'est le seul
 * endroit où elles servent vraiment, puisque le résumé est lu par un agent et
 * jamais par un client.
 */
export async function summarizeThread(
  provider: ProviderConfig,
  tenantId: string,
  ticketId: string,
  actor: Actor,
): Promise<Outcome<string>> {
  const allowed = await capabilityAllowed(tenantId, "summary", { provider });
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  const settings = await getAiSettings(tenantId);
  const thread = await threadFor(tenantId, ticketId, settings.sources.internalNotes);
  if (!thread || thread.text.length < 40) return { ok: false, reason: "no_source" };

  /* Le résumé est lu par l'agent, donc il est écrit dans la langue de l'espace
     — pas dans celle du client, qui peut écrire en portugais à une équipe
     française. */
  const locale = await workspaceLocale(tenantId);

  const value = await runCapability(tenantId, "summary", actor, ticketId, async () => {
    const out = await ask(
      provider,
      [
        "You summarise a support thread for the agent picking it up now.",
        "One paragraph, at most four sentences: what the customer wants, what has been tried, what is blocking.",
        "No greeting, no bullet list, no restatement of the subject line.",
        `Write the summary in ${languageName(locale)}, whatever language the thread is in.`,
      ].join("\n"),
      `Subject: ${thread.subject}\n\n${thread.text}`,
      { maxTokens: 600, keep: thread.keep },
    );
    return {
      result: out.text,
      model: out.model,
      provider: provider.label,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      costMicros: out.costMicros,
      redactions: out.redactions,
      refused: out.text.length === 0,
    };
  });
  return value ? { ok: true, value } : { ok: false, reason: "no_source" };
}

/* ---------- AI-03 · Brouillon de réponse ---------- */

export type Draft = { text: string; sources: Passage[] };

/**
 * Un brouillon écrit **depuis la base**, avec les articles utilisés.
 *
 * `no_source` est une issue normale et fréquente, pas une panne : sans passage
 * au-dessus du plancher, on refuse et l'écran propose d'écrire l'article
 * manquant. C'est la seule fonction dont le refus doit être plus fréquent que
 * l'invention — un brouillon faux part chez un client, un refus ne part nulle
 * part.
 */
export async function draftReply(
  provider: ProviderConfig,
  tenantId: string,
  ticketId: string,
  actor: Actor,
): Promise<Outcome<Draft>> {
  const allowed = await capabilityAllowed(tenantId, "reply_draft", { provider });
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  const settings = await getAiSettings(tenantId);
  const thread = await threadFor(tenantId, ticketId, settings.sources.internalNotes);
  if (!thread) return { ok: false, reason: "no_source" };

  const question = `${thread.subject}\n${thread.text.slice(-3000)}`;
  const passages = await findPassages(provider, tenantId, question, actor, { limit: 4 });
  if (passages.length === 0) {
    /* Le refus qui compte pour l'admin : la question posée, la base muette. */
    await logRefusal(tenantId, "reply_draft", actor, ticketId, provider, "no_passage");
    return { ok: false, reason: "no_source" };
  }

  const value = await runCapability(tenantId, "reply_draft", actor, ticketId, async () => {
    const material = passages
      .map((p, i) => `[${i + 1}] ${p.title}\n${p.summary}`)
      .join("\n\n---\n\n");
    const out = await ask(
      provider,
      [
        "You draft a support reply to a customer, for an agent to read and send.",
        "Use ONLY the numbered material below. Never add a fact it does not contain.",
        "Do not cite the numbers in the reply: the interface shows the sources separately.",
        "No subject line, no signature — the product adds them.",
        "Reply in the language of the THREAD, not the language of the material.",
        'Answer with a JSON object: {"answers": true|false, "reply": "…"}.',
        '"answers" is false when the material does not answer what the customer asks; then leave "reply" empty.',
        'Never explain in "reply" that the material is insufficient — that is what "answers": false is for.',
      ].join("\n"),
      `MATERIAL\n${material}\n\nTHREAD\nSubject: ${thread.subject}\n\n${thread.text}`,
      { json: true, maxTokens: 1200, keep: thread.keep },
    );
    /* Le refus passe par un champ, pas par une phrase. La première version
       demandait au modèle de « le dire en une phrase » : il a répondu « le
       matériau fourni ne contient pas d'estimation de délai », et l'écran a
       inséré ce méta-commentaire dans le composeur comme s'il s'agissait d'un
       brouillon. Un refus lisible par la machine remonte en `no_source`, et
       l'écran propose alors d'écrire l'article manquant. */
    const parsed = parseJson<{ answers?: boolean; reply?: string }>(out.text);
    const text = parsed?.answers === true ? (parsed.reply ?? "").trim() : "";
    return {
      result: { text, sources: passages } satisfies Draft,
      model: out.model,
      provider: provider.label,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      costMicros: out.costMicros,
      redactions: out.redactions,
      refused: text.length === 0,
    };
  });
  return value.text ? { ok: true, value } : { ok: false, reason: "no_source" };
}

/* ---------- AI-06 · Macro suggérée ---------- */

/**
 * La macro que l'équipe a déjà validée, quand il y en a une qui répond.
 *
 * Coûte un embedding et pas une génération, et n'engage rien de neuf : à
 * préférer à AI-03 quand les deux répondent. Le plancher est plus haut que
 * pour la recherche générale — proposer une macro à côté du sujet fait perdre
 * plus de temps qu'elle n'en gagne.
 */
export async function suggestMacro(
  provider: ProviderConfig,
  tenantId: string,
  ticketId: string,
  actor: Actor,
): Promise<Outcome<Passage>> {
  const allowed = await capabilityAllowed(tenantId, "macro_suggest", { provider });
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  const thread = await threadFor(tenantId, ticketId, false);
  if (!thread) return { ok: false, reason: "no_source" };

  const found = await findPassages(
    provider,
    tenantId,
    `${thread.subject}\n${thread.text.slice(-2000)}`,
    actor,
    {
      sources: ["macro"],
      limit: 1,
      /* Plus haut que le plancher général de 0,62 : une macro proposée à côté
         du sujet fait perdre plus de temps qu'elle n'en gagne, alors qu'un
         article seulement « proche » reste utile à un agent qui le relit. */
      floor: 0.72,
    },
  );
  const best = found[0];
  if (!best) {
    await logRefusal(tenantId, "macro_suggest", actor, ticketId, provider, "no_passage");
    return { ok: false, reason: "no_source" };
  }
  /* Une macro trouvée ne coûte qu'un embedding, déjà journalisé : rien à
     consigner de plus, le journal porterait deux lignes pour un seul geste. */
  return { ok: true, value: best };
}

/** Les capacités qu'un écran peut proposer, sachant l'offre de l'espace. */
export function availableCapabilities(ent: {
  aiBasic: boolean;
  aiFull: boolean;
}): AiCapability[] {
  const basic: AiCapability[] = ["triage", "summary", "macro_suggest", "kb_search", "deflect"];
  const full: AiCapability[] = ["reply_draft", "rewrite", "kb_article"];
  return [...(ent.aiBasic || ent.aiFull ? basic : []), ...(ent.aiFull ? full : [])];
}
