import { requireAgent, type CurrentAgent } from "@/lib/session";
import { getT } from "@/i18n/server";

/** Garde des server actions de l'administration : Owner/Admin uniquement. */
export async function requireManager(): Promise<CurrentAgent> {
  const current = await requireAgent();
  if (current.agent.role !== "owner" && current.agent.role !== "admin") {
    const t = await getT();
    throw new Error(t("app.settings.shell.managerOnly"));
  }
  return current;
}
