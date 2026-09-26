/**
 * The service desk as the web app sees it (spec 19).
 *
 * Importing from here — never from "@openhelpdesk/desk" directly — guarantees
 * the ee/ extensions are registered before any desk function runs: the core
 * alone behaves as the AGPL edition (manual provisioning, no budget, no
 * separation of duties). Registration is a side effect of loading this module.
 */
import { registerDeskExtensions, registerDeskTicketHooks } from "@openhelpdesk/desk";
import { eeDeskExtensions } from "@openhelpdesk/ee-desk";
import { onTicketCreated } from "@openhelpdesk/rules";

registerDeskExtensions(eeDeskExtensions);
// A desk request is a ticket: the same triggers and SLA policies run on it.
registerDeskTicketHooks({ onTicketCreated });

export * from "@openhelpdesk/desk";
