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
  db,
  kbArticles,
  macros,
  ticketMessages,
  tickets,
} from "@openhelpdesk/db";
import { embedText, type Actor } from "./governance";
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

/** Le plancher de similarité en dessous duquel un document n'est pas une source. */
const FLOOR = 0.35;

function plain(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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
