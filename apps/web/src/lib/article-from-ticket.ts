/**
 * Conversion d'une demande résolue en brouillon d'article.
 *
 * Le savoir d'une équipe support se perd dans les tickets clos : cette fonction
 * reprend la question du client et la réponse de l'agent pour poser la structure
 * « Symptôme / Solution ». Le texte reste celui des messages — c'est un point de
 * départ à relire, pas une publication automatique.
 */

/** Un message d'un fil, réduit à ce dont la conversion a besoin. */
export type SourceMessage = {
  authorType: string;
  kind: string;
  bodyText: string | null;
};

const GREETINGS =
  /^(bonjour|bonsoir|madame|monsieur|cher|chère|salut|hello)\b[^\n]*\n+/i;
const SIGNOFFS =
  /\n+(cordialement|bien cordialement|merci d'avance|merci beaucoup|bonne journée|bien à vous|sincères salutations)\b[\s\S]*$/i;

/**
 * Nettoie un message avant reprise : les citations « > » deviendraient des
 * encadrés dans le format d'article, et les formules d'usage n'ont rien à faire
 * dans une base de connaissances.
 */
export function cleanMessage(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .replace(GREETINGS, "")
    .replace(SIGNOFFS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type TicketDraft = {
  title: string;
  body: string;
  /** Ce que la conversion n'a pas trouvé — affiché à l'agent, pas au client. */
  missing: string[];
};

export function articleFromTicket(subject: string, messages: SourceMessage[]): TicketDraft {
  const publics = messages.filter((m) => m.kind === "public_reply" && m.bodyText?.trim());

  const question = publics.find((m) => m.authorType === "contact");
  // La dernière réponse d'agent est celle qui a résolu la demande.
  const answers = publics.filter((m) => m.authorType === "agent");
  const answer = answers[answers.length - 1];

  const missing: string[] = [];
  const symptome = question ? cleanMessage(question.bodyText!) : "";
  const solution = answer ? cleanMessage(answer.bodyText!) : "";
  if (!symptome) missing.push("la demande initiale du client");
  if (!solution) missing.push("la réponse de l'agent");

  const body = [
    "## Symptôme",
    "",
    symptome || "[Décrivez ce que le client constate.]",
    "",
    "## Solution",
    "",
    solution || "[Décrivez la manipulation qui résout le problème.]",
    "",
  ].join("\n");

  return { title: subject.trim() || "Nouvel article", body, missing };
}
