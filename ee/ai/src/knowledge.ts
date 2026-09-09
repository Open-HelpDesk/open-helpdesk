/**
 * La couche de connaissance : ce que l'assistant a le droit de lire, résumé et
 * vectorisé une fois, puis retrouvé par le sens.
 *
 * Trois sources, et l'ordre n'est pas indifférent. Les **articles publiés** sont
 * la vérité que l'espace assume publiquement. Les **macros** sont des réponses
 * que l'équipe a déjà validées — les préférer coûte un embedding au lieu d'une
 * génération, et n'engage rien de neuf. Les **tickets résolus** sont la source
 * qui rend les premières semaines utiles, avant que la base existe (décision
 * D5) — et jamais partagés entre espaces, ce qui tient au fait que chaque ligne
 * porte son `tenant_id` et que la RLS s'applique.
 *
 * Les embeddings sont comparés dans l'application, sans extension Postgres :
 * même choix qu'Open Incident, pour qu'aucune migration ne diverge entre les
 * éditions. Le plafond pratique est de quelques milliers de documents par
 * espace, ce qui couvre une base réelle avec de la marge.
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  aiDocuments,
  aiSettings,
  db,
  kbArticles,
  macros,
  ticketMessages,
  tickets,
} from "@openhelpdesk/db";
import { decryptSecret } from "@openhelpdesk/crypto";
import { embedText, providerFor, type Actor } from "./governance";
import { cosine } from "./similarity";
import type { ProviderConfig } from "./provider";

export type DocumentSource = "kb_article" | "macro" | "resolved_ticket";

export type Passage = {
  source: DocumentSource;
  refId: string;
  title: string;
  summary: string;
  score: number;
};

/** Ce que l'espace autorise l'assistant à lire (miroir de `ai_settings.sources`). */
export type Sources = {
  kb: boolean;
  macros: boolean;
  resolvedTickets: boolean;
  internalNotes: boolean;
};

/** Combien de texte on garde par document : assez pour répondre, pas de quoi noyer le prompt. */
const SUMMARY_CHARS = 1200;

/**
 * Le plancher de similarité en dessous duquel un document n'est pas une source.
 *
 * **Mesuré, pas deviné**, contre `qwen3-embedding-8b` le 08/09/2026 : une
 * question de client (« le bouton Exporter en PDF ne répond plus, erreur 500 »)
 * confrontée à six articles plausibles a donné
 *
 *   0,833  l'article qui répond
 *   0,742  un article proche (les erreurs 500 en général)
 *   0,711  un article proche (comment exporter)
 *   0,525  sans lien (facturation)
 *   0,505  sans lien (mot de passe)
 *   0,442  sans lien (inviter un agent)
 *
 * L'écart utile est donc entre 0,711 et 0,525. La première version de ce
 * fichier avait 0,35, valeur reprise du produit voisin — elle aurait admis
 * **les trois documents sans lien** comme sources d'une réponse au client, ce
 * qui vide de son sens la règle « aucune réponse sans source » : la source
 * existe, elle ne répond simplement pas à la question.
 *
 * Ce modèle a une plage comprimée (0,44 pour deux textes étrangers l'un à
 * l'autre), donc les planchers conseillés pour d'autres modèles ne s'y
 * transposent pas. À recalibrer si le modèle d'embeddings change — d'où les
 * chiffres ci-dessus, qui disent comment.
 *
 * **Deuxième mesure, et elle resserre l'affaire.** Sur le ticket #4821 du
 * workspace de démo (« Cannot export invoices to PDF », anglais, base
 * d'articles anglaise), l'article qui répond — et dont le brouillon produit
 * était juste — n'obtient que **0,655**, quand la meilleure macro française
 * sans rapport obtient 0,621. Le plancher de 0,62 tient donc pour les deux cas
 * mesurés, mais avec 0,035 de marge au lieu de 0,19 : l'écart utile est bien
 * plus étroit d'une langue à l'autre qu'à l'intérieur d'une seule.
 *
 * Deux points de mesure ne font pas une calibration. C'est l'objet du jeu
 * d'évaluation (IA-6) : tant qu'il n'existe pas, cette constante est un choix
 * défendable et non un résultat, et c'est ce que ce commentaire doit dire.
 */
const FLOOR = 0.62;

/** Les entités qu'un éditeur riche produit, décodées en une seule passe. */
const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
};

