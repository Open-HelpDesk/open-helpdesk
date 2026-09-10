/**
 * BullMQ queues:
 * - sla-timers    : SLA deadline evaluation (T-30 min, breach, escalation)
 * - mail-ingest   : inbound email pipeline → parsing → ticket (packages/mail)
 * - mail-send     : outbound sending with retries (email_deliveries log)
 * - imap-poll     : collection from the connected IMAP mailboxes (ST-03)
 * - automations   : time-based rules (follow-ups, auto-close at D+4)
 * - webhook-dispatch : outbound webhooks (ST-10), signed POST with retries
 * - push-dispatch : mobile notifications (MO-xx), APNs/FCM with retries
 * - housekeeping  : purges (SsoAuthEvent 90 d, ticket trash 30 d, domain recheck 24 h)
 * - import-run    : history import from another product (packages/import)
 * - ai-sweep      : the assistant's 72-hour settlement (ee/ai) — a deflection
 *                   whose window has passed becomes confirmed, one a ticket
 *                   followed gives its credit back
 * - ai-index      : the assistant's knowledge layer (ee/ai) — published
 *                   articles, macros and resolved tickets, embedded once and
 *                   compared in-app. Without this pass the layer stays empty
 *                   and every draft refuses for lack of a source.
 */
export const QUEUE_NAMES = [
  "sla-timers",
  "mail-ingest",
  "mail-send",
  "imap-poll",
  "automations",
  "webhook-dispatch",
  "push-dispatch",
  "housekeeping",
  "import-run",
  "ai-sweep",
  "ai-index",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * Job options shared by every periodic sweep.
 *
 * Why retries, and why this many. BullMQ defaults to a single attempt, so any
 * transient error puts the job in `failed` for good. Measured on staging: an
 * `ai-sweep` tick fired while the containers were being recreated by a deploy,
 * lost its connection, and stayed failed — which lit `QueueJobsFailing` and
 * kept it lit. An alert that every deploy can turn on permanently gets ignored
 * within a week, and we are back to the blindness the alert was built to cure.
 *
 * Six attempts with an exponential backoff from 15 s wait 15 + 30 + 60 + 120 +
 * 240 s between them, so about **7 min 45** before giving up — longer than a
 * deploy takes to put Postgres and Redis back. What survives that is a real
 * failure, so `failed` becoming non-empty means something, which is the whole
 * point of watching it.
 *
 * The count is six and not five because the test computes that window and
 * asserts it: five attempts only buy 3 min 45, which is shorter than a slow
 * deploy. The comment claiming "about eight minutes" was written before the
 * arithmetic was checked, and the assertion is what caught it.
 *
 * All these sweeps are idempotent by construction (they read state and act on
 * what they find), so replaying one is free. That is what makes retrying safe
 * here, and it is the reason to state it rather than leave it implied.
 *
 * It lives here, next to the queue names, so it can be asserted by a test:
 * the entry point that uses it builds workers on import.
 */
export const SWEEP_JOB_OPTS = {
  attempts: 6,
  backoff: { type: "exponential" as const, delay: 15_000 },
  /*
   * Bound the completed set. Nothing removed them, and `sla-timers` alone adds
   * 1 440 entries a day: Redis grew for as long as the worker ran, invisibly,
   * because a queue that works looks exactly like a queue that leaks.
   *
   * Failures are NOT auto-removed on purpose: they are the metric. Dropping
   * them after an age would silence the alert instead of answering it.
   */
  removeOnComplete: { count: 200 },
} as const;
