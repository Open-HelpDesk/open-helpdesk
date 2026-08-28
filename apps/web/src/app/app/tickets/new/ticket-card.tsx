import Link from "next/link";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, ticketForms, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { NewTicketForm } from "./new-ticket-form";

/**
 * AG-05 card — header + form, without deciding what it floats on.
 *
 * Two routes render it: the modal one (@modal/(.)new), over the inbox, and the
 * page one (new/page.tsx) for a direct hit or a refresh. Sharing the card is
 * what keeps those two from drifting.
 */
export async function NewTicketCard() {
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
      className="ohd-rise w-full overflow-hidden"
      style={{
        maxWidth: 600,
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
  );
}
