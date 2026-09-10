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
