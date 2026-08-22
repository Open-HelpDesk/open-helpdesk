/**
 * BullMQ queues:
 * - sla-timers    : SLA deadline evaluation (T-30 min, breach, escalation)
 * - mail-ingest   : inbound email pipeline → parsing → ticket (packages/mail)
 * - mail-send     : outbound sending with retries (email_deliveries log)
 * - imap-poll     : collection from the connected IMAP mailboxes (ST-03)
 * - automations   : time-based rules (follow-ups, auto-close at D+4)
 * - housekeeping  : purges (SsoAuthEvent 90 d, ticket trash 30 d, domain recheck 24 h)
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
