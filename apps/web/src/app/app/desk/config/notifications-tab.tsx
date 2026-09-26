/**
 * SD-A9 → Notifications: who hears about what, on which channel.
 *
 * Only email is a real switch. The product has no chat delivery (no Slack or
 * Teams integration sends anything today), so that column shows as not
 * available; the portal reads the state itself, so it is always on. Neither is
 * drawn as a switch that would switch nothing (doctrine: displayed claims are
 * true). The stored matrix keeps its chat values for the day chat ships.
 */
import { NotificationMatrix } from "@/components/desk/config/notification-matrix";

export function NotificationsTab() {
  return <NotificationMatrix />;
}
