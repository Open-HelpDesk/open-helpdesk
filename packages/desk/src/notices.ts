/**
 * Notifications sent on behalf of ee/ modules, so they reuse the desk's
 * outbox, language and configuration matrix without depending on
 * @openhelpdesk/mail themselves.
 *
 * Call it AFTER the caller's transaction has committed: the emails leave at once.
 */
import type { DeskNotificationEvent } from "./config";
import { Effects, inTenant, loadConfig, tenantInfo } from "./internal";
import { domainT } from "./i18n";
import { queueNotification } from "./notify";

export type DeskNoticeParams = {
  /** An access review reminder to one reviewer (ee/desk remindReviewer). */
  review_reminder: {
    campaign: string;
    pendingCount: number;
    /** YYYY-MM-DD. */
    dueOn: string;
    /** Where the button leads (tenant-relative). Defaults to the agent-space review screen. */
    path?: string;
  };
};

export type DeskNoticeEvent = keyof DeskNoticeParams;

/** Which column of the configuration matrix governs each notice. */
const MATRIX_EVENT: Record<DeskNoticeEvent, DeskNotificationEvent> = {
  review_reminder: "review_opened",
};

export async function notifyDesk<E extends DeskNoticeEvent>(
  tenantId: string,
  event: E,
  recipients: Array<{ email: string; name: string | null }>,
  params: DeskNoticeParams[E],
): Promise<{ sent: number }> {
  const fx = new Effects();
  const sent = await inTenant(tenantId, async (tx) => {
    const [tenant, config] = await Promise.all([tenantInfo(tx, tenantId), loadConfig(tx, tenantId)]);
    let n = 0;
    for (const to of recipients) {
      if (event === "review_reminder") {
        const p = params as DeskNoticeParams["review_reminder"];
        const date = domainT(tenant.locale).fmt.dateLong(new Date(`${p.dueOn}T12:00:00Z`));
        const queued = queueNotification(fx, tenant, config, {
          event: MATRIX_EVENT[event],
          to,
          subject: ["desk.domain.mail.reviewReminderSubject", { campaign: p.campaign }],
          lines: [["desk.domain.mail.reviewReminderBody", { campaign: p.campaign, count: p.pendingCount, date }]],
          button: ["desk.domain.mail.buttonReviewCampaign", p.path ?? "/app/desk/reviews"],
        });
        if (queued) n++;
      }
    }
    return n;
  });
  await fx.flush();
  return { sent };
}
