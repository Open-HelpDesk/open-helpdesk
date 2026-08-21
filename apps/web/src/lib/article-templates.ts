/**
 * Modèles de départ d'un article (base de connaissances).
 *
 * Une page blanche est le premier obstacle à la rédaction : ces quatre
 * structures couvrent l'essentiel de ce qu'écrit une équipe support, et sont
 * écrites dans le format que le portail sait rendre. Le texte entre crochets est
 * à remplacer par l'auteur.
 *
 * Les textes étaient ici, en français : une équipe support bulgare se voyait donc
 * proposer des squelettes d'articles français. Ce fichier ne porte plus que des
 * CLÉS et le glyphe décoratif de la carte de choix, qui n'est pas du texte.
 */
import type { MessageKey } from "@/i18n/dictionaries/fr";

export type ArticleTemplate = {
  id: string;
  labelKey: MessageKey;
  hintKey: MessageKey;
  /** Glyphe décoratif de la carte de choix — pas du texte, pas traduit. */
  glyph: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
};

export const ARTICLE_TEMPLATES: ArticleTemplate[] = [
  {
    id: "procedure",
    labelKey: "app.kb.tplProcedureLabel",
    hintKey: "app.kb.tplProcedureHint",
    glyph: "1.",
    titleKey: "app.kb.tplProcedureTitle",
    bodyKey: "app.kb.tplProcedureBody",
  },
  {
    id: "incident",
    labelKey: "app.kb.tplIncidentLabel",
    hintKey: "app.kb.tplIncidentHint",
    glyph: "⚠",
    titleKey: "app.kb.tplIncidentTitle",
    bodyKey: "app.kb.tplIncidentBody",
  },
  {
    id: "faq",
    labelKey: "app.kb.tplFaqLabel",
    hintKey: "app.kb.tplFaqHint",
    glyph: "?",
    titleKey: "app.kb.tplFaqTitle",
    bodyKey: "app.kb.tplFaqBody",
  },
  {
    id: "release",
    labelKey: "app.kb.tplReleaseLabel",
    hintKey: "app.kb.tplReleaseHint",
    glyph: "✦",
    titleKey: "app.kb.tplReleaseTitle",
    bodyKey: "app.kb.tplReleaseBody",
  },
];

export function templateById(id: string | undefined): ArticleTemplate | undefined {
  return id ? ARTICLE_TEMPLATES.find((t) => t.id === id) : undefined;
}
