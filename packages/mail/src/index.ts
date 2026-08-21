export type {
  InboundEmail,
  IngestResult,
  MailKind,
  MailTransport,
  OutgoingEmail,
} from "./types";
export { ingestEmail } from "./ingest";
export {
  PROVIDER_META,
  SMTP_PRESETS,
  brevoTransport,
  consoleTransport,
  mailjetTransport,
  resendTransport,
  smtpTransport,
  type MailProvider,
  type SmtpConfig,
} from "./providers";
export {
  getEmailSettings,
  resolveMailConfig,
  sendInstanceEmail,
  transportFor,
  type EmailSettingsRow,
  type ResolvedMailConfig,
} from "./settings";
export {
  MAIL_SEND_QUEUE,
  deliverEmail,
  sendTenantEmail,
  type MailSendJob,
  type SendTenantEmailInput,
  type SendTenantEmailResult,
} from "./outbox";
export { dnsRecordsFor, domainOf, type DnsRecord } from "./dns";
export { sendTicketReplyEmail } from "./send";
export {
  pollAllImapMailboxes,
  pollImapMailbox,
  verifyImapMailbox,
  type ImapPollResult,
  type MailboxRow,
} from "./imap";
export { parseBrevoInbound, parseMailjetInbound } from "./inbound-adapters";
