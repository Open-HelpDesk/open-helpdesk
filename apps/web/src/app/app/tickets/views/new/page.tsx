import Link from "next/link";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, teams, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { ViewBuilder } from "./view-builder";

/**
 * newview — the view builder, and the repair of a dead link: the V2 inbox rail
 * has shipped a "+ New view" button pointing at this route since the inbox
 * landed, and the route did not exist.
 *
 * The five fields it offers are exactly the five the reader evaluates
 * (lib/data.ts, teamViewWhere). The mockup also draws "Last reply — from the
 * customer, for over 2 h" and a "Group by" select: neither exists in the engine,
 * and a condition silently dropped would give a view that does not hold what its
 * own definition says. So they are not offered.
 *
 * The operator column is a label, not a select: which operator applies follows
 * from the field ("is among" for the multi-value ones, "is" for the others), and
 * a select with one option is a control that pretends to be a choice.
 */
export default async function NewViewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getT();
  const { tenant, agent } = await requireAgent();
  const { error } = await searchParams;

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
      className="grid h-full overflow-auto"
      style={{
        padding: "6vh 24px 40px",
        placeItems: "start center",
        background: "var(--canvas)",
      }}
    >
      <div
        className="ohd-rise w-full overflow-hidden"
        style={{
          maxWidth: 640,
          borderRadius: 18,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          boxShadow: "0 18px 48px rgba(13,28,23,.10)",
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
          nameError={error === "name"}
        />
      </div>
    </div>
  );
}
