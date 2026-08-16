export type { InboundEmail, IngestResult, MailTransport, OutgoingEmail } from "./types";
export { ingestEmail } from "./ingest";
export { consoleTransport, getTransport, resendTransport, sendTicketReplyEmail } from "./send";
