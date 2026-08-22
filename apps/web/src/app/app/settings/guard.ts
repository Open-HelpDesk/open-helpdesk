/**
 * Guard for the admin server actions.
 *
 * The definition lives in lib/session: the same role boundary also governs
 * writes to the knowledge base, which has nothing to do with the settings.
 * This module re-exports it so the existing imports keep working.
 */
export { requireManager } from "@/lib/session";
