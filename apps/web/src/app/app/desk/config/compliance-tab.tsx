/**
 * SD-A9 → Compliance: how long the journal is kept, the evidence produced at
 * the close of a review, the SIEM webhook, and the frameworks it serves.
 */
import type { Entitlements } from "@openhelpdesk/config";
import { CompliancePanel } from "@/components/desk/config/compliance-panel";

export function ComplianceTab({ ent }: { ent: Entitlements }) {
  return <CompliancePanel reviewsEnabled={ent.deskAccessReviews} />;
}
