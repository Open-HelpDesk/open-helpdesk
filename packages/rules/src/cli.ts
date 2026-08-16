/**
 * Exécution manuelle des balayages (dev / debug) :
 *   pnpm --filter @openhelpdesk/rules run run sla
 *   pnpm --filter @openhelpdesk/rules run run scheduled
 * En production, c'est apps/worker qui les déclenche périodiquement.
 */
import { runScheduledRules } from "./engine";
import { scanSlaTimers } from "./sla";

const command = process.argv[2];

if (command === "sla") {
  const { warned, breached } = await scanSlaTimers();
  console.log(`sla-timers : ${warned} avertissement(s), ${breached} dépassement(s)`);
} else if (command === "scheduled") {
  const applied = await runScheduledRules();
  console.log(`règles horaires : ${applied} application(s)`);
} else {
  console.error("Usage : cli.ts <sla|scheduled>");
  process.exit(1);
}
process.exit(0);