/**
 * Le HTML d'un article réduit au texte que le modèle lira.
 *
 * **Les entités sont décodées en une seule passe**, et c'est le point à ne pas
 * défaire. La version précédente enchaînait les remplacements — `&amp;` puis
 * `&lt;` — de sorte que le `&` tout juste décodé était relu au tour suivant :
 * `&amp;lt;` devenait `<` au lieu de `&lt;`. CodeQL l'a signalé
 * (js/double-escaping), et il ne s'agit pas d'un détail cosmétique ici : un
 * article de la base qui documente des entités HTML — il y en a, c'est un
 * produit de support technique — voyait ses exemples déformés avant d'être
 * indexé, donc avant d'être cité dans une réponse au client.
 *
 * Une passe unique rend l'ordre des règles sans importance, ce qui est la
 * seule façon de ne pas réintroduire le défaut par inadvertance.
 */
export function plain(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (whole, name: string) => ENTITIES[name] ?? whole)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Réindexe ce que l'espace autorise, et **supprime ce qu'il vient d'interdire**.
 *
 * Ce second point est la moitié qui compte : couper « tickets résolus » dans la
 * gouvernance doit retirer les documents déjà indexés, sinon l'interrupteur ne
 * change rien à ce que l'assistant lit et l'écran mentirait.
 */
export async function reindexWorkspace(
  provider: ProviderConfig,
  tenantId: string,
  sources: Sources,
  actor: Actor,
): Promise<{ indexed: number; removed: number }> {
  const wanted: Array<{ source: DocumentSource; refId: string; title: string; body: string; locale: string | null }> = [];

  if (sources.kb) {
    const rows = await db
      .select()
      .from(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.status, "published")));
    for (const a of rows) {
      wanted.push({
        source: "kb_article",
        refId: a.id,
        title: a.title,
        body: plain(a.bodyHtml).slice(0, SUMMARY_CHARS),
        locale: null,
      });
    }
  }

  if (sources.macros) {
    const rows = await db.select().from(macros).where(eq(macros.tenantId, tenantId));
    for (const m of rows) {
      /* Une macro n'a de valeur ici que par le texte qu'elle insère : ses autres
         actions (priorité, équipe) ne répondent à aucune question. */
      const text = (m.actions as Array<{ type?: string; value?: unknown }> | null)
        ?.filter((a) => a.type === "insert_text" && typeof a.value === "string")
        .map((a) => String(a.value))
        .join("\n\n");
      if (!text) continue;
      wanted.push({
        source: "macro",
        refId: m.id,
        title: m.name,
        body: text.slice(0, SUMMARY_CHARS),
        locale: null,
      });
    }
  }

  if (sources.resolvedTickets) {
    const rows = await db
      .select({ id: tickets.id, subject: tickets.subject })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), inArray(tickets.status, ["resolved", "closed"])))
      .orderBy(desc(tickets.updatedAt))
      .limit(500);
    for (const ticket of rows) {
      /* La dernière réponse publique d'un agent : c'est là qu'est la solution.
         Les notes internes sont exclues d'office ici — elles ont leur propre
         interrupteur, et l'indexation n'est pas l'endroit où l'oublier. */
      const [answer] = await db
        .select({ body: ticketMessages.bodyText })
        .from(ticketMessages)
        .where(
          and(
            eq(ticketMessages.tenantId, tenantId),
            eq(ticketMessages.ticketId, ticket.id),
            eq(ticketMessages.kind, "public_reply"),
            eq(ticketMessages.authorType, "agent"),
            isNotNull(ticketMessages.bodyText),
          ),
        )
        .orderBy(desc(ticketMessages.createdAt))
        .limit(1);
      if (!answer?.body) continue;
      wanted.push({
        source: "resolved_ticket",
        refId: ticket.id,
        title: ticket.subject,
        body: answer.body.slice(0, SUMMARY_CHARS),
        locale: null,
      });
    }
  }

  const existing = await db
    .select({ id: aiDocuments.id, source: aiDocuments.source, refId: aiDocuments.refId })
    .from(aiDocuments)
    .where(eq(aiDocuments.tenantId, tenantId));

  const keep = new Set(wanted.map((w) => `${w.source}:${w.refId}`));
  const stale = existing.filter((e) => !keep.has(`${e.source}:${e.refId}`));
  if (stale.length > 0) {
    await db.delete(aiDocuments).where(
      inArray(
        aiDocuments.id,
        stale.map((s) => s.id),
      ),
    );
  }

  let indexed = 0;
  /* Par lots : un espace avec 400 articles ferait 400 appels séparés, et le
     fournisseur accepte les entrées groupées. */
  for (let i = 0; i < wanted.length; i += 32) {
    const batch = wanted.slice(i, i + 32);
    const vectors = await embedText(
      provider,
      tenantId,
      actor,
      batch.map((d) => `${d.title}\n${d.body}`),
    );
    for (const [n, doc] of batch.entries()) {
      await db
        .insert(aiDocuments)
        .values({
          tenantId,
          source: doc.source,
          refId: doc.refId,
          locale: doc.locale,
          title: doc.title,
          summary: doc.body,
          embedding: vectors[n] ?? null,
          model: provider.embedModel,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [aiDocuments.tenantId, aiDocuments.source, aiDocuments.refId],
          set: {
            title: doc.title,
            summary: doc.body,
            embedding: vectors[n] ?? null,
            model: provider.embedModel,
            updatedAt: new Date(),
          },
        });
      indexed++;
    }
  }
  return { indexed, removed: stale.length };
}

