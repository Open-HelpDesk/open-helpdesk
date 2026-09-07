/**
 * What a phone is woken for, and what it says when it wakes.
 *
 * The text is NOT built here. A workspace runs in one of 25 languages and this
 * package has no access to the dictionaries (the same reason the mail package
 * sends its instance emails in English only) — so a notification carries a
 * localisation key and its arguments, and the app renders the sentence with the
 * strings it already ships. Both APNs and FCM have carried loc-keys for years
 * precisely for this.
 *
 * The consequence worth knowing: adding an event means adding a key to the app
 * bundle too. A version of the app that does not know a key falls back to the
 * `fallback` text, which is why one is always sent.
 */
export const PUSH_EVENTS = [
  /** A ticket landed on an agent — by hand, by a rule, or by round-robin. */
  "ticket.assigned",
  /** The customer answered a ticket this agent owns. */
  "ticket.reply",
  /** An SLA target is approaching on a ticket this agent owns. */
  "sla.warning",
  /** An SLA target was missed. */
  "sla.breached",
  /** An agent answered a request this customer opened (MC-04). */
  "request.reply",
] as const;

export type PushEvent = (typeof PUSH_EVENTS)[number];

export type PushNotification = {
  event: PushEvent;
  /** Dictionary key the app resolves, e.g. `push.ticketAssigned`. */
  locKey: string;
  /** Ordered arguments for that key — a ticket number, a name. */
  locArgs: string[];
  /**
   * English, for an app build that does not know the key yet.
   *
   * Not a translation and not meant to be one: it is the line that keeps a
   * notification readable rather than empty when the two sides disagree about
   * what exists.
   */
  fallback: string;
  /** Where a tap goes. The app routes on this, never on the text. */
  data: {
    kind: PushEvent;
    ticket_number: number;
    /** "agent" screens (MA-xx) or "portal" ones (MC-xx). */
    surface: "agent" | "portal";
  };
};

/**
 * Two forms per event, because the actor is not always known.
 *
 * A reply written through the API carries no `agent_id`, an inbound email may
 * come from an address with no name attached — and "` replied on #4821`" with a
 * hole where the name should be is worse than a sentence that never mentions
 * one. So an event with no actor uses its own key and its own wording, rather
 * than the same key with an empty argument.
 */
type Spec = {
  key: string;
  anonKey: string;
  named: (n: number, who: string) => string;
  anon: (n: number) => string;
};

const KEYS: Record<PushEvent, Spec> = {
  "ticket.assigned": {
    key: "push.ticketAssigned",
    anonKey: "push.ticketAssignedAnon",
    named: (n, who) => `${who} assigned #${n} to you`,
    anon: (n) => `Ticket #${n} was assigned to you`,
  },
  "ticket.reply": {
    key: "push.ticketReply",
    anonKey: "push.ticketReplyAnon",
    named: (n, who) => `${who} replied on #${n}`,
    anon: (n) => `New customer reply on #${n}`,
  },
  "sla.warning": {
    key: "push.slaWarning",
    anonKey: "push.slaWarning",
    named: (n) => `An SLA target is close on #${n}`,
    anon: (n) => `An SLA target is close on #${n}`,
  },
  "sla.breached": {
    key: "push.slaBreached",
    anonKey: "push.slaBreached",
    named: (n) => `An SLA target was missed on #${n}`,
    anon: (n) => `An SLA target was missed on #${n}`,
  },
  "request.reply": {
    key: "push.requestReply",
    anonKey: "push.requestReplyAnon",
    named: (n, who) => `${who} answered your request #${n}`,
    anon: (n) => `Your request #${n} has a reply`,
  },
};

export function buildNotification(
  event: PushEvent,
  ticketNumber: number,
  actorName: string | null,
): PushNotification {
  const spec = KEYS[event];
  const named = Boolean(actorName);
  return {
    event,
    locKey: named ? spec.key : spec.anonKey,
    locArgs: named ? [String(ticketNumber), actorName!] : [String(ticketNumber)],
    fallback: named ? spec.named(ticketNumber, actorName!) : spec.anon(ticketNumber),
    data: {
      kind: event,
      ticket_number: ticketNumber,
      surface: event === "request.reply" ? "portal" : "agent",
    },
  };
}
