import Link from "next/link";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, teams, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { ViewBuilder } from "./view-builder";

/**
 * newview card — header + builder, without deciding what it floats on.
 * Rendered by the modal route (over the inbox) and by the page route (direct hit).
 */
export async function NewViewCard({ nameError }: { nameError: boolean }) {
  const t = await getT();
  const { tenant, agent } = await requireAgent();

  const [agentRows, teamRows, tagRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), ne(users.status, "disabled")))
      .orderBy(asc(users.name)),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.tenantId, tenant.id))
      .orderBy(asc(teams.name)),
    db.execute(
      sql`select distinct unnest(tags) as tag from app.tickets where tenant_id = ${tenant.id} order by tag limit 40`,
    ) as unknown as Promise<{ tag: string }[]>,
  ]);

  return (
    <div
      className="ohd-rise w-full overflow-hidden"
      style={{
        maxWidth: 640,
        borderRadius: 18,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        boxShadow: "0 32px 80px rgba(0,0,0,.35)",
      }}
    >
      <div
        className="flex items-center"
        style={{ gap: 10, padding: "15px 20px", borderBottom: "1px solid var(--line)" }}
      >
        <h1
          style={{
            fontFamily: "var(--font-title)",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "-.01em",
          }}
        >
          {t("app.views.newTitle")}
        </h1>
        <span className="flex-1" />
        <Link href="/app/tickets" style={{ color: "var(--ink-3)", fontSize: 15 }}>
          ✕
        </Link>
      </div>

      <ViewBuilder
        agents={agentRows.filter((a) => a.id !== agent.id)}
        me={{ id: agent.id, name: agent.name }}
        teams={teamRows}
        tags={tagRows.map((r) => String(r.tag))}
        nameError={nameError}
      />
    </div>
  );
}