/**
 * Les passages les plus proches d'une question.
 *
 * Renvoie un tableau **vide** plutôt qu'un mauvais résultat quand rien ne passe
 * le plancher : c'est ce vide qui fait dire « rien dans la base ne répond à
 * ceci » au lieu d'inventer, et c'est la règle 3 de la doctrine.
 */
export async function findPassages(
  provider: ProviderConfig,
  tenantId: string,
  question: string,
  actor: Actor,
  opts: { sources?: DocumentSource[]; limit?: number; floor?: number } = {},
): Promise<Passage[]> {
  if (!provider.embedModel) return [];
  const [vector] = await embedText(provider, tenantId, actor, [question]);
  if (!vector || vector.length === 0) return [];

  const filters = [eq(aiDocuments.tenantId, tenantId)];
  if (opts.sources?.length) filters.push(inArray(aiDocuments.source, opts.sources));
  const docs = await db
    .select()
    .from(aiDocuments)
    .where(and(...filters))
    .orderBy(desc(aiDocuments.updatedAt))
    .limit(4000);

  return docs
    .filter((d) => d.embedding && d.embedding.length > 0)
    .map((d) => ({
      source: d.source,
      refId: d.refId,
      title: d.title,
      summary: d.summary,
      score: cosine(vector, d.embedding!),
    }))
    .filter((d) => d.score >= (opts.floor ?? FLOOR))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 5);
}

/**
 * Réindexe tous les espaces où l'assistant est allumé.
 *
 * Sans ceci, `reindexWorkspace` n'était appelé par personne : la couche de
 * connaissance restait vide, `findPassages` ne rendait jamais rien, et chaque
 * brouillon refusait faute de source sur une installation par ailleurs
 * correcte. L'assistant était complet et inerte.
 *
 * Périodique et non événementiel, à dessein. Les sources bougent sans arrêt
 * — un article publié, un ticket résolu, une macro modifiée — et réindexer à
 * chaque écriture ferait un appel payant par sauvegarde d'article. Un passage
 * régulier coûte un embedding par document *modifié* et rattrape tout ; le
 * bouton de l'écran de réglages sert à ne pas attendre le prochain passage.
 *
 * Un espace qui échoue n'arrête pas les autres : c'est un balayage, pas une
 * transaction.
 */
export async function reindexEnabledWorkspaces(): Promise<{
  tenants: number;
  indexed: number;
  removed: number;
  failed: number;
}> {
  const rows = await db
    .select({ tenantId: aiSettings.tenantId, sources: aiSettings.sources })
    .from(aiSettings)
    .where(eq(aiSettings.enabled, true));

  let tenantsDone = 0;
  let indexed = 0;
  let removed = 0;
  let failed = 0;
  for (const row of rows) {
    /* Chaque espace avec son propre fournisseur : celui qui apporte son modèle
       vectorise chez lui, et l'instance ne paie pas son indexation. */
    const provider = await providerFor(row.tenantId, decryptSecret);
    if (!provider?.embedModel) continue;
    try {
      const out = await reindexWorkspace(provider, row.tenantId, row.sources, {
        kind: "system",
        userId: null,
        name: "index",
      });
      indexed += out.indexed;
      removed += out.removed;
      tenantsDone++;
    } catch {
      failed++;
    }
  }
  return { tenants: tenantsDone, indexed, removed, failed };
}
