/**
 * Modèles de départ d'un article (base de connaissances).
 *
 * Une page blanche est le premier obstacle à la rédaction : ces quatre structures
 * couvrent l'essentiel de ce qu'écrit une équipe support, et sont écrites dans le
 * format que le portail sait rendre. Le texte entre crochets est à remplacer.
 */

export type ArticleTemplate = {
  id: string;
  label: string;
  hint: string;
  /** Glyphe décoratif de la carte de choix. */
  glyph: string;
  title: string;
  body: string;
};

export const ARTICLE_TEMPLATES: ArticleTemplate[] = [
  {
    id: "procedure",
    label: "Procédure pas-à-pas",
    hint: "Une suite d'étapes numérotées, avec le résultat attendu.",
    glyph: "1.",
    title: "Comment [faire l'action]",
    body: `Cet article explique comment [faire l'action]. Comptez environ [durée].

## Avant de commencer

- [Droit ou rôle nécessaire]
- [Information à avoir sous la main]

## Étapes

1. Ouvrez [l'écran concerné].
2. Cliquez sur **[le bouton]**.
3. Renseignez [le champ], puis validez.

> Si [le cas particulier] se présente, [la conduite à tenir].

## Résultat

[Ce que la personne doit voir une fois l'opération réussie.]
`,
  },
  {
    id: "incident",
    label: "Résolution d'incident",
    hint: "Symptôme, cause, solution et contournement provisoire.",
    glyph: "⚠",
    title: "[Symptôme observé]",
    body: `## Symptôme

[Ce que la personne constate, avec le message d'erreur exact s'il y en a un.]

## Cause

[Pourquoi cela se produit.]

## Solution

1. [Première action corrective]
2. [Deuxième action corrective]

## Contournement en attendant

> [Ce que la personne peut faire tout de suite si la solution demande une
> intervention de votre équipe.]

## Si le problème persiste

Ouvrez une demande en précisant [les informations utiles au diagnostic].
`,
  },
  {
    id: "faq",
    label: "Question fréquente",
    hint: "Une réponse courte et directe, puis les précisions.",
    glyph: "?",
    title: "[La question, telle que les clients la posent]",
    body: `**Réponse courte :** [la réponse en une phrase].

## En détail

[Le contexte et les nuances utiles.]

## Cas particuliers

- **[Situation A]** — [ce qui change].
- **[Situation B]** — [ce qui change].

## Pour aller plus loin

[Renvoi vers l'article voisin ou la démarche associée.]
`,
  },
  {
    id: "release",
    label: "Note de version",
    hint: "Nouveautés, améliorations et corrections d'une livraison.",
    glyph: "✦",
    title: "Nouveautés du [date ou version]",
    body: `## Nouveautés

- **[Nom de la fonctionnalité]** — [ce qu'elle permet, côté utilisateur].

## Améliorations

- [Ce qui devient plus simple ou plus rapide.]

## Corrections

- [Le problème corrigé, formulé comme le client le vivait.]

> Ces changements sont déjà actifs sur votre espace, aucune action de votre part
> n'est nécessaire.
`,
  },
];

export function templateById(id: string | undefined): ArticleTemplate | undefined {
  return id ? ARTICLE_TEMPLATES.find((t) => t.id === id) : undefined;
}
