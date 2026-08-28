import Link from "next/link";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, ticketForms, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { NewTicketForm } from "./new-ticket-form";

/**
 * AG-05 — New ticket (V2): the mockup draws a 600 px floating card over the
 * inbox. This is a real route, not an overlay, so the card keeps its size,
 * radius 18 and 7vh drop, and the scrim's job is done by the canvas behind it.
 */
export default async function NewTicketPage() {
  const t = await getT();
  const { tenant, agent } = await requireAgent();

  const [forms, agents, tagRows] = await Promise.all([
    db
      .select({ id: ticketForms.id, name: ticketForms.name })
      .from(ticketForms)
      .where(eq(ticketForms.tenantId, tenant.id))
      .orderBy(asc(ticketForms.position), asc(ticketForms.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), ne(users.status, "disabled")))
      .orderBy(asc(users.name)),
    db.execute(
      sql`select distinct unnest(tags) as tag from app.tickets where tenant_id = ${tenant.id} order by tag limit 20`,
    ) as unknown as Promise<{ tag: string }[]>,
  ]);

  return (
    <div
      className="grid h-full overflow-auto"
      style={{
        padding: "7vh 24px 40px",
        placeItems: "start center",
        background: "var(--canvas)",
      }}
    >
      <div
        className="ohd-rise w-full overflow-hidden"
        style={{
          maxWidth: 600,
          borderRadius: 18,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          boxShadow: "0 18px 48px rgba(13,28,23,.10)",
        }}
      >
        {/* Card header */}
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
            {t("app.newTicket.title")}
          </h1>
          <span className="flex-1" />
          <Link
            href="/app/tickets"
            title={t("app.newTicket.close")}
            style={{ color: "var(--ink-3)", fontSize: 15 }}
          >
            ✕
          </Link>
        </div>

        <NewTicketForm
          forms={forms}
          agents={agents}
          tags={tagRows.map((r) => String(r.tag))}
          meId={agent.id}
        />
      </div>
    </div>
  );
}
