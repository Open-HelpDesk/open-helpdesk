import { requireAgent, isManager } from "@/lib/session";
import { catalogueAdmin } from "@/lib/desk/it-data";
import { AppsAdmin } from "@/components/desk/it/apps-admin";

/** SD-A2 — the application catalogue. Everyone in the section reads it; owners and admins change it. */
export default async function DeskAppsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant, agent } = await requireAgent();
  const [data, sp] = await Promise.all([catalogueAdmin(tenant.id), searchParams]);
  const appId = typeof sp.app === "string" ? sp.app : null;
  return <AppsAdmin data={data} canEdit={isManager(agent.role)} initialAppId={appId} />;
}
