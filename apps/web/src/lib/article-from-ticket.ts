
import type { MessageKey } from "@/i18n/dictionaries/en";

/** What the conversion needs: translating. */
type Tr = { (key: MessageKey, params?: Record<string, string | number>): string };
/**
 * Conversion of a resolved request into an article draft.
 *
 * A support team's knowledge gets lost in closed tickets: this function takes the
 * customer's question and the agent's answer to lay out the "Symptom / Solution"
 * structure. The text stays that of the messages — it is a starting point to
 * review, not an automatic publication.
 */

/** A message from a thread, reduced to what the conversion needs. */
export type SourceMessage = {
  authorType: string;
  kind: string;
  bodyText: string | null;
};

/**
 * Courtesy formulas, English and French.
 *
 * A per-language list is a losing game — twenty-five languages, and a customer
 * writes in whichever they like whatever the workspace is set to. These two
 * cover the openings and closings the product actually receives today; a
 * formula that slips through leaves one line to delete in a draft that is meant
 * to be reviewed anyway, which is why this stays a heuristic and not a promise.
 */
const GREETINGS =
  /^(hello|hi|hey|dear|good morning|good afternoon|good evening|bonjour|bonsoir|madame|monsieur|cher|chère|salut)\b[^\n]*\n+/i;
/**
 * A closing only counts as one when it sits at the END, followed by nothing but
 * a signature: “Thank you for the details, here is the fix…” opens a paragraph
 * in the middle of many replies, and cutting there would throw the answer away.
 * Hence the tail constraint — at most a few short lines after the formula.
 */
const SIGNOFFS =
  /\n+(regards|best regards|kind regards|best|thanks|thanks in advance|many thanks|thank you|sincerely|yours sincerely|yours faithfully|cheers|cordialement|bien cordialement|merci d'avance|merci beaucoup|bonne journée|bien à vous|sincères salutations)\b[^\n]{0,20}(\n[^\n]{0,60}){0,3}\s*$/i;

/**
 * Cleans up a message before reuse: ">" quotes would become callouts in the
 * article format, and courtesy formulas have no business in a knowledge
 * base.
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
  /** What the conversion did not find — shown to the agent, not to the customer. */
  missing: string[];
};

export function articleFromTicket(
  t: Tr,
  subject: string,
  messages: SourceMessage[],
): TicketDraft {
  const publics = messages.filter((m) => m.kind === "public_reply" && m.bodyText?.trim());

  const question = publics.find((m) => m.authorType === "contact");
  // The last agent reply is the one that resolved the request.
  const answers = publics.filter((m) => m.authorType === "agent");
  const answer = answers[answers.length - 1];

  const missing: string[] = [];
  const symptom = question ? cleanMessage(question.bodyText!) : "";
  const solution = answer ? cleanMessage(answer.bodyText!) : "";
  if (!symptom) missing.push(t("app.kb.fromTicketMissingRequest"));
  if (!solution) missing.push(t("app.kb.fromTicketMissingAnswer"));

  const body = [
    `## ${t("app.kb.fromTicketSymptomHeading")}`,
    "",
    symptom || t("app.kb.fromTicketSymptomPlaceholder"),
    "",
    `## ${t("app.kb.fromTicketSolutionHeading")}`,
    "",
    solution || t("app.kb.fromTicketSolutionPlaceholder"),
    "",
  ].join("\n");

  return { title: subject.trim() || t("app.kb.fromTicketDefaultTitle"), body, missing };
}
