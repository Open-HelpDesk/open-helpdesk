/**
 * Desk notifications, sent after commit and gated by the configuration
 * matrix (A9 → Notifications: event × channel).
 *
 *  - email  : through @openhelpdesk/mail (the tenant's outbox, retries, log),
 *             in the tenant's language (domain dictionary);
 *  - portal : nothing to send — the employee portal reads the state itself;
 *  - chat   : TODO(desk-chat) — the product has no outbound Slack/Teams
 *             mechanism yet (verified 26/09: nothing in packages/ or the
 *             worker posts to a chat). When it exists, post here with the
 *             same texts; until then the chat switch of the matrix has no
 *             effect, and the configuration screen must not claim otherwise.
 */
import { brandedHtml, brandedText, sendTenantEmail } from "@openhelpdesk/mail";
import type { DeskConfig, DeskNotificationEvent } from "./config";
import { domainT, type DeskDomainKey } from "./i18n";
import type { Effects, TenantInfo } from "./internal";

export type DeskMail = { tenantId: string; to: string; subject: string; text: string; html: string; ticketId?: string };

let sender: (mail: DeskMail) => Promise<unknown> = (mail) =>
  sendTenantEmail({ tenantId: mail.tenantId, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, ticketId: mail.ticketId, kind: "other" });

/** Test seam: capture emails instead of sending them. Returns the previous sender. */
export function setDeskMailSender(fn: (mail: DeskMail) => Promise<unknown>): (mail: DeskMail) => Promise<unknown> {
  const previous = sender;
  sender = fn;
  return previous;
}

type Params = Record<string, string | number>;

export type DeskNotification = {
  event: DeskNotificationEvent;
  to: { email: string; name: string | null };
  subject: [DeskDomainKey, Params];
  lines: Array<[DeskDomainKey, Params]>;
  /** Free text quoted under the lines (a justification, a comment). */
  quote?: string | null;
  button?: [DeskDomainKey, string];
  ticketId?: string;
};

export function tenantUrl(slug: string, path: string): string {
  const baseDomain = process.env.BASE_DOMAIN ?? "localhost:3000";
  const protocol = baseDomain.includes("localhost") ? "http" : "https";
  return `${protocol}://${slug}.${baseDomain}${path}`;
}

/** Renders a notification in the tenant language — exported for tests and previews. */
export function renderDeskMail(tenant: TenantInfo, n: DeskNotification): DeskMail {
  const t = domainT(tenant.locale);
  const subject = t(n.subject[0], n.subject[1]);
  const intro = n.lines.map(([k, p]) => t(k, p));
  if (n.quote?.trim()) intro.push(t("desk.domain.mail.quote", { text: n.quote.trim() }));
  const button = n.button ? { label: t(n.button[0], {}), url: tenantUrl(tenant.slug, n.button[1]) } : undefined;
  const mail = {
    title: subject,
    intro: [t("desk.domain.mail.greeting", { name: n.to.name ?? n.to.email }), ...intro],
    button,
    footnote: t("desk.domain.mail.footnote"),
    signature: tenant.name,
  };
  return { tenantId: tenant.id, to: n.to.email, subject, text: brandedText(mail), html: brandedHtml(mail), ticketId: n.ticketId };
}

/** Queues the notification for after commit, if the matrix allows its email channel. */
export function queueNotification(fx: Effects, tenant: TenantInfo, config: DeskConfig, n: DeskNotification): boolean {
  const channels = config.notifications[n.event];
  // channels.chat: see TODO(desk-chat) at the top of this file.
  if (!channels?.email || !n.to.email) return false;
  const mail = renderDeskMail(tenant, n);
  fx.add(() => sender(mail));
  return true;
}
