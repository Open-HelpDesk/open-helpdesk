/**
 * Manual execution of the sweeps (dev / debug):
 *   pnpm --filter @openhelpdesk/rules run run sla
 *   pnpm --filter @openhelpdesk/rules run run scheduled
 * In production, apps/worker is what triggers them periodically.
 */
import { runScheduledRules } from "./engine";
import { scanSlaTimers } from "./sla";

const command = process.argv[2];

if (command === "sla") {
  const { warned, breached } = await scanSlaTimers();
  console.log(`sla-timers: ${warned} warning(s), ${breached} breach(es)`);
} else if (command === "scheduled") {
  const applied = await runScheduledRules();
  console.log(`scheduled rules: ${applied} application(s)`);
} else {
  console.error("Usage: cli.ts <sla|scheduled>");
  process.exit(1);
}
process.exit(0);
