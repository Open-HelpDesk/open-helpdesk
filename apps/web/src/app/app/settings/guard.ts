import { requireAgent, type CurrentAgent } from "@/lib/session";

/** Garde des server actions de l'administration : Owner/Admin uniquement. */
export async function requireManager(): Promise<CurrentAgent> {
  const current = await requireAgent();
  if (current.agent.role !== "owner" && current.agent.role !== "admin") {
    throw new Error("Réservé aux rôles Owner et Admin.");
  }
  return current;
}
