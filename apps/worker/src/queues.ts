/**
 * Files BullMQ — specs/01 § 3 (jobs) :
 * - sla-timers    : évaluation des échéances SLA (T-30 min, dépassement, escalade)
 * - mail-ingest   : pipeline email entrant → parsing → ticket (packages/mail)
 * - mail-send     : envoi sortant avec retries (journal email_deliveries)
 * - imap-poll     : relève des boîtes IMAP connectées (ST-03)
 * - automations   : règles horaires (relances, clôture auto à J+4)
 * - housekeeping  : purges (SsoAuthEvent 90 j, corbeille tickets 30 j, revérif domaines 24 h)
 */
export const QUEUE_NAMES = [
  "sla-timers",
  "mail-ingest",
  "mail-send",
  "imap-poll",
  "automations",
  "housekeeping",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];
