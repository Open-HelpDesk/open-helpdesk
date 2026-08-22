import Link from "next/link";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, ticketForms, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { NewTicketForm } from "./new-ticket-form";

/**
 * AG-05 — New ticket (agent space design): centered 720 px card radius 12,
 * real contact combobox, Subject/Form grid, description with toolbar,
 * 4 selects, "Send the reply by email" callout, sunk footer.
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
      style={{ padding: 26, placeItems: "start center", background: "var(--canvas)" }}
    >
      <div
        className="ohd-rise w-full overflow-hidden"
        style={{
          maxWidth: 720,
          borderRadius: 12,
          background: "var(--panel)",
          border: "1px solid var(--line)",
        }}
      >
        {/* Card header */}
        <div
          className="flex items-center border-b"
          style={{ padding: "14px 18px", borderColor: "var(--line)" }}
        >
          <h1 style={{ fontSize: 15, fontWeight: 600 }}>{t("app.newTicket.title")}</h1>
          <span className="flex-1" />
          <Link
            href="/app/tickets"
            title={t("app.newTicket.close")}
            style={{ color: "var(--ink-3)" }}
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
