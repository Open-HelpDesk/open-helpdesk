/**
 * SD-A9 → Access and reviews → review campaigns (ee/, deskAccessReviews).
 *
 * Nothing opens a campaign on its own: the "next campaign" line is a due date
 * computed from the last one opened and the frequency, a reminder for the
 * admin — not a promise that the product will open it.
 */
import type { Entitlements } from "@openhelpdesk/config";
import { getT } from "@/i18n/server";
import { loadCatalogueCounts, loadLastReview } from "@/lib/desk/config-data";
import { LockedNote, Panel } from "@/components/desk/config/primitives";
import { ReviewsRows } from "./reviews-rows";

export default async function ReviewsSection({ tenantId, ent }: { tenantId: string; ent: Entitlements }) {
  const t = await getT();
  if (!ent.deskAccessReviews) {
    return (
      <Panel title={t("desk.cfg.rev.title")}>
        <LockedNote text={t("desk.cfg.rev.locked")} />
      </Panel>
    );
  }
  const [counts, last] = await Promise.all([loadCatalogueCounts(tenantId), loadLastReview(tenantId)]);
  return <ReviewsRows counts={counts} last={last} />;
}
