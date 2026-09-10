/**
 * The 24-hour customer service window.
 *
 * WhatsApp lets a business reply freely for 24 hours after the customer's last
 * message. Outside that, a free-form message is refused and only a
 * pre-approved template goes through.
 *
 * This is the single most consequential rule of the channel, and it is not a
 * detail of the API — it changes how a support team works. Three consequences
 * the product has to carry rather than leave in a help page:
 *
 *  1. **An agent must know before typing.** Discovering it at send time means
 *     a written answer thrown away, and worse, an agent who believes they
 *     replied. Hence `remainingMs`, which the ticket screen can show as a
 *     countdown.
 *  2. **A resolution SLA longer than the window is unenforceable on this
 *     channel.** You can honour a 72-hour commitment and be unable to tell the
 *     customer. That is a policy decision, and the product's job is to make it
 *     visible, not to silently fail.
 *  3. **"I'll get back to you tomorrow" is a technical act**, not a courtesy:
 *     any message from the customer reopens the window.
 *
 * The clock starts at the customer's last INBOUND message. Our own replies do
 * not extend it — a rule that surprises everyone once and is the whole point of
 * the mechanism.
 */

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WindowState = {
  /** Can we send a free-form message right now? */
  open: boolean;
  /** Milliseconds left, 0 when closed. */
  remainingMs: number;
  /** When it closes, or null when it never opened (no inbound message yet). */
  closesAt: Date | null;
};

/**
 * The state of the window for a conversation.
 *
 * `null` for `lastInboundAt` means the customer has never written: the window
 * has not opened, so a free-form message is refused. That is not the same as
 * "expired", and the distinction shows in the agent's screen — nothing to
 * reopen versus something that closed.
 */
export function serviceWindow(lastInboundAt: Date | null | undefined, now = new Date()): WindowState {
  if (!lastInboundAt) return { open: false, remainingMs: 0, closesAt: null };
  const closesAt = new Date(lastInboundAt.getTime() + SERVICE_WINDOW_MS);
  const remainingMs = closesAt.getTime() - now.getTime();
  return remainingMs > 0
    ? { open: true, remainingMs, closesAt }
    : { open: false, remainingMs: 0, closesAt };
}

/**
 * What to do with an agent's reply when the window is closed.
 *
 * Three outcomes, and the difference between them is what the agent is told:
 *
 *   `queue_and_prompt`  keep the reply, and send the template that invites the
 *                       customer to write back — which re-opens the window.
 *   `queue_only`        keep the reply, send nothing: the customer was already
 *                       prompted since their last message. One prompt per
 *                       silence, not one per reply — templates are billed per
 *                       send, and four notifications for one unanswered thread
 *                       is how a channel gets muted by the person it was meant
 *                       to reach.
 *   `refuse`            no template configured, so there is no way to make the
 *                       customer write. The reply cannot leave, and saying so
 *                       is the only honest answer.
 *
 * Pure on purpose: this is the decision, and it was buried between two
 * database calls where it could only be exercised with a live conversation and
 * a Meta account.
 */
export type ClosedWindowPlan = "queue_and_prompt" | "queue_only" | "refuse";

export function closedWindowPlan(input: {
  templateName: string | null;
  templateLang: string | null;
  alreadyPrompted: boolean;
}): ClosedWindowPlan {
  // Les deux, pas l'un : Meta refuse un nom sans code de langue, et un code
  // sans nom ne désigne aucun gabarit.
  if (!input.templateName || !input.templateLang) return "refuse";
  return input.alreadyPrompted ? "queue_only" : "queue_and_prompt";
}
