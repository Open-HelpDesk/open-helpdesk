import type { DeskExtensions } from "@openhelpdesk/desk";
import { circuitExtensions } from "./extensions/circuit";
import { provisioningExtensions } from "./extensions/provisioning";

/** Registered by apps/web and apps/worker at start-up — see packages/desk/src/extensions.ts. */
export const eeDeskExtensions: DeskExtensions = { ...circuitExtensions, ...provisioningExtensions };
