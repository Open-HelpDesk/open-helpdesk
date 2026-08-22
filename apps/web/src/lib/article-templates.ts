/**
 * Starter templates for an article (knowledge base).
 *
 * A blank page is the first obstacle to writing: these four structures cover
 * the essentials of what a support team writes, and are written in the format
 * the portal knows how to render. The text between brackets is for the author
 * to replace.
 *
 * The texts used to live here, in French: a Bulgarian support team was therefore
 * offered French article skeletons. This file now carries only KEYS and the
 * decorative glyph of the choice card, which is not text.
 */
import type { MessageKey } from "@/i18n/dictionaries/en";

export type ArticleTemplate = {
  id: string;
  labelKey: MessageKey;
  hintKey: MessageKey;
  /** Decorative glyph of the choice card — not text, not translated. */
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
